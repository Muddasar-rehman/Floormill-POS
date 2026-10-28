-- Sales: multi-item support. A single sale can now include several
-- different items (e.g. Atta + Maida in one invoice to a customer),
-- matching the header + line-items pattern already used for Gate Pass and
-- Production. Each line keeps its own independent Kaat/Watta deduction,
-- since different items in the same sale may have different quality/weight
-- adjustments. Purchases are intentionally left as single-item — this
-- change is scoped to Sales only, per what was asked.

-- The old single-row insert trigger no longer applies — insert logic now
-- lives entirely in fn_record_sale (an RPC, since a multi-line sale can't
-- be expressed as a single-row insert trigger).
drop trigger if exists trg_sale_insert on sales;

-- Move item-specific columns off the sales header into sale_items.
-- Generated columns (qty_kg, net_rate, total) must be dropped before the
-- base columns they're derived from.
alter table sales drop column total;
alter table sales drop column net_rate;
alter table sales drop column qty_kg;
alter table sales drop column item_id;
alter table sales drop column weighed_qty_kg;
alter table sales drop column kaat_pct;
alter table sales drop column rate;
alter table sales drop column watta_pct;
alter table sales drop column cogs;

-- total/cogs stay on the header as plain (non-generated) columns — they're
-- now aggregates across line items, maintained by fn_record_sale itself.
alter table sales add column total numeric not null default 0;
alter table sales add column cogs numeric not null default 0;

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  item_id uuid not null references items (id),
  weighed_qty_kg numeric not null check (weighed_qty_kg > 0),
  kaat_pct numeric not null default 0 check (kaat_pct >= 0 and kaat_pct < 100),
  qty_kg numeric generated always as (weighed_qty_kg * (1 - kaat_pct / 100.0)) stored,
  rate numeric not null check (rate > 0),
  watta_pct numeric not null default 0 check (watta_pct >= 0 and watta_pct < 100),
  net_rate numeric generated always as (rate * (1 - watta_pct / 100.0)) stored,
  total numeric generated always as (
    weighed_qty_kg * (1 - kaat_pct / 100.0) * rate * (1 - watta_pct / 100.0)
  ) stored,
  cogs numeric not null default 0
);

-- ---------------------------------------------------------------------------
-- fn_record_sale — creates the sale header, then for each line item: checks
-- stock, decrements it, computes that line's COGS from the item's current
-- avg_cost, and inserts the sale_items row. Totals are summed across lines
-- and written back onto the header, then a single ledger entry posts the
-- full invoice total to the customer's Khata.
-- ---------------------------------------------------------------------------
create or replace function fn_record_sale(
  p_customer_id uuid,
  p_warehouse_id uuid,
  p_date date,
  p_items jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_sale_id uuid;
  v_row jsonb;
  v_item_id uuid;
  v_weighed numeric;
  v_kaat numeric;
  v_rate numeric;
  v_watta numeric;
  v_net_qty numeric;
  v_line_total numeric;
  v_avg_cost numeric;
  v_current_stock numeric;
  v_line_cogs numeric;
  v_total numeric := 0;
  v_cogs numeric := 0;
  v_last_balance numeric;
begin
  if current_profile_role() not in ('owner_admin', 'sales_purchase_staff') then
    raise exception 'Not authorized to record sales';
  end if;

  insert into sales (customer_id, warehouse_id, date) values (p_customer_id, p_warehouse_id, p_date)
  returning id into v_sale_id;

  for v_row in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_row->>'item_id')::uuid;
    v_weighed := (v_row->>'weighed_qty_kg')::numeric;
    v_kaat := coalesce((v_row->>'kaat_pct')::numeric, 0);
    v_rate := (v_row->>'rate')::numeric;
    v_watta := coalesce((v_row->>'watta_pct')::numeric, 0);

    v_net_qty := v_weighed * (1 - v_kaat / 100.0);
    v_line_total := v_net_qty * v_rate * (1 - v_watta / 100.0);

    select avg_cost into v_avg_cost from items where id = v_item_id;
    select qty_kg into v_current_stock from item_stock
    where item_id = v_item_id and warehouse_id = p_warehouse_id
    for update;

    if v_current_stock is null or v_current_stock < v_net_qty then
      raise exception 'Insufficient stock for item %: available %, requested %', v_item_id, coalesce(v_current_stock, 0), v_net_qty;
    end if;

    update item_stock set qty_kg = qty_kg - v_net_qty
    where item_id = v_item_id and warehouse_id = p_warehouse_id;

    v_line_cogs := v_net_qty * coalesce(v_avg_cost, 0);

    insert into sale_items (sale_id, item_id, weighed_qty_kg, kaat_pct, rate, watta_pct, cogs)
    values (v_sale_id, v_item_id, v_weighed, v_kaat, v_rate, v_watta, v_line_cogs);

    v_total := v_total + v_line_total;
    v_cogs := v_cogs + v_line_cogs;
  end loop;

  update sales set total = v_total, cogs = v_cogs where id = v_sale_id;

  select balance_after into v_last_balance
  from ledger_entries where party_id = p_customer_id
  order by date desc, created_at desc limit 1;
  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = p_customer_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (p_customer_id, 'sale', v_sale_id, v_total, 0, coalesce(v_last_balance, 0) + v_total, p_date);

  return v_sale_id;
end;
$$;

grant execute on function fn_record_sale(uuid, uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Delete: reverse stock for every line item, remove the ledger entry, and
-- recompute the customer's balance. Runs BEFORE delete so sale_items (which
-- cascade-delete right after) are still readable here.
-- ---------------------------------------------------------------------------
create or replace function fn_sale_delete() returns trigger
language plpgsql security definer as $$
declare
  v_item record;
begin
  for v_item in select * from sale_items where sale_id = old.id
  loop
    update item_stock set qty_kg = qty_kg + v_item.qty_kg
    where item_id = v_item.item_id and warehouse_id = old.warehouse_id;
  end loop;

  delete from ledger_entries where txn_type = 'sale' and txn_id = old.id;
  perform fn_recompute_party_balance(old.customer_id);

  return old;
end;
$$;

drop trigger if exists trg_sale_delete on sales;
create trigger trg_sale_delete
before delete on sales
for each row execute function fn_sale_delete();

alter table sale_items enable row level security;

create policy sale_items_select on sale_items for select
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff', 'accountant'));
create policy sale_items_delete on sale_items for delete
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

-- No insert policy on sale_items or sales: writes go through fn_record_sale,
-- a security-definer function that checks the role itself.

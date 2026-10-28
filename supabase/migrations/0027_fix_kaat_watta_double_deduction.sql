-- ---------------------------------------------------------------------------
-- BUG FIX: Kaat and Watta were two independent, COMPOUNDING deductions:
--   qty_kg (net)  = weighed_qty_kg * (1 - kaat_pct/100)
--   net_rate      = rate * (1 - watta_pct/100)
--   total         = qty_kg * net_rate
-- That compounds a small kaat*watta cross-term into the bill. Example: a
-- 10000kg purchase at Kaat 1%, Watta 2%, rate 10/kg should bill 9700kg *
-- 10 = 97000, but the compounding formula produced 9900kg * 9.80 = 97020 —
-- 20 rupees too much, and increasingly wrong as either percentage grows.
--
-- Real mandi practice (per the handwritten purchase note this was checked
-- against): Kaat and Watta are both weight deductions taken off the SAME
-- weighed quantity and added together; the agreed rate is then charged in
-- full against whatever's left.
--   qty_kg (net)  = weighed_qty_kg * (1 - (kaat_pct + watta_pct)/100)
--   net_rate      = rate  (kept as a column for API/UI compatibility —
--                          Watta no longer discounts it)
--   total         = qty_kg * rate
--
-- This migration fixes the generated columns (which retroactively
-- recomputes qty_kg/net_rate/total for every existing purchases/sale_items
-- row), fixes fn_record_sale/fn_update_sale so new sales use the corrected
-- math, and then reconciles everything downstream that was derived from the
-- old totals: the sales header total, vendor/customer ledger entries and
-- running balances, and items.avg_cost / item_stock (recomputed via a full
-- chronological replay, same approach as 0023_gross_stock_quantity.sql).
--
-- Out of scope: per-transaction historical COGS (sale_items.cogs) is not
-- rewritten — same boundary 0023's replay already drew, since correcting it
-- would require re-deriving avg_cost at every historical point in time
-- rather than just its final value.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Purchases: fix generated columns.
-- ---------------------------------------------------------------------------
alter table purchases drop column total;
alter table purchases drop column net_rate;
alter table purchases drop column qty_kg;

alter table purchases add column qty_kg numeric generated always as (
  weighed_qty_kg * (1 - (kaat_pct + watta_pct) / 100.0)
) stored;
alter table purchases add column net_rate numeric generated always as (rate) stored;
alter table purchases add column total numeric generated always as (
  weighed_qty_kg * (1 - (kaat_pct + watta_pct) / 100.0) * rate
) stored;

-- ---------------------------------------------------------------------------
-- Sale line items: same fix.
-- ---------------------------------------------------------------------------
alter table sale_items drop column total;
alter table sale_items drop column net_rate;
alter table sale_items drop column qty_kg;

alter table sale_items add column qty_kg numeric generated always as (
  weighed_qty_kg * (1 - (kaat_pct + watta_pct) / 100.0)
) stored;
alter table sale_items add column net_rate numeric generated always as (rate) stored;
alter table sale_items add column total numeric generated always as (
  weighed_qty_kg * (1 - (kaat_pct + watta_pct) / 100.0) * rate
) stored;

-- ---------------------------------------------------------------------------
-- fn_record_sale / fn_update_sale: match the corrected formula going forward.
-- (Bodies otherwise unchanged from 0023_gross_stock_quantity.sql.)
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

    v_net_qty := v_weighed * (1 - (v_kaat + v_watta) / 100.0);
    v_line_total := v_net_qty * v_rate;

    select avg_cost into v_avg_cost from items where id = v_item_id;
    select qty_kg into v_current_stock from item_stock
    where item_id = v_item_id and warehouse_id = p_warehouse_id
    for update;

    if v_current_stock is null or v_current_stock < v_weighed then
      raise exception 'INSUFFICIENT_STOCK|%|%|%', v_item_id, coalesce(v_current_stock, 0), v_weighed;
    end if;

    update item_stock set qty_kg = qty_kg - v_weighed
    where item_id = v_item_id and warehouse_id = p_warehouse_id;

    v_line_cogs := v_weighed * coalesce(v_avg_cost, 0);

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

create or replace function fn_update_sale(
  p_sale_id uuid,
  p_customer_id uuid,
  p_warehouse_id uuid,
  p_date date,
  p_items jsonb
) returns void
language plpgsql security definer as $$
declare
  v_old_customer_id uuid;
  v_old_warehouse_id uuid;
  v_item record;
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
begin
  if current_profile_role() not in ('owner_admin', 'sales_purchase_staff') then
    raise exception 'Not authorized to record sales';
  end if;

  select customer_id, warehouse_id into v_old_customer_id, v_old_warehouse_id from sales where id = p_sale_id;
  if v_old_customer_id is null then
    raise exception 'Sale not found';
  end if;

  for v_item in select * from sale_items where sale_id = p_sale_id
  loop
    update item_stock set qty_kg = qty_kg + v_item.weighed_qty_kg
    where item_id = v_item.item_id and warehouse_id = v_old_warehouse_id;
  end loop;

  delete from sale_items where sale_id = p_sale_id;
  delete from ledger_entries where txn_type = 'sale' and txn_id = p_sale_id;

  for v_row in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_row->>'item_id')::uuid;
    v_weighed := (v_row->>'weighed_qty_kg')::numeric;
    v_kaat := coalesce((v_row->>'kaat_pct')::numeric, 0);
    v_rate := (v_row->>'rate')::numeric;
    v_watta := coalesce((v_row->>'watta_pct')::numeric, 0);

    v_net_qty := v_weighed * (1 - (v_kaat + v_watta) / 100.0);
    v_line_total := v_net_qty * v_rate;

    select avg_cost into v_avg_cost from items where id = v_item_id;
    select qty_kg into v_current_stock from item_stock
    where item_id = v_item_id and warehouse_id = p_warehouse_id
    for update;

    if v_current_stock is null or v_current_stock < v_weighed then
      raise exception 'Insufficient stock for item %: available %, requested %', v_item_id, coalesce(v_current_stock, 0), v_weighed;
    end if;

    update item_stock set qty_kg = qty_kg - v_weighed
    where item_id = v_item_id and warehouse_id = p_warehouse_id;

    v_line_cogs := v_weighed * coalesce(v_avg_cost, 0);

    insert into sale_items (sale_id, item_id, weighed_qty_kg, kaat_pct, rate, watta_pct, cogs)
    values (p_sale_id, v_item_id, v_weighed, v_kaat, v_rate, v_watta, v_line_cogs);

    v_total := v_total + v_line_total;
    v_cogs := v_cogs + v_line_cogs;
  end loop;

  update sales set customer_id = p_customer_id, warehouse_id = p_warehouse_id, date = p_date, total = v_total, cogs = v_cogs
  where id = p_sale_id;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (p_customer_id, 'sale', p_sale_id, v_total, 0, 0, p_date);

  perform fn_recompute_party_balance(v_old_customer_id);
  if p_customer_id <> v_old_customer_id then
    perform fn_recompute_party_balance(p_customer_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reconcile existing records now that purchases.total / sale_items.total
-- have already been recomputed in place by the ALTER TABLEs above.
-- ---------------------------------------------------------------------------

-- Sales header total is a plain (non-generated) aggregate — resync it to
-- the corrected sum of its (now-fixed) line totals.
update sales s
set total = coalesce((select sum(si.total) from sale_items si where si.sale_id = s.id), 0);

-- Ledger entries were posted with the old totals at insert time — resync
-- credit/debit to the corrected purchases.total / sales.total.
update ledger_entries le
set credit = p.total
from purchases p
where le.txn_type = 'purchase' and le.txn_id = p.id and le.credit is distinct from p.total;

update ledger_entries le
set debit = s.total
from sales s
where le.txn_type = 'sale' and le.txn_id = s.id and le.debit is distinct from s.total;

-- Replay every party's ledger chain so balance_after (and therefore Khata /
-- AP-AR / Trial Balance / Balance Sheet) reflects the corrected amounts.
do $$
declare
  v_party record;
begin
  for v_party in select id from parties loop
    perform fn_recompute_party_balance(v_party.id);
  end loop;
end $$;

-- items.avg_cost was built incrementally off purchases.total at each
-- historical insert, so it's now stale too — rebuild item_stock and
-- avg_cost from scratch by replaying every event in chronological order,
-- same approach as the backfill in 0023_gross_stock_quantity.sql (which
-- this repeats verbatim; stock quantities are unaffected by this fix since
-- they already move by weighed_qty_kg, not qty_kg — only avg_cost, which is
-- cost-basis-dependent, actually changes here).
do $$
declare
  r record;
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
begin
  update item_stock set qty_kg = 0;
  update items set avg_cost = 0;

  for r in
    select date as ev_date, created_at as ev_created_at, item_id, warehouse_id,
           weighed_qty_kg as qty_delta, total as cost_basis
    from purchases
    union all
    select s.date, s.created_at, si.item_id, s.warehouse_id, -si.weighed_qty_kg, null
    from sale_items si join sales s on s.id = si.sale_id
    union all
    select pb.date, pb.created_at, pi.item_id, pb.warehouse_id, -pi.qty_kg, null
    from production_inputs pi join production_batches pb on pb.id = pi.batch_id
    union all
    select pb.date, pb.created_at, po.item_id, pb.warehouse_id, po.qty_kg, po.qty_kg * po.rate
    from production_outputs po join production_batches pb on pb.id = po.batch_id
    union all
    select date, created_at, item_id, warehouse_id, qty_delta_kg, null
    from stock_adjustments
    order by ev_date, ev_created_at
  loop
    if r.cost_basis is not null then
      select coalesce(sum(qty_kg), 0) into v_old_qty from item_stock where item_id = r.item_id;
      select avg_cost into v_old_avg from items where id = r.item_id;
      if (v_old_qty + r.qty_delta) = 0 then
        v_new_avg := 0;
      else
        v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + r.cost_basis) / (v_old_qty + r.qty_delta);
      end if;
      update items set avg_cost = v_new_avg where id = r.item_id;
    end if;

    insert into item_stock (item_id, warehouse_id, qty_kg)
    values (r.item_id, r.warehouse_id, r.qty_delta)
    on conflict (item_id, warehouse_id) do update set qty_kg = item_stock.qty_kg + excluded.qty_kg;
  end loop;
end $$;

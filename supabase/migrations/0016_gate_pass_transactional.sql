-- Gate Pass becomes the entry point for goods movement: recording a Gate
-- Pass now creates the real underlying Purchase (direction = 'in') or Sale
-- (direction = 'out'), which updates stock and posts the Khata — reusing
-- the exact same triggers/RPCs Purchases and Sales already use, rather than
-- duplicating that logic here.
--
-- 'in'  → each item becomes its own purchases row (purchases are single-item
--         by design), fired via a plain insert so the existing
--         fn_purchase_insert AFTER INSERT trigger does the stock/avg_cost/
--         ledger work automatically. gate_pass_items.purchase_id links each
--         line back to the purchase it created.
-- 'out' → all items go through fn_record_sale in one call (sales are
--         multi-item), and the resulting sale_id is stored on the gate
--         pass header.

alter table gate_passes add column party_id uuid references parties (id);

alter table gate_pass_items add column rate numeric;
alter table gate_pass_items add column kaat_pct numeric not null default 0;
alter table gate_pass_items add column watta_pct numeric not null default 0;
alter table gate_pass_items add column purchase_id uuid references purchases (id) on delete set null;

-- Deleting the linked purchase/sale (via the gate pass delete trigger below)
-- must not be blocked by these FKs — null them out instead of erroring.
alter table gate_passes drop constraint if exists gate_passes_sale_id_fkey;
alter table gate_passes add constraint gate_passes_sale_id_fkey
  foreign key (sale_id) references sales (id) on delete set null;

alter table gate_passes drop constraint if exists gate_passes_purchase_id_fkey;
alter table gate_passes add constraint gate_passes_purchase_id_fkey
  foreign key (purchase_id) references purchases (id) on delete set null;

-- ---------------------------------------------------------------------------
-- fn_record_gate_pass — creates the gate pass header, then for each item
-- either inserts a purchases row directly (direction = 'in') or collects
-- all items to hand to fn_record_sale in one call (direction = 'out').
-- ---------------------------------------------------------------------------
create or replace function fn_record_gate_pass(
  p_vehicle_number text,
  p_driver text,
  p_party_id uuid,
  p_warehouse_id uuid,
  p_direction text,
  p_date date,
  p_items jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_gate_pass_id uuid;
  v_party_name text;
  v_row jsonb;
  v_item_id uuid;
  v_weighed numeric;
  v_kaat numeric;
  v_rate numeric;
  v_watta numeric;
  v_purchase_id uuid;
  v_sale_id uuid;
begin
  if current_profile_role() not in ('owner_admin', 'warehouse_staff', 'sales_purchase_staff') then
    raise exception 'Not authorized to record a gate pass';
  end if;

  select name into v_party_name from parties where id = p_party_id;

  insert into gate_passes (vehicle_number, driver, party_id, party_name, warehouse_id, direction, date)
  values (p_vehicle_number, p_driver, p_party_id, v_party_name, p_warehouse_id, p_direction, p_date)
  returning id into v_gate_pass_id;

  if p_direction = 'in' then
    for v_row in select * from jsonb_array_elements(p_items)
    loop
      v_item_id := (v_row->>'item_id')::uuid;
      v_weighed := (v_row->>'weighed_qty_kg')::numeric;
      v_kaat := coalesce((v_row->>'kaat_pct')::numeric, 0);
      v_rate := (v_row->>'rate')::numeric;
      v_watta := coalesce((v_row->>'watta_pct')::numeric, 0);

      insert into purchases (vendor_id, item_id, warehouse_id, weighed_qty_kg, kaat_pct, rate, watta_pct, date)
      values (p_party_id, v_item_id, p_warehouse_id, v_weighed, v_kaat, v_rate, v_watta, p_date)
      returning id into v_purchase_id;

      insert into gate_pass_items (gate_pass_id, item_id, qty_kg, rate, kaat_pct, watta_pct, purchase_id)
      values (v_gate_pass_id, v_item_id, v_weighed, v_rate, v_kaat, v_watta, v_purchase_id);
    end loop;
  else
    select fn_record_sale(p_party_id, p_warehouse_id, p_date, p_items) into v_sale_id;

    for v_row in select * from jsonb_array_elements(p_items)
    loop
      insert into gate_pass_items (gate_pass_id, item_id, qty_kg, rate, kaat_pct, watta_pct)
      values (
        v_gate_pass_id,
        (v_row->>'item_id')::uuid,
        (v_row->>'weighed_qty_kg')::numeric,
        (v_row->>'rate')::numeric,
        coalesce((v_row->>'kaat_pct')::numeric, 0),
        coalesce((v_row->>'watta_pct')::numeric, 0)
      );
    end loop;

    update gate_passes set sale_id = v_sale_id where id = v_gate_pass_id;
  end if;

  return v_gate_pass_id;
end;
$$;

grant execute on function fn_record_gate_pass(text, text, uuid, uuid, text, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Deleting a gate pass now also reverses whatever it created: each linked
-- purchase (direction = 'in') or the linked sale (direction = 'out') gets
-- deleted, which fires their own existing delete triggers to reverse stock,
-- the ledger, and avg_cost. Runs BEFORE delete so gate_pass_items (which
-- cascade-delete right after) are still readable here.
-- ---------------------------------------------------------------------------
create or replace function fn_gate_pass_delete() returns trigger
language plpgsql security definer as $$
declare
  v_item record;
begin
  if old.direction = 'in' then
    for v_item in select distinct purchase_id from gate_pass_items where gate_pass_id = old.id and purchase_id is not null
    loop
      delete from purchases where id = v_item.purchase_id;
    end loop;
  elsif old.direction = 'out' and old.sale_id is not null then
    delete from sales where id = old.sale_id;
  end if;

  return old;
end;
$$;

create trigger trg_gate_pass_delete
before delete on gate_passes
for each row execute function fn_gate_pass_delete();

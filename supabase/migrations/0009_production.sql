-- Production — converting raw materials (e.g. wheat) into finished goods
-- (e.g. Atta, Maida, Suji, Choker/bran) in a single batch. A batch consumes
-- one or more input items and yields one or more output items, all at a
-- single warehouse. Output cost/rate is entered manually per item (per the
-- owner's choice — not auto-derived from input cost), and blended into that
-- item's existing avg_cost using the same weighted-average approach used for
-- purchases.

create table production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no bigserial,
  warehouse_id uuid not null references warehouses (id),
  date date not null default current_date,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table production_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references production_batches (id) on delete cascade,
  item_id uuid not null references items (id),
  qty_kg numeric not null check (qty_kg > 0)
);

create table production_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references production_batches (id) on delete cascade,
  item_id uuid not null references items (id),
  qty_kg numeric not null check (qty_kg > 0),
  rate numeric not null check (rate >= 0)
);

-- ---------------------------------------------------------------------------
-- fn_record_production_batch — records a batch atomically: consumes input
-- stock, produces output stock, and updates each output item's avg_cost.
-- Runs as one RPC call rather than the per-row-trigger pattern used for
-- purchases/sales, since a batch involves multiple input and output rows.
-- ---------------------------------------------------------------------------
create or replace function fn_record_production_batch(
  p_warehouse_id uuid,
  p_date date,
  p_notes text,
  p_inputs jsonb,
  p_outputs jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_rate numeric;
  v_current_stock numeric;
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
begin
  if current_profile_role() not in ('owner_admin', 'warehouse_staff') then
    raise exception 'Not authorized to record production';
  end if;

  insert into production_batches (warehouse_id, date, notes)
  values (p_warehouse_id, p_date, p_notes)
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(p_inputs)
  loop
    v_item_id := (v_row->>'item_id')::uuid;
    v_qty := (v_row->>'qty_kg')::numeric;

    select qty_kg into v_current_stock from item_stock
    where item_id = v_item_id and warehouse_id = p_warehouse_id
    for update;

    if v_current_stock is null or v_current_stock < v_qty then
      raise exception 'Insufficient stock for input item %: available %, requested %', v_item_id, coalesce(v_current_stock, 0), v_qty;
    end if;

    insert into production_inputs (batch_id, item_id, qty_kg) values (v_batch_id, v_item_id, v_qty);

    update item_stock set qty_kg = qty_kg - v_qty
    where item_id = v_item_id and warehouse_id = p_warehouse_id;
  end loop;

  for v_row in select * from jsonb_array_elements(p_outputs)
  loop
    v_item_id := (v_row->>'item_id')::uuid;
    v_qty := (v_row->>'qty_kg')::numeric;
    v_rate := (v_row->>'rate')::numeric;

    insert into production_outputs (batch_id, item_id, qty_kg, rate) values (v_batch_id, v_item_id, v_qty, v_rate);

    select avg_cost into v_old_avg from items where id = v_item_id for update;
    select coalesce(sum(qty_kg), 0) into v_old_qty from item_stock where item_id = v_item_id;

    if (v_old_qty + v_qty) = 0 then
      v_new_avg := v_rate;
    else
      v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + (v_qty * v_rate)) / (v_old_qty + v_qty);
    end if;
    update items set avg_cost = v_new_avg where id = v_item_id;

    insert into item_stock (item_id, warehouse_id, qty_kg)
    values (v_item_id, p_warehouse_id, v_qty)
    on conflict (item_id, warehouse_id) do update set qty_kg = item_stock.qty_kg + excluded.qty_kg;
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function fn_record_production_batch(uuid, date, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Deleting a batch reverses everything: input stock is restored, output
-- stock is removed, and each output item's avg_cost is recomputed from its
-- remaining production_outputs rows (mirrors fn_purchase_delete's approach).
-- ---------------------------------------------------------------------------
create or replace function fn_production_batch_delete() returns trigger
language plpgsql security definer as $$
declare
  v_input record;
  v_output record;
  v_new_avg numeric;
  v_total_qty numeric;
  v_total_value numeric;
begin
  for v_input in select * from production_inputs where batch_id = old.id
  loop
    update item_stock set qty_kg = qty_kg + v_input.qty_kg
    where item_id = v_input.item_id and warehouse_id = old.warehouse_id;
  end loop;

  for v_output in select * from production_outputs where batch_id = old.id
  loop
    update item_stock set qty_kg = qty_kg - v_output.qty_kg
    where item_id = v_output.item_id and warehouse_id = old.warehouse_id;

    select coalesce(sum(qty_kg), 0), coalesce(sum(qty_kg * rate), 0)
    into v_total_qty, v_total_value
    from production_outputs
    where item_id = v_output.item_id and batch_id <> old.id;

    v_new_avg := case when v_total_qty = 0 then 0 else v_total_value / v_total_qty end;
    update items set avg_cost = v_new_avg where id = v_output.item_id;
  end loop;

  return old;
end;
$$;

create trigger trg_production_batch_delete
before delete on production_batches
for each row execute function fn_production_batch_delete();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table production_batches enable row level security;
alter table production_inputs enable row level security;
alter table production_outputs enable row level security;

create policy production_batches_select on production_batches for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy production_batches_delete on production_batches for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

create policy production_inputs_select on production_inputs for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy production_inputs_delete on production_inputs for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

create policy production_outputs_select on production_outputs for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy production_outputs_delete on production_outputs for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

-- No insert policies on production_batches/production_inputs/production_outputs:
-- all writes happen inside fn_record_production_batch, which runs as
-- security definer and checks the role itself.

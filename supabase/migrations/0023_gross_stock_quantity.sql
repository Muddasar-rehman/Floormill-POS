-- ---------------------------------------------------------------------------
-- Kaat/Watta become PURE BILLING deductions: they still reduce what the
-- vendor is paid / the customer is charged (purchases.total, sales.total,
-- ledger amounts — all untouched), but item_stock and items.avg_cost now
-- move by the full WEIGHED quantity, not the net-of-Kaat quantity. E.g. a
-- 100kg purchase with 4% Kaat still bills against 96kg, but stock now shows
-- 100kg instead of 96kg — that's the physical amount that actually arrived
-- (or, for a sale, actually left).
--
-- avg_cost is likewise now cost ÷ weighed kg instead of cost ÷ net kg, so
-- stock valuation (qty_kg × avg_cost) stays internally consistent with the
-- new, larger stock quantities. This changes cost-per-kg (and therefore
-- COGS/margins) slightly going forward.
--
-- The purchases.qty_kg / sales.qty_kg generated columns (net-of-Kaat) are
-- untouched — they still drive total/net_rate for billing. Only the
-- functions that move item_stock / items.avg_cost change.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Purchases: insert / update / delete
-- ---------------------------------------------------------------------------
create or replace function fn_purchase_insert() returns trigger
language plpgsql security definer as $$
declare
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
  v_last_balance numeric;
begin
  select avg_cost into v_old_avg from items where id = new.item_id for update;
  select coalesce(sum(qty_kg), 0) into v_old_qty from item_stock where item_id = new.item_id;

  if (v_old_qty + new.weighed_qty_kg) = 0 then
    v_new_avg := 0;
  else
    v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + new.total) / (v_old_qty + new.weighed_qty_kg);
  end if;
  update items set avg_cost = v_new_avg where id = new.item_id;

  insert into item_stock (item_id, warehouse_id, qty_kg)
  values (new.item_id, new.warehouse_id, new.weighed_qty_kg)
  on conflict (item_id, warehouse_id) do update set qty_kg = item_stock.qty_kg + excluded.qty_kg;

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.vendor_id
  order by date desc, created_at desc limit 1;

  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.vendor_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.vendor_id, 'purchase', new.id, 0, new.total, coalesce(v_last_balance, 0) + new.total, new.date);

  return new;
end;
$$;

create or replace function fn_purchase_delete() returns trigger
language plpgsql security definer as $$
declare
  v_new_avg numeric;
  v_total_qty numeric;
  v_total_value numeric;
begin
  update item_stock set qty_kg = qty_kg - old.weighed_qty_kg
  where item_id = old.item_id and warehouse_id = old.warehouse_id;

  select coalesce(sum(weighed_qty_kg), 0), coalesce(sum(total), 0)
  into v_total_qty, v_total_value
  from purchases where item_id = old.item_id and id <> old.id;

  v_new_avg := case when v_total_qty = 0 then 0 else v_total_value / v_total_qty end;
  update items set avg_cost = v_new_avg where id = old.item_id;

  delete from ledger_entries where txn_type = 'purchase' and txn_id = old.id;
  perform fn_recompute_party_balance(old.vendor_id);

  return old;
end;
$$;

create or replace function fn_purchase_update() returns trigger
language plpgsql security definer as $$
declare
  v_total_qty numeric;
  v_total_value numeric;
  v_cur_qty numeric;
  v_cur_avg numeric;
  v_new_avg numeric;
begin
  update item_stock set qty_kg = qty_kg - old.weighed_qty_kg
  where item_id = old.item_id and warehouse_id = old.warehouse_id;

  select coalesce(sum(weighed_qty_kg), 0), coalesce(sum(total), 0)
  into v_total_qty, v_total_value
  from purchases where item_id = old.item_id and id <> new.id;
  update items set avg_cost = case when v_total_qty = 0 then 0 else v_total_value / v_total_qty end
  where id = old.item_id;

  select avg_cost into v_cur_avg from items where id = new.item_id;
  select coalesce(sum(qty_kg), 0) into v_cur_qty from item_stock where item_id = new.item_id;

  if (v_cur_qty + new.weighed_qty_kg) = 0 then
    v_new_avg := 0;
  else
    v_new_avg := ((v_cur_qty * coalesce(v_cur_avg, 0)) + new.total) / (v_cur_qty + new.weighed_qty_kg);
  end if;
  update items set avg_cost = v_new_avg where id = new.item_id;

  insert into item_stock (item_id, warehouse_id, qty_kg)
  values (new.item_id, new.warehouse_id, new.weighed_qty_kg)
  on conflict (item_id, warehouse_id) do update set qty_kg = item_stock.qty_kg + excluded.qty_kg;

  update ledger_entries set party_id = new.vendor_id, credit = new.total, date = new.date
  where txn_type = 'purchase' and txn_id = new.id;

  perform fn_recompute_party_balance(old.vendor_id);
  if new.vendor_id <> old.vendor_id then
    perform fn_recompute_party_balance(new.vendor_id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales: record (RPC), delete, update (RPC)
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

create or replace function fn_sale_delete() returns trigger
language plpgsql security definer as $$
declare
  v_item record;
begin
  for v_item in select * from sale_items where sale_id = old.id
  loop
    update item_stock set qty_kg = qty_kg + v_item.weighed_qty_kg
    where item_id = v_item.item_id and warehouse_id = old.warehouse_id;
  end loop;

  delete from ledger_entries where txn_type = 'sale' and txn_id = old.id;
  perform fn_recompute_party_balance(old.customer_id);

  return old;
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

    v_net_qty := v_weighed * (1 - v_kaat / 100.0);
    v_line_total := v_net_qty * v_rate * (1 - v_watta / 100.0);

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
-- One-time backfill: rebuild item_stock and items.avg_cost from scratch by
-- replaying every existing purchase, sale, production batch, and stock
-- adjustment in chronological order under the corrected (gross-qty) rules,
-- so today's stock levels are right immediately rather than only for
-- transactions recorded from now on.
-- ---------------------------------------------------------------------------
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

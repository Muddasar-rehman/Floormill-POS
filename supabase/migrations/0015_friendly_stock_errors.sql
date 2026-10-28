-- The "insufficient stock" error raised by fn_record_sale and
-- fn_record_production_batch showed the raw item UUID and unrounded decimals
-- straight in a toast — unreadable for an end user. Switch to a structured,
-- pipe-delimited format the app can parse and re-render with the item's
-- actual name and formatted quantities. (Purchases/Gate Pass/etc. don't
-- raise this error since they don't stock-check against multiple lines the
-- same way, so this only touches these two functions.)

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
      raise exception 'INSUFFICIENT_STOCK|%|%|%', v_item_id, coalesce(v_current_stock, 0), v_net_qty;
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
      raise exception 'INSUFFICIENT_STOCK|%|%|%', v_item_id, coalesce(v_current_stock, 0), v_qty;
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

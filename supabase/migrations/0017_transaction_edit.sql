-- Editing support for the transactions that post to the Khata: Purchases,
-- Sales, Payments, and Receipts. The ledger itself stays derived-only (no
-- direct writes) — editing works by updating the source transaction, which
-- then re-syncs stock/avg_cost/bank balance and rewrites its own ledger
-- entry, then recomputes the affected part(y/ies)' running balance chain.

-- ---------------------------------------------------------------------------
-- Purchases: single-row update. Reverse the OLD stock/avg_cost effect, then
-- reapply as if it were a fresh purchase with the NEW values (same shape as
-- fn_purchase_insert/fn_purchase_delete), and rewrite the linked ledger
-- entry instead of inserting a new one.
-- ---------------------------------------------------------------------------
create policy purchases_update on purchases for update
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

create or replace function fn_purchase_update() returns trigger
language plpgsql security definer as $$
declare
  v_total_qty numeric;
  v_total_value numeric;
  v_cur_qty numeric;
  v_cur_avg numeric;
  v_new_avg numeric;
begin
  update item_stock set qty_kg = qty_kg - old.qty_kg
  where item_id = old.item_id and warehouse_id = old.warehouse_id;

  select coalesce(sum(qty_kg), 0), coalesce(sum(total), 0)
  into v_total_qty, v_total_value
  from purchases where item_id = old.item_id and id <> new.id;
  update items set avg_cost = case when v_total_qty = 0 then 0 else v_total_value / v_total_qty end
  where id = old.item_id;

  select avg_cost into v_cur_avg from items where id = new.item_id;
  select coalesce(sum(qty_kg), 0) into v_cur_qty from item_stock where item_id = new.item_id;

  if (v_cur_qty + new.qty_kg) = 0 then
    v_new_avg := new.net_rate;
  else
    v_new_avg := ((v_cur_qty * coalesce(v_cur_avg, 0)) + new.total) / (v_cur_qty + new.qty_kg);
  end if;
  update items set avg_cost = v_new_avg where id = new.item_id;

  insert into item_stock (item_id, warehouse_id, qty_kg)
  values (new.item_id, new.warehouse_id, new.qty_kg)
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

create trigger trg_purchase_update
after update on purchases
for each row execute function fn_purchase_update();

-- ---------------------------------------------------------------------------
-- Sales: multi-item, so editing goes through an RPC (like fn_record_sale)
-- rather than a plain table update. Reverses every existing line's stock
-- effect and the old ledger entry, replaces the sale_items with the new set,
-- rewrites the header, and re-posts the ledger entry.
-- ---------------------------------------------------------------------------
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
    update item_stock set qty_kg = qty_kg + v_item.qty_kg
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

    if v_current_stock is null or v_current_stock < v_net_qty then
      raise exception 'Insufficient stock for item %: available %, requested %', v_item_id, coalesce(v_current_stock, 0), v_net_qty;
    end if;

    update item_stock set qty_kg = qty_kg - v_net_qty
    where item_id = v_item_id and warehouse_id = p_warehouse_id;

    v_line_cogs := v_net_qty * coalesce(v_avg_cost, 0);

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

grant execute on function fn_update_sale(uuid, uuid, uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Payments / Receipts: single-row updates. Reverse the OLD bank effect (if
-- any), apply the NEW one, rewrite the ledger entry, recompute balance(s).
-- ---------------------------------------------------------------------------
create policy payments_update on payments for update
  using (current_profile_role() in ('owner_admin', 'accountant'));

create policy receipts_update on receipts for update
  using (current_profile_role() in ('owner_admin', 'accountant'));

create or replace function fn_payment_update() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  end if;
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  end if;

  update ledger_entries set party_id = new.vendor_id, debit = new.amount, date = new.date
  where txn_type = 'payment' and txn_id = new.id;

  perform fn_recompute_party_balance(old.vendor_id);
  if new.vendor_id <> old.vendor_id then
    perform fn_recompute_party_balance(new.vendor_id);
  end if;

  return new;
end;
$$;

create trigger trg_payment_update
after update on payments
for each row execute function fn_payment_update();

create or replace function fn_receipt_update() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  end if;
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  end if;

  update ledger_entries set party_id = new.customer_id, credit = new.amount, date = new.date
  where txn_type = 'receipt' and txn_id = new.id;

  perform fn_recompute_party_balance(old.customer_id);
  if new.customer_id <> old.customer_id then
    perform fn_recompute_party_balance(new.customer_id);
  end if;

  return new;
end;
$$;

create trigger trg_receipt_update
after update on receipts
for each row execute function fn_receipt_update();

-- Adds update/delete support for master data, and delete (with automatic
-- reversal of stock/avg-cost/ledger effects) for purchases and sales.

-- ---------------------------------------------------------------------------
-- Delete policies for master data (update policies already exist from 0001)
-- ---------------------------------------------------------------------------
create policy parties_delete on parties for delete
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

create policy items_delete on items for delete
  using (current_profile_role() = 'owner_admin');

create policy warehouses_delete on warehouses for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

create policy purchases_delete on purchases for delete
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

create policy sales_delete on sales for delete
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

-- ---------------------------------------------------------------------------
-- Helper: recompute the running balance_after chain for a party from scratch.
-- Both debit and credit add to balance_after in this schema's convention
-- (matches the posting logic in 0001_phase1.sql) since only one is ever
-- non-zero per row.
-- ---------------------------------------------------------------------------
create function fn_recompute_party_balance(p_party_id uuid) returns void
language plpgsql security definer as $$
declare
  v_balance numeric;
  r record;
begin
  select opening_balance into v_balance from parties where id = p_party_id;

  for r in
    select id, debit, credit from ledger_entries
    where party_id = p_party_id
    order by date, created_at
  loop
    v_balance := v_balance + r.debit + r.credit;
    update ledger_entries set balance_after = v_balance where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchase delete: reverse stock, recompute avg_cost from remaining
-- purchases for that item, remove the ledger entry, recompute vendor balance.
-- ---------------------------------------------------------------------------
create function fn_purchase_delete() returns trigger
language plpgsql security definer as $$
declare
  v_new_avg numeric;
  v_total_qty numeric;
  v_total_value numeric;
begin
  update item_stock set qty_kg = qty_kg - old.qty_kg
  where item_id = old.item_id and warehouse_id = old.warehouse_id;

  select coalesce(sum(qty_kg), 0), coalesce(sum(qty_kg * rate), 0)
  into v_total_qty, v_total_value
  from purchases where item_id = old.item_id and id <> old.id;

  v_new_avg := case when v_total_qty = 0 then 0 else v_total_value / v_total_qty end;
  update items set avg_cost = v_new_avg where id = old.item_id;

  delete from ledger_entries where txn_type = 'purchase' and txn_id = old.id;
  perform fn_recompute_party_balance(old.vendor_id);

  return old;
end;
$$;

create trigger trg_purchase_delete
after delete on purchases
for each row execute function fn_purchase_delete();

-- ---------------------------------------------------------------------------
-- Sale delete: reverse stock, remove the ledger entry, recompute customer
-- balance. avg_cost is unaffected by sales.
-- ---------------------------------------------------------------------------
create function fn_sale_delete() returns trigger
language plpgsql security definer as $$
begin
  update item_stock set qty_kg = qty_kg + old.qty_kg
  where item_id = old.item_id and warehouse_id = old.warehouse_id;

  delete from ledger_entries where txn_type = 'sale' and txn_id = old.id;
  perform fn_recompute_party_balance(old.customer_id);

  return old;
end;
$$;

create trigger trg_sale_delete
after delete on sales
for each row execute function fn_sale_delete();

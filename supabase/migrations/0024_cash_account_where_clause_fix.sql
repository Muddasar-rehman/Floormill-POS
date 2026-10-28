-- ---------------------------------------------------------------------------
-- BUG FIX: every `update cash_account set balance = ...` in
-- 0020_cash_account.sql and 0021_cash_ledger.sql was written without a WHERE
-- clause, since cash_account is a singleton table (only one row can ever
-- exist, enforced by cash_account_singleton_idx) so a WHERE felt redundant.
-- This database rejects any UPDATE with no WHERE clause at all ("UPDATE
-- requires a WHERE clause"), which broke every cash-sourced payment,
-- receipt, expense, Roznamcha entry, and cash ledger entry. Adding
-- `where true` — semantically identical for a one-row table, but satisfies
-- the requirement.
-- ---------------------------------------------------------------------------

create or replace function fn_expense_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance - new.amount where true;
  end if;
  return new;
end;
$$;

create or replace function fn_expense_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance + old.amount where true;
  end if;
  return old;
end;
$$;

create or replace function fn_payment_insert() returns trigger
language plpgsql security definer as $$
declare
  v_last_balance numeric;
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance - new.amount where true;
  end if;

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.vendor_id
  order by date desc, created_at desc limit 1;
  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.vendor_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.vendor_id, 'payment', new.id, new.amount, 0, coalesce(v_last_balance, 0) - new.amount, new.date);

  return new;
end;
$$;

create or replace function fn_payment_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance + old.amount where true;
  end if;
  delete from ledger_entries where txn_type = 'payment' and txn_id = old.id;
  perform fn_recompute_party_balance(old.vendor_id);
  return old;
end;
$$;

create or replace function fn_payment_update() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance + old.amount where true;
  end if;
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance - new.amount where true;
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

create or replace function fn_receipt_insert() returns trigger
language plpgsql security definer as $$
declare
  v_last_balance numeric;
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance + new.amount where true;
  end if;

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.customer_id
  order by date desc, created_at desc limit 1;
  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.customer_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.customer_id, 'receipt', new.id, 0, new.amount, coalesce(v_last_balance, 0) - new.amount, new.date);

  return new;
end;
$$;

create or replace function fn_receipt_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance - old.amount where true;
  end if;
  delete from ledger_entries where txn_type = 'receipt' and txn_id = old.id;
  perform fn_recompute_party_balance(old.customer_id);
  return old;
end;
$$;

create or replace function fn_receipt_update() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance - old.amount where true;
  end if;
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance + new.amount where true;
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

create or replace function fn_roznamcha_entry_insert() returns trigger
language plpgsql security definer as $$
declare
  v_payment_id uuid;
  v_receipt_id uuid;
  v_expense_id uuid;
begin
  if new.party_id is not null then
    if new.direction = 'kharcha' then
      insert into payments (vendor_id, amount, date, payment_source, bank_account_id, notes)
      values (new.party_id, new.amount, new.date, new.payment_source, new.bank_account_id, new.description)
      returning id into v_payment_id;
      update roznamcha_entries set linked_payment_id = v_payment_id where id = new.id;
    else
      insert into receipts (customer_id, amount, date, payment_source, bank_account_id, notes)
      values (new.party_id, new.amount, new.date, new.payment_source, new.bank_account_id, new.description)
      returning id into v_receipt_id;
      update roznamcha_entries set linked_receipt_id = v_receipt_id where id = new.id;
    end if;
  else
    if new.direction = 'kharcha' then
      insert into expenses (category, amount, date, payment_source, bank_account_id, description)
      values ('Roznamcha', new.amount, new.date, new.payment_source, new.bank_account_id, new.description)
      returning id into v_expense_id;
      update roznamcha_entries set linked_expense_id = v_expense_id where id = new.id;
    else
      if new.payment_source = 'bank' and new.bank_account_id is not null then
        update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
      elsif new.payment_source = 'cash' then
        update cash_account set balance = balance + new.amount where true;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function fn_roznamcha_entry_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.linked_payment_id is not null then
    delete from payments where id = old.linked_payment_id;
  elsif old.linked_receipt_id is not null then
    delete from receipts where id = old.linked_receipt_id;
  elsif old.linked_expense_id is not null then
    delete from expenses where id = old.linked_expense_id;
  elsif old.direction = 'aamdan' and old.party_id is null then
    if old.payment_source = 'bank' and old.bank_account_id is not null then
      update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
    elsif old.payment_source = 'cash' then
      update cash_account set balance = balance - old.amount where true;
    end if;
  end if;
  return old;
end;
$$;

create or replace function fn_cash_ledger_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.direction = 'in' then
    update cash_account set balance = balance + new.amount where true;
  else
    update cash_account set balance = balance - new.amount where true;
  end if;
  return new;
end;
$$;

create or replace function fn_cash_ledger_update() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'in' then
    update cash_account set balance = balance - old.amount where true;
  else
    update cash_account set balance = balance + old.amount where true;
  end if;
  if new.direction = 'in' then
    update cash_account set balance = balance + new.amount where true;
  else
    update cash_account set balance = balance - new.amount where true;
  end if;
  return new;
end;
$$;

create or replace function fn_cash_ledger_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'in' then
    update cash_account set balance = balance - old.amount where true;
  else
    update cash_account set balance = balance + old.amount where true;
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Re-run of the 0023 stock/avg_cost backfill: `update item_stock set qty_kg
-- = 0;` and `update items set avg_cost = 0;` had the exact same missing-
-- WHERE-clause problem, which means that backfill very likely errored out
-- and rolled back when 0023 was first run — the trigger-function fixes in
-- 0023 would still be live (correct for anything entered since), but actual
-- stock/avg_cost may still reflect pre-fix (net-of-Kaat) numbers. Re-running
-- this is safe/idempotent: it always resets and replays full history.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
begin
  update item_stock set qty_kg = 0 where true;
  update items set avg_cost = 0 where true;

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

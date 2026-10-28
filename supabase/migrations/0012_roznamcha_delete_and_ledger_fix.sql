-- ---------------------------------------------------------------------------
-- BUG FIX: fn_recompute_party_balance (from 0002_edit_delete.sql) summed
-- `debit + credit` blindly for every ledger_entries row. That's correct for
-- 'purchase' (credit-only, increases payable) and 'sale' (debit-only,
-- increases receivable), but 'payment' and 'receipt' rows also store a
-- positive amount in debit/credit respectively even though they should
-- *decrease* the balance (see fn_payment_insert/fn_receipt_insert in
-- 0004_financial_core.sql, which correctly subtract at insert time).
--
-- Net effect: any time fn_recompute_party_balance ran on a party that had
-- both a purchase/sale deletion AND at least one payment/receipt, every
-- payment/receipt after the recompute point got added instead of
-- subtracted — silently corrupting that party's ledger balance chain
-- (which the Khata, AP/AR, Trial Balance, and Balance Sheet all depend on).
-- Fixing the function here, then repairing all existing balances below.
-- ---------------------------------------------------------------------------
create or replace function fn_recompute_party_balance(p_party_id uuid) returns void
language plpgsql security definer as $$
declare
  v_balance numeric;
  v_delta numeric;
  r record;
begin
  select opening_balance into v_balance from parties where id = p_party_id;

  for r in
    select id, txn_type, debit, credit from ledger_entries
    where party_id = p_party_id
    order by date, created_at
  loop
    v_delta := case r.txn_type
      when 'purchase' then r.credit
      when 'sale' then r.debit
      when 'payment' then -r.debit
      when 'receipt' then -r.credit
      else r.debit + r.credit
    end;
    v_balance := v_balance + v_delta;
    update ledger_entries set balance_after = v_balance where id = r.id;
  end loop;
end;
$$;

-- Repair pass: recompute every party's balance chain from scratch with the
-- corrected function, undoing any corruption the bug may have already caused.
do $$
declare
  v_party record;
begin
  for v_party in select id from parties loop
    perform fn_recompute_party_balance(v_party.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete support for Payments, Receipts, and Expenses (previously delete-less
-- everywhere in the app), needed so Roznamcha entries — which auto-create
-- these under the hood — can be deleted and have their effects reversed.
-- ---------------------------------------------------------------------------
create or replace function fn_payment_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  end if;
  delete from ledger_entries where txn_type = 'payment' and txn_id = old.id;
  perform fn_recompute_party_balance(old.vendor_id);
  return old;
end;
$$;

create trigger trg_payment_delete
before delete on payments
for each row execute function fn_payment_delete();

create or replace function fn_receipt_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  end if;
  delete from ledger_entries where txn_type = 'receipt' and txn_id = old.id;
  perform fn_recompute_party_balance(old.customer_id);
  return old;
end;
$$;

create trigger trg_receipt_delete
before delete on receipts
for each row execute function fn_receipt_delete();

create or replace function fn_expense_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  end if;
  return old;
end;
$$;

create trigger trg_expense_delete
before delete on expenses
for each row execute function fn_expense_delete();

create policy payments_delete on payments for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy receipts_delete on receipts for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy expenses_delete on expenses for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));

-- ---------------------------------------------------------------------------
-- Roznamcha entry delete: removes whichever linked record was auto-created
-- (payment/receipt/expense), which in turn reverses bank balance, ledger,
-- and party balance via the triggers above. For an Aamdan entry with no
-- party (only case that doesn't create a linked record), reverse the direct
-- bank balance adjustment made at insert time.
-- ---------------------------------------------------------------------------
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
    end if;
  end if;
  return old;
end;
$$;

create trigger trg_roznamcha_entry_delete
before delete on roznamcha_entries
for each row execute function fn_roznamcha_entry_delete();

create policy roznamcha_entries_delete on roznamcha_entries for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));

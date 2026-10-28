-- ---------------------------------------------------------------------------
-- BUG FIX: fn_cash_bank_transfer_insert/delete (0030_transfers_and_bank_ledger.sql)
-- updated cash_account.balance with no WHERE clause — the same class of bug
-- 0024_cash_account_where_clause_fix.sql already fixed for the original
-- expense/payment/receipt/roznamcha cash_account updates, just reintroduced
-- here for the new Cash<->Bank transfer triggers. This database rejects any
-- UPDATE with no WHERE clause outright ("UPDATE requires a WHERE clause"),
-- so every Cash<->Bank transfer insert/delete was failing. cash_account is
-- a singleton table, so `where true` is a no-op filter that just satisfies
-- the requirement.
-- ---------------------------------------------------------------------------
create or replace function fn_cash_bank_transfer_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.direction = 'cash_to_bank' then
    update cash_account set balance = balance - new.amount where true;
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  else
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
    update cash_account set balance = balance + new.amount where true;
  end if;
  return new;
end;
$$;

create or replace function fn_cash_bank_transfer_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'cash_to_bank' then
    update cash_account set balance = balance + old.amount where true;
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  else
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
    update cash_account set balance = balance - old.amount where true;
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cash balance as of a given date — reconstructs what cash_account.balance
-- would have been at the end of that date, by replaying every cash-source
-- movement up to and including it:
--   opening_balance
--   + cash_ledger (manual in/out entries)
--   - payments (payment_source = 'cash')       -- includes Roznamcha Kharcha-with-party
--   + receipts (payment_source = 'cash')       -- includes Roznamcha Aamdan-with-party
--   - expenses (payment_source = 'cash')       -- includes Roznamcha Kharcha-without-party
--   + roznamcha_entries: Aamdan with no party  -- the one case with no linked
--     payments/receipts/expenses row of its own (see fn_roznamcha_entry_insert)
-- Security invoker (like fn_trial_balance_lines) — relies on the caller's
-- existing RLS select access to each of these tables.
-- ---------------------------------------------------------------------------
create or replace function fn_cash_balance_as_of(p_date date)
returns numeric
language sql stable as $$
  select coalesce((select opening_balance from cash_account limit 1), 0)
    + coalesce((select sum(case when direction = 'in' then amount else -amount end)
                from cash_ledger where date <= p_date), 0)
    + coalesce((select -sum(amount) from payments where payment_source = 'cash' and date <= p_date), 0)
    + coalesce((select sum(amount) from receipts where payment_source = 'cash' and date <= p_date), 0)
    + coalesce((select -sum(amount) from expenses where payment_source = 'cash' and date <= p_date), 0)
    + coalesce((select sum(amount) from roznamcha_entries
                where direction = 'aamdan' and party_id is null and payment_source = 'cash' and date <= p_date), 0);
$$;

grant execute on function fn_cash_balance_as_of(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixes the Dashboard/Balance Sheet/Trial Balance cash figure drifting away
-- from the Roznamcha closing balance (see 0028_reconcile_cash_account_balance.sql
-- for the mechanism: cash_account.balance is an incrementally-nudged column
-- that never re-syncs when cash_account.opening_balance is hand-edited on the
-- Cash in Hand page, while fn_cash_balance_as_of recomputes from scratch and
-- picks up opening_balance edits immediately).
--
-- Two parts:
--   1. fn_trial_balance_lines still read cash_account.balance directly, so
--      Trial Balance/Balance Sheet's "Cash in Hand" line could drift too.
--      Point it at fn_cash_balance_as_of(current_date) instead, so every
--      report shares the same replay-based source of truth. Desktop/mobile
--      Dashboard, BalanceSheet.tsx and Roznamcha.tsx now all read cash via
--      fn_cash_balance_as_of (frontend change, no schema change needed there
--      since 0026 already grants execute to authenticated).
--   2. One more resync of cash_account.balance, since a couple of readers
--      (audit trails, ad-hoc queries) may still look at the raw column and
--      it shouldn't sit wrong in the meantime.
-- ---------------------------------------------------------------------------
create or replace function fn_trial_balance_lines()
returns table (account text, account_type text, side text, amount numeric)
language sql stable as $$
  select 'Bank Accounts'::text, 'asset'::text, 'debit'::text, coalesce(sum(balance), 0) from bank_accounts
  union all
  select 'Cash in Hand', 'asset', 'debit', fn_cash_balance_as_of(current_date)
  union all
  select 'Stock Valuation', 'asset', 'debit', coalesce(sum(isck.qty_kg * i.avg_cost), 0)
    from item_stock isck join items i on i.id = isck.item_id
  union all
  select 'Liabilities (Unpaid)', 'liability', 'credit', coalesce(sum(amount), 0) from liabilities where status = 'unpaid'
  union all
  select 'Shareholder Capital', 'equity', 'credit', coalesce(sum(investment_amount), 0) from shareholders
  union all
  select 'Sales Revenue', 'income', 'credit', coalesce(sum(total), 0) from sales
  union all
  select 'Cost of Goods Sold', 'expense', 'debit', coalesce(sum(cogs), 0) from sales
  union all
  select 'Operating Expenses', 'expense', 'debit', coalesce(sum(amount), 0) from expenses
  union all
  select 'Chadai Charges', 'expense', 'debit', coalesce(sum(amount), 0) from chadai_charges
  union all
  select 'Commission Paid', 'expense', 'debit', coalesce(sum(amount), 0) from commission_entries;
$$;

update cash_account
set balance = fn_cash_balance_as_of(current_date)
where true;

-- Stage 3: Automated Financial Reports — trial balance, balance sheet,
-- profit & loss, breakeven. Implemented as SQL functions (security invoker,
-- so they inherit the caller's RLS on the underlying tables — no separate
-- policies needed). Per-party AR/AP figures (which need to fall back to
-- opening_balance for parties with no ledger activity yet) are computed
-- client-side using the same approach as the existing AP/AR report page.

create or replace function fn_trial_balance_lines()
returns table (account text, account_type text, side text, amount numeric)
language sql stable as $$
  select 'Bank Accounts'::text, 'asset'::text, 'debit'::text, coalesce(sum(balance), 0) from bank_accounts
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

create or replace function fn_profit_loss(p_date_from date, p_date_to date)
returns table (
  sales_revenue numeric,
  cogs numeric,
  gross_profit numeric,
  expenses numeric,
  chadai numeric,
  commission numeric,
  net_profit numeric
)
language sql stable as $$
  select
    coalesce(s.sales_revenue, 0),
    coalesce(s.cogs, 0),
    coalesce(s.sales_revenue, 0) - coalesce(s.cogs, 0),
    coalesce(e.expenses, 0),
    coalesce(c.chadai, 0),
    coalesce(cm.commission, 0),
    (coalesce(s.sales_revenue, 0) - coalesce(s.cogs, 0)) - coalesce(e.expenses, 0) - coalesce(c.chadai, 0) - coalesce(cm.commission, 0)
  from
    (select sum(total) sales_revenue, sum(cogs) cogs from sales where date between p_date_from and p_date_to) s,
    (select sum(amount) expenses from expenses where date between p_date_from and p_date_to) e,
    (select sum(amount) chadai from chadai_charges where date between p_date_from and p_date_to) c,
    (select sum(amount) commission from commission_entries where date between p_date_from and p_date_to) cm;
$$;

create or replace function fn_breakeven(p_date_from date, p_date_to date)
returns table (
  fixed_costs numeric,
  avg_price_per_kg numeric,
  avg_cost_per_kg numeric,
  contribution_per_kg numeric,
  breakeven_qty_kg numeric,
  breakeven_revenue numeric
)
language sql stable as $$
  with s as (
    select coalesce(sum(total), 0) total, coalesce(sum(cogs), 0) cogs, coalesce(sum(qty_kg), 0) qty
    from sales where date between p_date_from and p_date_to
  ),
  costs as (
    select coalesce((select sum(amount) from expenses where date between p_date_from and p_date_to), 0) as fixed_costs
  )
  select
    costs.fixed_costs,
    case when s.qty = 0 then 0 else s.total / s.qty end,
    case when s.qty = 0 then 0 else s.cogs / s.qty end,
    case when s.qty = 0 then 0 else (s.total - s.cogs) / s.qty end,
    case when s.qty = 0 or (s.total - s.cogs) = 0 then 0
         else costs.fixed_costs / ((s.total - s.cogs) / s.qty) end,
    case when s.qty = 0 or (s.total - s.cogs) = 0 then 0
         else (costs.fixed_costs / ((s.total - s.cogs) / s.qty)) * (s.total / s.qty) end
  from s, costs;
$$;

grant execute on function fn_trial_balance_lines() to authenticated;
grant execute on function fn_profit_loss(date, date) to authenticated;
grant execute on function fn_breakeven(date, date) to authenticated;

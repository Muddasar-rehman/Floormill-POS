-- ---------------------------------------------------------------------------
-- Reconciliation safety net.
--
-- cash_account.balance is maintained INCREMENTALLY by triggers
-- (fn_payment_insert/update/delete, fn_receipt_insert/update/delete,
-- fn_expense_insert/delete, fn_roznamcha_entry_insert/delete,
-- fn_cash_ledger_insert/update/delete) — each one nudges the running total
-- up or down by whatever amount just moved.
--
-- fn_cash_balance_as_of (0026), which now drives the Roznamcha page's
-- Opening/Closing Balance cards, instead recomputes cash FROM SCRATCH every
-- time: opening_balance + a full replay of every qualifying row across
-- payments/receipts/expenses/cash_ledger/roznamcha_entries. The two numbers
-- are logically supposed to always agree.
--
-- They can drift apart in exactly one way: the Cash in Hand page lets
-- opening_balance AND balance be hand-edited directly. Editing
-- opening_balance is fine (fn_cash_balance_as_of reads it every time).
-- Editing balance is not: it silently overwrites the running total, every
-- trigger afterwards keeps incrementing from that overwritten number
-- forever, and fn_cash_balance_as_of has no way to know it ever happened —
-- it isn't derived from any transaction row, so the replay can't see it.
--
-- This is a one-time, idempotent resync: it forces cash_account.balance
-- back to what today's full replay says it should be. If the two already
-- agree (no such manual edit was ever made), this changes nothing.
-- ---------------------------------------------------------------------------
update cash_account
set balance = fn_cash_balance_as_of(current_date)
where true;

-- ---------------------------------------------------------------------------
-- bank_accounts had select/insert RLS policies but no update policy, so any
-- direct client-side edit (e.g. correcting a balance) was silently denied by
-- Postgres's default-deny-when-RLS-enabled behavior — no error, zero rows
-- affected. Balance/opening_balance edits from the Bank Accounts screen need
-- this to actually take effect.
-- ---------------------------------------------------------------------------
create policy bank_accounts_update on bank_accounts for update
  using (current_profile_role() in ('owner_admin', 'accountant'));

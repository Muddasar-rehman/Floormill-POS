-- ---------------------------------------------------------------------------
-- bank_accounts had select/insert/update RLS policies but no delete policy,
-- so a delete from the client was silently denied. Needed for the Delete
-- action on the Bank Accounts screen. Existing payments/receipts/expenses/
-- roznamcha_entries reference bank_account_id without ON DELETE CASCADE, so
-- Postgres will still block (foreign key violation) deleting an account
-- that has transaction history — the app surfaces that as a friendly
-- message rather than letting it silently orphan records.
-- ---------------------------------------------------------------------------
create policy bank_accounts_delete on bank_accounts for delete
  using (current_profile_role() = 'owner_admin');

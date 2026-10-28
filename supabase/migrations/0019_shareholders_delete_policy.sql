-- ---------------------------------------------------------------------------
-- shareholders had select/insert/update RLS policies but no delete policy,
-- so a delete from the client was silently denied by Postgres's
-- default-deny-when-RLS-enabled behavior. Needed for the Delete action on
-- the Shareholders screen.
-- ---------------------------------------------------------------------------
create policy shareholders_delete on shareholders for delete
  using (current_profile_role() = 'owner_admin');

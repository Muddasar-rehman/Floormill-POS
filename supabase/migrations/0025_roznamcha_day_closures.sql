-- ---------------------------------------------------------------------------
-- Roznamcha day closures — mirrors closing a page in the physical register.
-- The "active" working day is the day after the most recently closed date
-- (or today, if nothing has been closed yet, or the app was never behind).
-- The app computes this client-side from the latest row here; this table is
-- just an append-only log of "this date is done."
-- ---------------------------------------------------------------------------
create table roznamcha_day_closures (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  closed_by uuid references profiles (id),
  closed_at timestamptz not null default now()
);

alter table roznamcha_day_closures enable row level security;

create policy roznamcha_day_closures_select on roznamcha_day_closures for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy roznamcha_day_closures_write on roznamcha_day_closures for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));

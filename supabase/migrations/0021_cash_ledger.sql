-- ---------------------------------------------------------------------------
-- Cash Ledger — manual cash-in / cash-out entries for movements that don't
-- go through Payments/Receipts/Expenses/Roznamcha (e.g. an owner cash
-- injection, a miscellaneous cash sale, a physical count adjustment). Each
-- entry is tagged with where the cash came from (in) or where it was used
-- (out), and posts to the same cash_account.balance that those other flows
-- already update (0020_cash_account.sql), so it's one consistent total.
-- ---------------------------------------------------------------------------
create table cash_ledger (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  amount numeric not null check (amount > 0),
  tag text not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create function fn_cash_ledger_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.direction = 'in' then
    update cash_account set balance = balance + new.amount;
  else
    update cash_account set balance = balance - new.amount;
  end if;
  return new;
end;
$$;

create trigger trg_cash_ledger_insert
after insert on cash_ledger
for each row execute function fn_cash_ledger_insert();

create function fn_cash_ledger_update() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'in' then
    update cash_account set balance = balance - old.amount;
  else
    update cash_account set balance = balance + old.amount;
  end if;
  if new.direction = 'in' then
    update cash_account set balance = balance + new.amount;
  else
    update cash_account set balance = balance - new.amount;
  end if;
  return new;
end;
$$;

create trigger trg_cash_ledger_update
after update on cash_ledger
for each row execute function fn_cash_ledger_update();

create function fn_cash_ledger_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'in' then
    update cash_account set balance = balance - old.amount;
  else
    update cash_account set balance = balance + old.amount;
  end if;
  return old;
end;
$$;

create trigger trg_cash_ledger_delete
before delete on cash_ledger
for each row execute function fn_cash_ledger_delete();

alter table cash_ledger enable row level security;

create policy cash_ledger_select on cash_ledger for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy cash_ledger_write on cash_ledger for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));
create policy cash_ledger_update on cash_ledger for update
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy cash_ledger_delete on cash_ledger for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));

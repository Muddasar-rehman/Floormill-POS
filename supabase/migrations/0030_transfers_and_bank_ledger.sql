-- ---------------------------------------------------------------------------
-- Bank Ledger — manual bank-in / bank-out entries for a specific account,
-- for movements that don't go through Payments/Receipts/Expenses/Roznamcha
-- (e.g. a bank charge, interest credit, owner deposit). Mirrors
-- cash_ledger (0021_cash_ledger.sql) but scoped per bank account.
-- ---------------------------------------------------------------------------
create table bank_ledger (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts (id),
  direction text not null check (direction in ('in', 'out')),
  amount numeric not null check (amount > 0),
  tag text not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create function fn_bank_ledger_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.direction = 'in' then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  else
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  end if;
  return new;
end;
$$;

create trigger trg_bank_ledger_insert
after insert on bank_ledger
for each row execute function fn_bank_ledger_insert();

create function fn_bank_ledger_update() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'in' then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  else
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  end if;
  if new.direction = 'in' then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  else
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  end if;
  return new;
end;
$$;

create trigger trg_bank_ledger_update
after update on bank_ledger
for each row execute function fn_bank_ledger_update();

create function fn_bank_ledger_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'in' then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  else
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  end if;
  return old;
end;
$$;

create trigger trg_bank_ledger_delete
before delete on bank_ledger
for each row execute function fn_bank_ledger_delete();

alter table bank_ledger enable row level security;

create policy bank_ledger_select on bank_ledger for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy bank_ledger_write on bank_ledger for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));
create policy bank_ledger_update on bank_ledger for update
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy bank_ledger_delete on bank_ledger for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));

-- ---------------------------------------------------------------------------
-- Cash <-> Bank Transfers — moving money between the mill's own cash box and
-- one of its bank accounts. Not a Payment/Receipt/Expense (no party, no P&L
-- effect) — it just moves the same money from one internal account to
-- another, so both cash_account.balance and the target bank_accounts.balance
-- move oppositely by the same amount.
-- ---------------------------------------------------------------------------
create table cash_bank_transfers (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts (id),
  direction text not null check (direction in ('cash_to_bank', 'bank_to_cash')),
  amount numeric not null check (amount > 0),
  note text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create function fn_cash_bank_transfer_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.direction = 'cash_to_bank' then
    update cash_account set balance = balance - new.amount;
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  else
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
    update cash_account set balance = balance + new.amount;
  end if;
  return new;
end;
$$;

create trigger trg_cash_bank_transfer_insert
after insert on cash_bank_transfers
for each row execute function fn_cash_bank_transfer_insert();

create function fn_cash_bank_transfer_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.direction = 'cash_to_bank' then
    update cash_account set balance = balance + old.amount;
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  else
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
    update cash_account set balance = balance - old.amount;
  end if;
  return old;
end;
$$;

create trigger trg_cash_bank_transfer_delete
before delete on cash_bank_transfers
for each row execute function fn_cash_bank_transfer_delete();

alter table cash_bank_transfers enable row level security;

create policy cash_bank_transfers_select on cash_bank_transfers for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy cash_bank_transfers_write on cash_bank_transfers for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));
create policy cash_bank_transfers_delete on cash_bank_transfers for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));

-- Cash <-> Bank transfers must count toward the cash replay too, or the
-- Roznamcha Opening/Closing Balance cards (fn_cash_balance_as_of) would
-- silently miss any cash moved to/from a bank account.
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
                where direction = 'aamdan' and party_id is null and payment_source = 'cash' and date <= p_date), 0)
    + coalesce((select sum(case when direction = 'bank_to_cash' then amount else -amount end)
                from cash_bank_transfers where date <= p_date), 0);
$$;

-- ---------------------------------------------------------------------------
-- Party <-> Party Transfers — a pure Khata reallocation. No cash or bank
-- balance moves: Party A's account is credited (their debt to the mill
-- reduces, or the mill's debt to them grows) and Party B's is debited by the
-- same amount, exactly as if A had paid the mill and the mill paid B — the
-- mill is just the bookkeeper for a handoff that happened directly between
-- the two parties.
-- ---------------------------------------------------------------------------
alter table ledger_entries drop constraint ledger_entries_txn_type_check;
alter table ledger_entries add constraint ledger_entries_txn_type_check
  check (txn_type in ('purchase', 'sale', 'payment', 'receipt', 'transfer'));

create table party_transfers (
  id uuid primary key default gen_random_uuid(),
  from_party_id uuid not null references parties (id),
  to_party_id uuid not null references parties (id),
  amount numeric not null check (amount > 0),
  note text,
  date date not null default current_date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (from_party_id <> to_party_id)
);

create function fn_party_transfer_insert() returns trigger
language plpgsql security definer as $$
declare
  v_last_balance numeric;
begin
  -- From party: same shape as a receipt (credit reduces their net balance).
  select balance_after into v_last_balance
  from ledger_entries where party_id = new.from_party_id
  order by date desc, created_at desc limit 1;
  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.from_party_id;
  end if;
  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.from_party_id, 'transfer', new.id, 0, new.amount, coalesce(v_last_balance, 0) - new.amount, new.date);

  -- To party: same shape as a payment (debit increases their net balance).
  select balance_after into v_last_balance
  from ledger_entries where party_id = new.to_party_id
  order by date desc, created_at desc limit 1;
  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.to_party_id;
  end if;
  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.to_party_id, 'transfer', new.id, new.amount, 0, coalesce(v_last_balance, 0) + new.amount, new.date);

  return new;
end;
$$;

create trigger trg_party_transfer_insert
after insert on party_transfers
for each row execute function fn_party_transfer_insert();

create function fn_party_transfer_delete() returns trigger
language plpgsql security definer as $$
begin
  delete from ledger_entries where txn_type = 'transfer' and txn_id = old.id;
  perform fn_recompute_party_balance(old.from_party_id);
  perform fn_recompute_party_balance(old.to_party_id);
  return old;
end;
$$;

create trigger trg_party_transfer_delete
before delete on party_transfers
for each row execute function fn_party_transfer_delete();

alter table party_transfers enable row level security;

create policy party_transfers_select on party_transfers for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy party_transfers_write on party_transfers for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));
create policy party_transfers_delete on party_transfers for delete
  using (current_profile_role() in ('owner_admin', 'accountant'));

-- fn_recompute_party_balance (0012_roznamcha_delete_and_ledger_fix.sql) must
-- know how to net a 'transfer' row when replaying a party's ledger chain
-- after an edit/delete elsewhere in their history.
create or replace function fn_recompute_party_balance(p_party_id uuid) returns void
language plpgsql security definer as $$
declare
  v_balance numeric;
  v_delta numeric;
  r record;
begin
  select opening_balance into v_balance from parties where id = p_party_id;

  for r in
    select id, txn_type, debit, credit from ledger_entries
    where party_id = p_party_id
    order by date, created_at
  loop
    v_delta := case r.txn_type
      when 'purchase' then r.credit
      when 'sale' then r.debit
      when 'payment' then -r.debit
      when 'receipt' then -r.credit
      when 'transfer' then r.debit - r.credit
      else r.debit + r.credit
    end;
    v_balance := v_balance + v_delta;
    update ledger_entries set balance_after = v_balance where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- fn_bank_account_ledger — full statement for one bank account: every
-- expense, vendor payment, customer receipt, no-party Roznamcha Aamdan,
-- manual Bank Ledger entry, and Cash<->Bank transfer that ever touched it,
-- normalized to one shape and ordered chronologically. Mirrors how
-- fn_cash_balance_as_of (0026) already unions the same source tables for
-- cash, but returns full rows (for a statement) instead of a single total.
-- ---------------------------------------------------------------------------
create or replace function fn_bank_account_ledger(p_bank_account_id uuid)
returns table (source text, direction text, amount numeric, description text, date date, created_at timestamptz)
language sql stable as $$
  select 'expense'::text, 'out'::text, e.amount,
         e.category || case when e.description is not null and e.description <> '' then ': ' || e.description else '' end,
         e.date, e.created_at
    from expenses e
    where e.bank_account_id = p_bank_account_id and e.payment_source = 'bank'
  union all
  select 'payment', 'out', p.amount,
         coalesce(pt.name, '') || case when p.notes is not null and p.notes <> '' then ' — ' || p.notes else '' end,
         p.date, p.created_at
    from payments p join parties pt on pt.id = p.vendor_id
    where p.bank_account_id = p_bank_account_id and p.payment_source = 'bank'
  union all
  select 'receipt', 'in', r.amount,
         coalesce(pt.name, '') || case when r.notes is not null and r.notes <> '' then ' — ' || r.notes else '' end,
         r.date, r.created_at
    from receipts r join parties pt on pt.id = r.customer_id
    where r.bank_account_id = p_bank_account_id and r.payment_source = 'bank'
  union all
  select 'roznamcha', 'in', re.amount, re.description, re.date, re.created_at
    from roznamcha_entries re
    where re.bank_account_id = p_bank_account_id and re.payment_source = 'bank'
      and re.direction = 'aamdan' and re.party_id is null
  union all
  select 'bank_ledger', bl.direction, bl.amount, bl.tag, bl.date, bl.created_at
    from bank_ledger bl
    where bl.bank_account_id = p_bank_account_id
  union all
  select 'transfer', case when t.direction = 'cash_to_bank' then 'in' else 'out' end, t.amount,
         coalesce(t.note, ''), t.date, t.created_at
    from cash_bank_transfers t
    where t.bank_account_id = p_bank_account_id
  order by date, created_at
$$;

grant execute on function fn_bank_account_ledger(uuid) to authenticated;

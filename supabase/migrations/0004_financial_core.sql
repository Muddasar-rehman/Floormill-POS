-- Stage 2: Financial Core — employees, bank accounts, expenses, liabilities,
-- payments/receipts, installment plans.

-- ---------------------------------------------------------------------------
-- Allow payment/receipt txn types on the existing ledger_entries table and
-- teach the balance-recompute helper that they SUBTRACT from the running
-- balance (a payment reduces what's owed to a vendor; a receipt reduces
-- what's owed by a customer), unlike purchase/sale which ADD.
-- ---------------------------------------------------------------------------
alter table ledger_entries drop constraint ledger_entries_txn_type_check;
alter table ledger_entries add constraint ledger_entries_txn_type_check
  check (txn_type in ('purchase', 'sale', 'payment', 'receipt'));

create or replace function fn_recompute_party_balance(p_party_id uuid) returns void
language plpgsql security definer as $$
declare
  v_balance numeric;
  r record;
begin
  select opening_balance into v_balance from parties where id = p_party_id;

  for r in
    select id, txn_type, debit, credit from ledger_entries
    where party_id = p_party_id
    order by date, created_at
  loop
    if r.txn_type in ('payment', 'receipt') then
      v_balance := v_balance - (r.debit + r.credit);
    else
      v_balance := v_balance + (r.debit + r.credit);
    end if;
    update ledger_entries set balance_after = v_balance where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  contact text,
  salary_terms text,
  joining_date date,
  profile_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bank Accounts — balance auto-updated from expenses/payments/receipts
-- ---------------------------------------------------------------------------
create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_title text not null,
  account_number text,
  opening_balance numeric not null default 0,
  balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create function fn_bank_account_insert() returns trigger
language plpgsql security definer as $$
begin
  new.balance := new.opening_balance;
  return new;
end;
$$;

create trigger trg_bank_account_insert
before insert on bank_accounts
for each row execute function fn_bank_account_insert();

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  payment_source text not null check (payment_source in ('cash', 'bank')),
  bank_account_id uuid references bank_accounts (id),
  warehouse_id uuid references warehouses (id),
  description text,
  created_at timestamptz not null default now()
);

create function fn_expense_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  end if;
  return new;
end;
$$;

create trigger trg_expense_insert
after insert on expenses
for each row execute function fn_expense_insert();

-- ---------------------------------------------------------------------------
-- Liabilities register
-- ---------------------------------------------------------------------------
create table liabilities (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  description text,
  amount numeric not null check (amount > 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Payments (to vendor) — reduces payable balance and bank balance if bank
-- ---------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references parties (id),
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  payment_source text not null check (payment_source in ('cash', 'bank')),
  bank_account_id uuid references bank_accounts (id),
  notes text,
  created_at timestamptz not null default now()
);

create function fn_payment_insert() returns trigger
language plpgsql security definer as $$
declare
  v_last_balance numeric;
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  end if;

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.vendor_id
  order by date desc, created_at desc limit 1;
  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.vendor_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.vendor_id, 'payment', new.id, new.amount, 0, coalesce(v_last_balance, 0) - new.amount, new.date);

  return new;
end;
$$;

create trigger trg_payment_insert
after insert on payments
for each row execute function fn_payment_insert();

-- ---------------------------------------------------------------------------
-- Receipts (from customer) — reduces receivable balance, increases bank
-- ---------------------------------------------------------------------------
create table receipts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references parties (id),
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  payment_source text not null check (payment_source in ('cash', 'bank')),
  bank_account_id uuid references bank_accounts (id),
  notes text,
  created_at timestamptz not null default now()
);

create function fn_receipt_insert() returns trigger
language plpgsql security definer as $$
declare
  v_last_balance numeric;
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  end if;

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.customer_id
  order by date desc, created_at desc limit 1;
  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.customer_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.customer_id, 'receipt', new.id, 0, new.amount, coalesce(v_last_balance, 0) - new.amount, new.date);

  return new;
end;
$$;

create trigger trg_receipt_insert
after insert on receipts
for each row execute function fn_receipt_insert();

-- ---------------------------------------------------------------------------
-- Installment Plans (both directions) — auto-generates equal installments
-- ---------------------------------------------------------------------------
create table installment_plans (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties (id),
  direction text not null check (direction in ('payable', 'receivable')),
  total_amount numeric not null check (total_amount > 0),
  num_installments integer not null check (num_installments > 0),
  start_date date not null default current_date,
  frequency_days integer not null default 30 check (frequency_days > 0),
  created_at timestamptz not null default now()
);

create table installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references installment_plans (id) on delete cascade,
  due_date date not null,
  amount numeric not null,
  paid boolean not null default false,
  paid_date date,
  created_at timestamptz not null default now()
);

create function fn_installment_plan_insert() returns trigger
language plpgsql security definer as $$
declare
  v_amount numeric;
  i integer;
begin
  v_amount := round(new.total_amount / new.num_installments, 2);
  for i in 0 .. new.num_installments - 1 loop
    insert into installments (plan_id, due_date, amount)
    values (new.id, new.start_date + (i * new.frequency_days), v_amount);
  end loop;
  return new;
end;
$$;

create trigger trg_installment_plan_insert
after insert on installment_plans
for each row execute function fn_installment_plan_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security — accountant + owner_admin primarily (Section 2)
-- ---------------------------------------------------------------------------
alter table employees enable row level security;
alter table bank_accounts enable row level security;
alter table expenses enable row level security;
alter table liabilities enable row level security;
alter table payments enable row level security;
alter table receipts enable row level security;
alter table installment_plans enable row level security;
alter table installments enable row level security;

create policy employees_select on employees for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy employees_write on employees for insert
  with check (current_profile_role() = 'owner_admin');
create policy employees_update on employees for update
  using (current_profile_role() = 'owner_admin');
create policy employees_delete on employees for delete
  using (current_profile_role() = 'owner_admin');

create policy bank_accounts_select on bank_accounts for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy bank_accounts_write on bank_accounts for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));

create policy expenses_select on expenses for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy expenses_write on expenses for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));

create policy liabilities_select on liabilities for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy liabilities_write on liabilities for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));
create policy liabilities_update on liabilities for update
  using (current_profile_role() in ('owner_admin', 'accountant'));

create policy payments_select on payments for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy payments_write on payments for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));

create policy receipts_select on receipts for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy receipts_write on receipts for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));

create policy installment_plans_select on installment_plans for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy installment_plans_write on installment_plans for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));

create policy installments_select on installments for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy installments_update on installments for update
  using (current_profile_role() in ('owner_admin', 'accountant'));

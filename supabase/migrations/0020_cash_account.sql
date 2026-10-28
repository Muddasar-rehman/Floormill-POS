-- ---------------------------------------------------------------------------
-- Cash in Hand — mirrors bank_accounts but as a single running balance
-- (the mill has one physical cash box, not several). Every place that
-- already adjusts bank_accounts.balance for payment_source = 'bank' gets a
-- matching branch for payment_source = 'cash' here, so cash payments,
-- receipts, expenses, and no-party Roznamcha Aamdan entries actually move
-- this balance instead of disappearing into the ledger with no running
-- total anywhere (which was the gap being fixed).
-- ---------------------------------------------------------------------------
create table cash_account (
  id uuid primary key default gen_random_uuid(),
  opening_balance numeric not null default 0,
  balance numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Enforce a single row.
create unique index cash_account_singleton_idx on cash_account ((true));

insert into cash_account (opening_balance, balance) values (0, 0);

alter table cash_account enable row level security;

create policy cash_account_select on cash_account for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy cash_account_update on cash_account for update
  using (current_profile_role() in ('owner_admin', 'accountant'));

-- ---------------------------------------------------------------------------
-- Expenses: insert / delete
-- ---------------------------------------------------------------------------
create or replace function fn_expense_insert() returns trigger
language plpgsql security definer as $$
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance - new.amount;
  end if;
  return new;
end;
$$;

create or replace function fn_expense_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance + old.amount;
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments (to vendor): insert / update / delete
-- ---------------------------------------------------------------------------
create or replace function fn_payment_insert() returns trigger
language plpgsql security definer as $$
declare
  v_last_balance numeric;
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance - new.amount;
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

create or replace function fn_payment_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance + old.amount;
  end if;
  delete from ledger_entries where txn_type = 'payment' and txn_id = old.id;
  perform fn_recompute_party_balance(old.vendor_id);
  return old;
end;
$$;

create or replace function fn_payment_update() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance + old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance + old.amount;
  end if;
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance - new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance - new.amount;
  end if;

  update ledger_entries set party_id = new.vendor_id, debit = new.amount, date = new.date
  where txn_type = 'payment' and txn_id = new.id;

  perform fn_recompute_party_balance(old.vendor_id);
  if new.vendor_id <> old.vendor_id then
    perform fn_recompute_party_balance(new.vendor_id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Receipts (from customer): insert / update / delete
-- ---------------------------------------------------------------------------
create or replace function fn_receipt_insert() returns trigger
language plpgsql security definer as $$
declare
  v_last_balance numeric;
begin
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance + new.amount;
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

create or replace function fn_receipt_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance - old.amount;
  end if;
  delete from ledger_entries where txn_type = 'receipt' and txn_id = old.id;
  perform fn_recompute_party_balance(old.customer_id);
  return old;
end;
$$;

create or replace function fn_receipt_update() returns trigger
language plpgsql security definer as $$
begin
  if old.payment_source = 'bank' and old.bank_account_id is not null then
    update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
  elsif old.payment_source = 'cash' then
    update cash_account set balance = balance - old.amount;
  end if;
  if new.payment_source = 'bank' and new.bank_account_id is not null then
    update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
  elsif new.payment_source = 'cash' then
    update cash_account set balance = balance + new.amount;
  end if;

  update ledger_entries set party_id = new.customer_id, credit = new.amount, date = new.date
  where txn_type = 'receipt' and txn_id = new.id;

  perform fn_recompute_party_balance(old.customer_id);
  if new.customer_id <> old.customer_id then
    perform fn_recompute_party_balance(new.customer_id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roznamcha: only the "Aamdan, no party" branch touches a balance directly
-- (every other branch delegates to payments/receipts/expenses, already
-- covered above).
-- ---------------------------------------------------------------------------
create or replace function fn_roznamcha_entry_insert() returns trigger
language plpgsql security definer as $$
declare
  v_payment_id uuid;
  v_receipt_id uuid;
  v_expense_id uuid;
begin
  if new.party_id is not null then
    if new.direction = 'kharcha' then
      insert into payments (vendor_id, amount, date, payment_source, bank_account_id, notes)
      values (new.party_id, new.amount, new.date, new.payment_source, new.bank_account_id, new.description)
      returning id into v_payment_id;
      update roznamcha_entries set linked_payment_id = v_payment_id where id = new.id;
    else
      insert into receipts (customer_id, amount, date, payment_source, bank_account_id, notes)
      values (new.party_id, new.amount, new.date, new.payment_source, new.bank_account_id, new.description)
      returning id into v_receipt_id;
      update roznamcha_entries set linked_receipt_id = v_receipt_id where id = new.id;
    end if;
  else
    if new.direction = 'kharcha' then
      insert into expenses (category, amount, date, payment_source, bank_account_id, description)
      values ('Roznamcha', new.amount, new.date, new.payment_source, new.bank_account_id, new.description)
      returning id into v_expense_id;
      update roznamcha_entries set linked_expense_id = v_expense_id where id = new.id;
    else
      if new.payment_source = 'bank' and new.bank_account_id is not null then
        update bank_accounts set balance = balance + new.amount where id = new.bank_account_id;
      elsif new.payment_source = 'cash' then
        update cash_account set balance = balance + new.amount;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function fn_roznamcha_entry_delete() returns trigger
language plpgsql security definer as $$
begin
  if old.linked_payment_id is not null then
    delete from payments where id = old.linked_payment_id;
  elsif old.linked_receipt_id is not null then
    delete from receipts where id = old.linked_receipt_id;
  elsif old.linked_expense_id is not null then
    delete from expenses where id = old.linked_expense_id;
  elsif old.direction = 'aamdan' and old.party_id is null then
    if old.payment_source = 'bank' and old.bank_account_id is not null then
      update bank_accounts set balance = balance - old.amount where id = old.bank_account_id;
    elsif old.payment_source = 'cash' then
      update cash_account set balance = balance - old.amount;
    end if;
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trial Balance: count cash alongside bank accounts as an asset.
-- ---------------------------------------------------------------------------
create or replace function fn_trial_balance_lines()
returns table (account text, account_type text, side text, amount numeric)
language sql stable as $$
  select 'Bank Accounts'::text, 'asset'::text, 'debit'::text, coalesce(sum(balance), 0) from bank_accounts
  union all
  select 'Cash in Hand', 'asset', 'debit', coalesce((select balance from cash_account limit 1), 0)
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

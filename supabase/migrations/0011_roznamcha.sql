-- Roznamcha (روزنامچہ) — the traditional daily cash book: one column for
-- Kharcha (خرچہ, money going out) and one for Aamdan (آمدن, money coming in).
-- An entry tied to a vendor/customer automatically posts to that party's
-- Khata by inserting into the existing payments/receipts tables — reusing
-- their proven triggers (fn_payment_insert/fn_receipt_insert) rather than
-- duplicating ledger-posting logic. An entry with no party is general cash
-- flow (e.g. rent, misc income) and posts to `expenses` for the Kharcha side
-- (reusing fn_expense_insert) or, for Aamdan with no party, just adjusts the
-- bank balance directly since there's no general "other income" table yet.

create table roznamcha_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  direction text not null check (direction in ('kharcha', 'aamdan')),
  amount numeric not null check (amount > 0),
  description text not null,
  party_id uuid references parties (id),
  reference_no text,
  payment_source text not null default 'cash' check (payment_source in ('cash', 'bank')),
  bank_account_id uuid references bank_accounts (id),
  linked_payment_id uuid references payments (id),
  linked_receipt_id uuid references receipts (id),
  linked_expense_id uuid references expenses (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

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
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_roznamcha_entry_insert
after insert on roznamcha_entries
for each row execute function fn_roznamcha_entry_insert();

alter table roznamcha_entries enable row level security;

create policy roznamcha_entries_select on roznamcha_entries for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy roznamcha_entries_write on roznamcha_entries for insert
  with check (current_profile_role() in ('owner_admin', 'accountant'));

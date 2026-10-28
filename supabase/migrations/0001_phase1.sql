-- Phase 1: master data, purchase/sale entry, stock on hand, party ledger.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum (
  'owner_admin',
  'accountant',
  'warehouse_staff',
  'sales_purchase_staff',
  'commission_agent'
);

create type party_type as enum ('vendor', 'customer');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  role user_role not null,
  created_at timestamptz not null default now()
);

create table parties (
  id uuid primary key default gen_random_uuid(),
  type party_type not null,
  name text not null,
  contact text,
  address text,
  cnic_ntn text,
  opening_balance numeric not null default 0,
  credit_limit numeric,
  payment_terms text,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  mun_kg numeric not null default 40 check (mun_kg > 0),
  avg_cost numeric not null default 0,
  reorder_threshold_kg numeric,
  created_at timestamptz not null default now()
);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  capacity_kg numeric,
  incharge_employee text,
  created_at timestamptz not null default now()
);

create table item_stock (
  item_id uuid not null references items (id) on delete cascade,
  warehouse_id uuid not null references warehouses (id) on delete cascade,
  qty_kg numeric not null default 0,
  primary key (item_id, warehouse_id)
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references parties (id),
  item_id uuid not null references items (id),
  warehouse_id uuid not null references warehouses (id),
  qty_kg numeric not null check (qty_kg > 0),
  rate numeric not null check (rate > 0),
  total numeric generated always as (qty_kg * rate) stored,
  date date not null default current_date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references parties (id),
  item_id uuid not null references items (id),
  warehouse_id uuid not null references warehouses (id),
  qty_kg numeric not null check (qty_kg > 0),
  rate numeric not null check (rate > 0),
  total numeric generated always as (qty_kg * rate) stored,
  cogs numeric not null default 0,
  date date not null default current_date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties (id),
  txn_type text not null check (txn_type in ('purchase', 'sale')),
  txn_id uuid not null,
  debit numeric not null default 0,
  credit numeric not null default 0,
  balance_after numeric not null,
  date date not null,
  created_at timestamptz not null default now()
);

create index idx_ledger_entries_party on ledger_entries (party_id, date, created_at);
create index idx_purchases_vendor on purchases (vendor_id);
create index idx_sales_customer on sales (customer_id);

-- ---------------------------------------------------------------------------
-- Role helper (used by RLS policies below)
-- ---------------------------------------------------------------------------
create function current_profile_role() returns user_role
language sql stable security definer as $$
  select role from profiles where auth_user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Purchase trigger: weighted-average cost, stock upsert, ledger posting
-- ---------------------------------------------------------------------------
create function fn_purchase_insert() returns trigger
language plpgsql security definer as $$
declare
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
  v_last_balance numeric;
begin
  select avg_cost into v_old_avg from items where id = new.item_id for update;
  select coalesce(sum(qty_kg), 0) into v_old_qty from item_stock where item_id = new.item_id;

  if (v_old_qty + new.qty_kg) = 0 then
    v_new_avg := new.rate;
  else
    v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + (new.qty_kg * new.rate)) / (v_old_qty + new.qty_kg);
  end if;
  update items set avg_cost = v_new_avg where id = new.item_id;

  insert into item_stock (item_id, warehouse_id, qty_kg)
  values (new.item_id, new.warehouse_id, new.qty_kg)
  on conflict (item_id, warehouse_id) do update set qty_kg = item_stock.qty_kg + excluded.qty_kg;

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.vendor_id
  order by date desc, created_at desc limit 1;

  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.vendor_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.vendor_id, 'purchase', new.id, 0, new.total, coalesce(v_last_balance, 0) + new.total, new.date);

  return new;
end;
$$;

create trigger trg_purchase_insert
after insert on purchases
for each row execute function fn_purchase_insert();

-- ---------------------------------------------------------------------------
-- Sale trigger: stock deduction, COGS at average cost, ledger posting
-- ---------------------------------------------------------------------------
create function fn_sale_insert() returns trigger
language plpgsql security definer as $$
declare
  v_avg_cost numeric;
  v_current_stock numeric;
  v_last_balance numeric;
begin
  select avg_cost into v_avg_cost from items where id = new.item_id;
  select qty_kg into v_current_stock
  from item_stock where item_id = new.item_id and warehouse_id = new.warehouse_id
  for update;

  if v_current_stock is null or v_current_stock < new.qty_kg then
    raise exception 'Insufficient stock: available %, requested %', coalesce(v_current_stock, 0), new.qty_kg;
  end if;

  update item_stock set qty_kg = qty_kg - new.qty_kg
  where item_id = new.item_id and warehouse_id = new.warehouse_id;

  new.cogs := new.qty_kg * coalesce(v_avg_cost, 0);

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.customer_id
  order by date desc, created_at desc limit 1;

  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.customer_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.customer_id, 'sale', new.id, new.qty_kg * new.rate, 0, coalesce(v_last_balance, 0) + (new.qty_kg * new.rate), new.date);

  return new;
end;
$$;

create trigger trg_sale_insert
before insert on sales
for each row execute function fn_sale_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table parties enable row level security;
alter table items enable row level security;
alter table warehouses enable row level security;
alter table item_stock enable row level security;
alter table purchases enable row level security;
alter table sales enable row level security;
alter table ledger_entries enable row level security;

-- profiles: everyone can read their own row; owner_admin can read/write all
create policy profiles_select_own on profiles for select
  using (auth_user_id = auth.uid() or current_profile_role() = 'owner_admin');
create policy profiles_all_owner_admin on profiles for all
  using (current_profile_role() = 'owner_admin')
  with check (current_profile_role() = 'owner_admin');

-- parties: owner_admin full access; accountant & sales_purchase_staff read; sales_purchase_staff can write
create policy parties_select on parties for select
  using (current_profile_role() in ('owner_admin', 'accountant', 'sales_purchase_staff'));
create policy parties_write on parties for insert
  with check (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));
create policy parties_update on parties for update
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

-- items: everyone with a profile can read; only owner_admin can write
create policy items_select on items for select
  using (current_profile_role() is not null);
create policy items_write on items for insert
  with check (current_profile_role() = 'owner_admin');
create policy items_update on items for update
  using (current_profile_role() = 'owner_admin');

-- warehouses: owner_admin, warehouse_staff, accountant, sales_purchase_staff read; owner_admin & warehouse_staff write
create policy warehouses_select on warehouses for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy warehouses_write on warehouses for insert
  with check (current_profile_role() in ('owner_admin', 'warehouse_staff'));
create policy warehouses_update on warehouses for update
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

-- item_stock: same readers as warehouses; writes only via triggers (security definer), direct writes owner_admin only
create policy item_stock_select on item_stock for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy item_stock_write on item_stock for insert
  with check (current_profile_role() = 'owner_admin');
create policy item_stock_update on item_stock for update
  using (current_profile_role() = 'owner_admin');

-- purchases: owner_admin & sales_purchase_staff read/write; accountant read-only
create policy purchases_select on purchases for select
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff', 'accountant'));
create policy purchases_insert on purchases for insert
  with check (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

-- sales: owner_admin & sales_purchase_staff read/write; accountant read-only
create policy sales_select on sales for select
  using (current_profile_role() in ('owner_admin', 'sales_purchase_staff', 'accountant'));
create policy sales_insert on sales for insert
  with check (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

-- ledger_entries: owner_admin & accountant read; no direct writes (posted by triggers only)
create policy ledger_entries_select on ledger_entries for select
  using (current_profile_role() in ('owner_admin', 'accountant'));

-- Stage 1: Warehouse Operations — gate pass, kanda, bardana, chadai,
-- stock weight adjustments, and invoice numbering for purchases/sales.

alter table purchases add column invoice_no bigserial;
alter table sales add column invoice_no bigserial;

-- ---------------------------------------------------------------------------
-- Gate Pass — physical movement of goods, independent of the financial entry
-- ---------------------------------------------------------------------------
create table gate_passes (
  id uuid primary key default gen_random_uuid(),
  vehicle_number text not null,
  driver text,
  item_id uuid not null references items (id),
  warehouse_id uuid not null references warehouses (id),
  qty_kg numeric not null check (qty_kg > 0),
  direction text not null check (direction in ('in', 'out')),
  purchase_id uuid references purchases (id),
  sale_id uuid references sales (id),
  gate_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Kanda (Weighment) Slip — official weighbridge record backing a gate pass
-- ---------------------------------------------------------------------------
create table kanda_slips (
  id uuid primary key default gen_random_uuid(),
  gate_pass_id uuid not null references gate_passes (id) on delete cascade,
  gross_weight_kg numeric not null check (gross_weight_kg > 0),
  tare_weight_kg numeric not null check (tare_weight_kg >= 0),
  net_weight_kg numeric generated always as (gross_weight_kg - tare_weight_kg) stored,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bardana Ledger — empty bag quantity ledger per party (not cash)
-- ---------------------------------------------------------------------------
create table bardana_ledger (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties (id),
  direction text not null check (direction in ('in', 'out')),
  qty_bags numeric not null check (qty_bags > 0),
  purchase_id uuid references purchases (id),
  sale_id uuid references sales (id),
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create view bardana_balances as
select
  party_id,
  sum(case when direction = 'in' then qty_bags else -qty_bags end) as balance_bags
from bardana_ledger
group by party_id;

-- ---------------------------------------------------------------------------
-- Chadai (Loading/Unloading) Charges — rolled into landed cost / expenses
-- ---------------------------------------------------------------------------
create table chadai_charges (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases (id),
  sale_id uuid references sales (id),
  basis text not null check (basis in ('per_bag', 'per_mun', 'lump_sum')),
  rate numeric not null check (rate > 0),
  qty_basis numeric not null default 1 check (qty_basis > 0),
  amount numeric generated always as (
    case when basis = 'lump_sum' then rate else rate * qty_basis end
  ) stored,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint chadai_one_link check (
    (purchase_id is not null and sale_id is null) or
    (purchase_id is null and sale_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Stock Weight Adjustment (Boori Wazan Badhna/Ghatna) — moisture/shrinkage
-- ---------------------------------------------------------------------------
create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id),
  warehouse_id uuid not null references warehouses (id),
  reason text not null,
  qty_delta_kg numeric not null check (qty_delta_kg <> 0),
  date date not null default current_date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create function fn_stock_adjustment_insert() returns trigger
language plpgsql security definer as $$
declare
  v_current_stock numeric;
begin
  select qty_kg into v_current_stock
  from item_stock where item_id = new.item_id and warehouse_id = new.warehouse_id
  for update;

  if v_current_stock is null and new.qty_delta_kg < 0 then
    raise exception 'No existing stock for this item/warehouse to decrease';
  end if;

  if v_current_stock is not null and (v_current_stock + new.qty_delta_kg) < 0 then
    raise exception 'Adjustment would result in negative stock: available %, adjustment %', v_current_stock, new.qty_delta_kg;
  end if;

  insert into item_stock (item_id, warehouse_id, qty_kg)
  values (new.item_id, new.warehouse_id, new.qty_delta_kg)
  on conflict (item_id, warehouse_id) do update set qty_kg = item_stock.qty_kg + excluded.qty_kg;

  return new;
end;
$$;

create trigger trg_stock_adjustment_insert
after insert on stock_adjustments
for each row execute function fn_stock_adjustment_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table gate_passes enable row level security;
alter table kanda_slips enable row level security;
alter table bardana_ledger enable row level security;
alter table chadai_charges enable row level security;
alter table stock_adjustments enable row level security;

create policy gate_passes_select on gate_passes for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy gate_passes_write on gate_passes for insert
  with check (current_profile_role() in ('owner_admin', 'warehouse_staff'));
create policy gate_passes_delete on gate_passes for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

create policy kanda_slips_select on kanda_slips for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy kanda_slips_write on kanda_slips for insert
  with check (current_profile_role() in ('owner_admin', 'warehouse_staff'));
create policy kanda_slips_delete on kanda_slips for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

create policy bardana_ledger_select on bardana_ledger for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy bardana_ledger_write on bardana_ledger for insert
  with check (current_profile_role() in ('owner_admin', 'warehouse_staff'));
create policy bardana_ledger_delete on bardana_ledger for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

create policy chadai_charges_select on chadai_charges for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy chadai_charges_write on chadai_charges for insert
  with check (current_profile_role() in ('owner_admin', 'warehouse_staff'));
create policy chadai_charges_delete on chadai_charges for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

create policy stock_adjustments_select on stock_adjustments for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy stock_adjustments_write on stock_adjustments for insert
  with check (current_profile_role() in ('owner_admin', 'warehouse_staff'));

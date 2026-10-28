-- Stage 4: Shareholders & Commission

-- ---------------------------------------------------------------------------
-- Shareholders — capital contributed, withdrawals, cumulative profit share
-- ---------------------------------------------------------------------------
create table shareholders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  investment_amount numeric not null default 0,
  profit_ratio_pct numeric not null check (profit_ratio_pct >= 0 and profit_ratio_pct <= 100),
  created_at timestamptz not null default now()
);

create table shareholder_ledger (
  id uuid primary key default gen_random_uuid(),
  shareholder_id uuid not null references shareholders (id) on delete cascade,
  type text not null check (type in ('contribution', 'withdrawal', 'profit_share')),
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create view shareholder_balances as
select
  shareholder_id,
  sum(case when type in ('contribution', 'profit_share') then amount else -amount end) as balance
from shareholder_ledger
group by shareholder_id;

-- ---------------------------------------------------------------------------
-- Commission Agents & Entries (self + agent commission)
-- ---------------------------------------------------------------------------
create table commission_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  rate_type text not null check (rate_type in ('percentage', 'fixed_per_mun')),
  rate numeric not null check (rate > 0),
  profile_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table commission_entries (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases (id),
  sale_id uuid references sales (id),
  type text not null check (type in ('self', 'agent')),
  agent_id uuid references commission_agents (id),
  amount numeric not null default 0,
  paid boolean not null default false,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint commission_one_link check (
    (purchase_id is not null and sale_id is null) or
    (purchase_id is null and sale_id is not null)
  ),
  constraint commission_agent_required check (
    (type = 'agent' and agent_id is not null) or (type = 'self' and agent_id is null)
  )
);

create function fn_commission_entry_insert() returns trigger
language plpgsql security definer as $$
declare
  v_rate_type text;
  v_rate numeric;
  v_qty_kg numeric;
  v_total numeric;
  v_mun_kg numeric;
begin
  if new.type = 'agent' then
    select rate_type, rate into v_rate_type, v_rate from commission_agents where id = new.agent_id;

    if new.purchase_id is not null then
      select p.qty_kg, p.total, i.mun_kg into v_qty_kg, v_total, v_mun_kg
      from purchases p join items i on i.id = p.item_id where p.id = new.purchase_id;
    else
      select s.qty_kg, s.total, i.mun_kg into v_qty_kg, v_total, v_mun_kg
      from sales s join items i on i.id = s.item_id where s.id = new.sale_id;
    end if;

    if v_rate_type = 'percentage' then
      new.amount := v_total * v_rate / 100;
    else
      new.amount := (v_qty_kg / coalesce(v_mun_kg, 40)) * v_rate;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_commission_entry_insert
before insert on commission_entries
for each row execute function fn_commission_entry_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table shareholders enable row level security;
alter table shareholder_ledger enable row level security;
alter table commission_agents enable row level security;
alter table commission_entries enable row level security;

create policy shareholders_select on shareholders for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy shareholders_write on shareholders for insert
  with check (current_profile_role() = 'owner_admin');
create policy shareholders_update on shareholders for update
  using (current_profile_role() = 'owner_admin');

create policy shareholder_ledger_select on shareholder_ledger for select
  using (current_profile_role() in ('owner_admin', 'accountant'));
create policy shareholder_ledger_write on shareholder_ledger for insert
  with check (current_profile_role() = 'owner_admin');

create policy commission_agents_select on commission_agents for select
  using (current_profile_role() in ('owner_admin', 'accountant', 'sales_purchase_staff'));
create policy commission_agents_write on commission_agents for insert
  with check (current_profile_role() = 'owner_admin');
create policy commission_agents_update on commission_agents for update
  using (current_profile_role() = 'owner_admin');

-- Commission agents see only entries linked to their own agent record; other
-- roles get the normal owner/accountant/sales-staff visibility.
create policy commission_entries_select on commission_entries for select
  using (
    current_profile_role() in ('owner_admin', 'accountant', 'sales_purchase_staff')
    or exists (
      select 1 from commission_agents ca
      join profiles p on p.id = ca.profile_id
      where ca.id = commission_entries.agent_id and p.auth_user_id = auth.uid()
    )
  );
create policy commission_entries_write on commission_entries for insert
  with check (current_profile_role() in ('owner_admin', 'sales_purchase_staff'));

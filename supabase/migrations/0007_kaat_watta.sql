-- Kaat & Watta — standard mandi deductions on purchases (and optionally sales).
--
-- Kaat: a PERCENTAGE OF WEIGHT deducted from the weighed (dharam kaanta) gross
-- quantity to arrive at the net billable/stock quantity — compensating the
-- buyer for gunny bag weight, moisture, dirt, or transit shrinkage.
--
-- Watta: a separate PERCENTAGE OF PRICE deduction/allowance (also "batta"),
-- independent of Kaat, historically for below-standard quality or as a
-- customary trade margin.
--
-- Both deductions land on the seller/vendor side of the transaction:
--   qty_kg   (net billable/stock weight) = weighed_qty_kg * (1 - kaat_pct/100)
--   net_rate (rate actually paid)        = rate * (1 - watta_pct/100)
--   total                                = qty_kg * net_rate
--
-- The existing qty_kg/total columns keep their meaning and every downstream
-- consumer (stock, avg cost, ledger, commission, invoices) — only the
-- purchase/sale entry form changes to collect the pre-deduction inputs.

-- ---------------------------------------------------------------------------
-- Purchases: rename the existing (plain) qty_kg to weighed_qty_kg, then
-- reintroduce qty_kg as a generated net-of-Kaat column. Regenerate total to
-- also account for Watta.
-- ---------------------------------------------------------------------------
alter table purchases rename column qty_kg to weighed_qty_kg;
alter table purchases drop column total;

alter table purchases add column kaat_pct numeric not null default 0 check (kaat_pct >= 0 and kaat_pct < 100);
alter table purchases add column qty_kg numeric generated always as (weighed_qty_kg * (1 - kaat_pct / 100.0)) stored;
alter table purchases add column watta_pct numeric not null default 0 check (watta_pct >= 0 and watta_pct < 100);
alter table purchases add column net_rate numeric generated always as (rate * (1 - watta_pct / 100.0)) stored;
alter table purchases add column total numeric generated always as (
  weighed_qty_kg * (1 - kaat_pct / 100.0) * rate * (1 - watta_pct / 100.0)
) stored;

-- ---------------------------------------------------------------------------
-- Sales: same structure (kaat/watta default to 0 — opt-in, "not unheard of"
-- but uncommon on the sales side per the doc).
-- ---------------------------------------------------------------------------
alter table sales rename column qty_kg to weighed_qty_kg;
alter table sales drop column total;

alter table sales add column kaat_pct numeric not null default 0 check (kaat_pct >= 0 and kaat_pct < 100);
alter table sales add column qty_kg numeric generated always as (weighed_qty_kg * (1 - kaat_pct / 100.0)) stored;
alter table sales add column watta_pct numeric not null default 0 check (watta_pct >= 0 and watta_pct < 100);
alter table sales add column net_rate numeric generated always as (rate * (1 - watta_pct / 100.0)) stored;
alter table sales add column total numeric generated always as (
  weighed_qty_kg * (1 - kaat_pct / 100.0) * rate * (1 - watta_pct / 100.0)
) stored;

-- ---------------------------------------------------------------------------
-- Purchase insert trigger: use the Watta-adjusted total (not qty_kg * rate)
-- as the cost basis for the weighted-average recalculation.
-- ---------------------------------------------------------------------------
create or replace function fn_purchase_insert() returns trigger
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
    v_new_avg := new.net_rate;
  else
    v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + new.total) / (v_old_qty + new.qty_kg);
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

-- ---------------------------------------------------------------------------
-- Purchase delete trigger: recompute avg_cost from remaining purchases using
-- sum(total) (already Watta-adjusted) instead of sum(qty_kg * rate).
-- ---------------------------------------------------------------------------
create or replace function fn_purchase_delete() returns trigger
language plpgsql security definer as $$
declare
  v_new_avg numeric;
  v_total_qty numeric;
  v_total_value numeric;
begin
  update item_stock set qty_kg = qty_kg - old.qty_kg
  where item_id = old.item_id and warehouse_id = old.warehouse_id;

  select coalesce(sum(qty_kg), 0), coalesce(sum(total), 0)
  into v_total_qty, v_total_value
  from purchases where item_id = old.item_id and id <> old.id;

  v_new_avg := case when v_total_qty = 0 then 0 else v_total_value / v_total_qty end;
  update items set avg_cost = v_new_avg where id = old.item_id;

  delete from ledger_entries where txn_type = 'purchase' and txn_id = old.id;
  perform fn_recompute_party_balance(old.vendor_id);

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sale insert trigger. This fires BEFORE INSERT (it needs to set NEW.cogs),
-- and generated columns (qty_kg, net_rate, total) are NOT yet computed at
-- that point in Postgres — so net quantity/total are computed here from the
-- raw input columns instead of read back off NEW.
-- ---------------------------------------------------------------------------
create or replace function fn_sale_insert() returns trigger
language plpgsql security definer as $$
declare
  v_avg_cost numeric;
  v_current_stock numeric;
  v_last_balance numeric;
  v_net_qty numeric;
  v_total numeric;
begin
  v_net_qty := new.weighed_qty_kg * (1 - new.kaat_pct / 100.0);
  v_total := v_net_qty * new.rate * (1 - new.watta_pct / 100.0);

  select avg_cost into v_avg_cost from items where id = new.item_id;
  select qty_kg into v_current_stock
  from item_stock where item_id = new.item_id and warehouse_id = new.warehouse_id
  for update;

  if v_current_stock is null or v_current_stock < v_net_qty then
    raise exception 'Insufficient stock: available %, requested %', coalesce(v_current_stock, 0), v_net_qty;
  end if;

  update item_stock set qty_kg = qty_kg - v_net_qty
  where item_id = new.item_id and warehouse_id = new.warehouse_id;

  new.cogs := v_net_qty * coalesce(v_avg_cost, 0);

  select balance_after into v_last_balance
  from ledger_entries where party_id = new.customer_id
  order by date desc, created_at desc limit 1;

  if v_last_balance is null then
    select opening_balance into v_last_balance from parties where id = new.customer_id;
  end if;

  insert into ledger_entries (party_id, txn_type, txn_id, debit, credit, balance_after, date)
  values (new.customer_id, 'sale', new.id, v_total, 0, coalesce(v_last_balance, 0) + v_total, new.date);

  return new;
end;
$$;

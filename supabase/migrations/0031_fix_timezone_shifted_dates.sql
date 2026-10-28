-- ---------------------------------------------------------------------------
-- Historical data repair for the client-side timezone bug fixed in this
-- release: the app's old `todayStr()`/`daysAgoStr()` helpers computed
-- "today" via `new Date().toISOString().slice(0, 10)`, which converts to
-- UTC before truncating to a calendar date. For Asia/Karachi (UTC+5), that
-- silently returns YESTERDAY's date during local 00:00–04:59 — i.e. any
-- record saved with the default "today" date (not manually overridden)
-- during that window on the clock got stamped one calendar day early.
--
-- This migration assumes the mill operates in Asia/Karachi. If that's ever
-- wrong for a given deployment, none of the WHERE conditions below will
-- match (they're keyed off comparing UTC vs Asia/Karachi), so this is a
-- safe no-op rather than a silent corruption in that case.
--
-- Detection is exact, not a guess: `created_at` is a server-assigned
-- `now()` timestamp untouched by the client bug, so for each row we can
-- directly compute both what the OLD buggy code would have saved (the UTC
-- calendar date of created_at) and what it should have saved (the
-- Asia/Karachi calendar date of created_at). A row is only touched when:
--   1. its stored date equals the provably-buggy value, AND
--   2. that buggy value actually differs from the correct local date
-- This can't misfire on a legitimately backdated entry (e.g. someone
-- entering yesterday's purchase today) unless that entry happened to be
-- entered between local midnight and 5am AND the user picked a date one
-- day before their own local "today" at that exact moment — a coincidence
-- indistinguishable from the bug and left alone by design (see the
-- Yesterday/Day-before-yesterday quick-pick buttons, which aren't touched
-- here — they carried the same intermittent bug, but distinguishing an
-- intentional pick from a bug artifact for those isn't provable this way).
-- ---------------------------------------------------------------------------

-- purchases / payments / receipts / cash_ledger have an AFTER UPDATE
-- trigger that would otherwise re-run avg_cost/stock/ledger side effects
-- for what is only a date-label correction (quantities, rates, amounts are
-- untouched). Disable them for the duration of this fix; the avg_cost/
-- stock replay at the end rebuilds everything from the corrected dates
-- anyway, and ledger_entries.date is synced explicitly below.
alter table purchases disable trigger trg_purchase_update;
alter table payments disable trigger trg_payment_update;
alter table receipts disable trigger trg_receipt_update;
alter table cash_ledger disable trigger trg_cash_ledger_update;

update purchases
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update sales
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update expenses
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update payments
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update receipts
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update roznamcha_entries
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update cash_ledger
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update gate_passes
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update stock_adjustments
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update production_batches
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update bardana_ledger
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update chadai_charges
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update shareholder_ledger
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

update commission_entries
set date = (created_at at time zone 'Asia/Karachi')::date
where date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

-- Installment plans: shift each future installment's due_date by the same
-- one day before correcting the plan's own start_date (due dates were
-- generated from start_date + n * frequency_days at plan-creation time, so
-- a buggy start_date pushed every due_date on the plan off by the same
-- amount). paid_date is intentionally left alone — it's set whenever
-- "Mark Paid" is clicked, with no separate timestamp recorded for that
-- action, so there's no created_at to cross-check it against.
update installments i
set due_date = i.due_date + 1
from installment_plans ip
where i.plan_id = ip.id
  and ip.start_date = (ip.created_at at time zone 'UTC')::date
  and (ip.created_at at time zone 'UTC')::date <> (ip.created_at at time zone 'Asia/Karachi')::date;

update installment_plans
set start_date = (created_at at time zone 'Asia/Karachi')::date
where start_date = (created_at at time zone 'UTC')::date
  and (created_at at time zone 'UTC')::date <> (created_at at time zone 'Asia/Karachi')::date;

alter table purchases enable trigger trg_purchase_update;
alter table payments enable trigger trg_payment_update;
alter table receipts enable trigger trg_receipt_update;
alter table cash_ledger enable trigger trg_cash_ledger_update;

-- ledger_entries.date isn't touched by re-firing any trigger above (it was
-- disabled), so sync it explicitly to the now-corrected header dates.
update ledger_entries le set date = p.date
from purchases p where le.txn_type = 'purchase' and le.txn_id = p.id and le.date <> p.date;
update ledger_entries le set date = s.date
from sales s where le.txn_type = 'sale' and le.txn_id = s.id and le.date <> s.date;
update ledger_entries le set date = pay.date
from payments pay where le.txn_type = 'payment' and le.txn_id = pay.id and le.date <> pay.date;
update ledger_entries le set date = r.date
from receipts r where le.txn_type = 'receipt' and le.txn_id = r.id and le.date <> r.date;

-- Recompute every party's balance_after chain now that some entries may
-- have reordered relative to their neighbors (a date correction can change
-- chronological order within a party's history, even though the displayed
-- net balance — computed fresh from ledger.ts on every render — was never
-- actually wrong).
do $$
declare
  v_party record;
begin
  for v_party in select id from parties loop
    perform fn_recompute_party_balance(v_party.id);
  end loop;
end $$;

-- items.avg_cost / item_stock were built by replaying purchases/sales/
-- production/adjustments in date order — with some dates now corrected,
-- that chronological order can differ, so rebuild from scratch exactly as
-- 0023_gross_stock_quantity.sql and 0027_fix_kaat_watta_double_deduction.sql
-- already did for the same reason.
do $$
declare
  r record;
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
begin
  update item_stock set qty_kg = 0;
  update items set avg_cost = 0;

  for r in
    select date as ev_date, created_at as ev_created_at, item_id, warehouse_id,
           weighed_qty_kg as qty_delta, total as cost_basis
    from purchases
    union all
    select s.date, s.created_at, si.item_id, s.warehouse_id, -si.weighed_qty_kg, null
    from sale_items si join sales s on s.id = si.sale_id
    union all
    select pb.date, pb.created_at, pi.item_id, pb.warehouse_id, -pi.qty_kg, null
    from production_inputs pi join production_batches pb on pb.id = pi.batch_id
    union all
    select pb.date, pb.created_at, po.item_id, pb.warehouse_id, po.qty_kg, po.qty_kg * po.rate
    from production_outputs po join production_batches pb on pb.id = po.batch_id
    union all
    select date, created_at, item_id, warehouse_id, qty_delta_kg, null
    from stock_adjustments
    order by ev_date, ev_created_at
  loop
    if r.cost_basis is not null then
      select coalesce(sum(qty_kg), 0) into v_old_qty from item_stock where item_id = r.item_id;
      select avg_cost into v_old_avg from items where id = r.item_id;
      if (v_old_qty + r.qty_delta) = 0 then
        v_new_avg := 0;
      else
        v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + r.cost_basis) / (v_old_qty + r.qty_delta);
      end if;
      update items set avg_cost = v_new_avg where id = r.item_id;
    end if;

    insert into item_stock (item_id, warehouse_id, qty_kg)
    values (r.item_id, r.warehouse_id, r.qty_delta)
    on conflict (item_id, warehouse_id) do update set qty_kg = item_stock.qty_kg + excluded.qty_kg;
  end loop;
end $$;

-- Gate Pass enhancements:
--   1. gate_pass_no — a human-friendly sequential number (like invoice_no).
--   2. party_name — free text, either typed manually or copied from selecting
--      an existing vendor/customer in the UI (no FK — gate passes aren't
--      ledger transactions, so we don't need referential integrity here).
--   3. date — an explicit, user-editable date (separate from gate_time, which
--      stays as the automatic "recorded at" timestamp).
--   4. Multiple items per gate pass via a new gate_pass_items junction table,
--      replacing the old single item_id/qty_kg columns.

alter table gate_passes add column gate_pass_no bigserial;
alter table gate_passes add column party_name text;
alter table gate_passes add column date date not null default current_date;

create table gate_pass_items (
  id uuid primary key default gen_random_uuid(),
  gate_pass_id uuid not null references gate_passes (id) on delete cascade,
  item_id uuid not null references items (id),
  qty_kg numeric not null check (qty_kg > 0)
);

-- Backfill: carry over each existing gate pass's single item/qty into the new table.
insert into gate_pass_items (gate_pass_id, item_id, qty_kg)
select id, item_id, qty_kg from gate_passes;

alter table gate_passes drop column item_id;
alter table gate_passes drop column qty_kg;

alter table gate_pass_items enable row level security;

create policy gate_pass_items_select on gate_pass_items for select
  using (current_profile_role() in ('owner_admin', 'warehouse_staff', 'accountant', 'sales_purchase_staff'));
create policy gate_pass_items_write on gate_pass_items for insert
  with check (current_profile_role() in ('owner_admin', 'warehouse_staff'));
create policy gate_pass_items_delete on gate_pass_items for delete
  using (current_profile_role() in ('owner_admin', 'warehouse_staff'));

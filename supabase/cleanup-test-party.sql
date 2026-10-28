-- ============================================================
-- Removes everything created by seed-test-party.sql. Paste into
-- the Supabase SQL Editor once you're done looking at the demo.
-- Deleting from purchases/sales fires the existing delete
-- triggers, which reverse stock and remove/recompute the
-- ledger automatically — no manual ledger_entries cleanup needed.
-- ============================================================
do $$
declare
  v_party_id uuid;
  v_item_id uuid;
  v_warehouse_id uuid;
begin
  select id into v_party_id from parties where name = 'Test Combined Party (delete me)';
  select id into v_item_id from items where name = 'TEST ITEM (delete me)';
  select id into v_warehouse_id from warehouses where name = 'TEST WAREHOUSE (delete me)';

  if v_party_id is not null then
    delete from sales where customer_id = v_party_id;
    delete from purchases where vendor_id = v_party_id;
    delete from parties where id = v_party_id;
  end if;

  if v_item_id is not null then
    delete from item_stock where item_id = v_item_id;
    delete from items where id = v_item_id;
  end if;

  if v_warehouse_id is not null then
    delete from warehouses where id = v_warehouse_id;
  end if;
end $$;

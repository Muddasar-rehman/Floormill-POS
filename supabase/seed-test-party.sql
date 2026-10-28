-- ============================================================
-- DEMO DATA — not a schema migration, do not add to
-- supabase/migrations/. Paste into the Supabase SQL Editor to
-- create one throwaway party with both a purchase (payable) and
-- a sale (receivable), so you can see the combined Khata in
-- action. Everything it creates is named "... (delete me)" so
-- it's easy to find and remove with cleanup-test-party.sql.
-- ============================================================
do $$
declare
  v_item_id uuid;
  v_warehouse_id uuid;
  v_party_id uuid;
begin
  insert into items (name, category, mun_kg, avg_cost, is_protected)
  values ('TEST ITEM (delete me)', 'test', 40, 0, false)
  returning id into v_item_id;

  insert into warehouses (name)
  values ('TEST WAREHOUSE (delete me)')
  returning id into v_warehouse_id;

  insert into item_stock (item_id, warehouse_id, qty_kg)
  values (v_item_id, v_warehouse_id, 1000);

  -- Created as a vendor with opening_balance 5000 (payable at the start).
  insert into parties (type, name, opening_balance)
  values ('vendor', 'Test Combined Party (delete me)', 5000)
  returning id into v_party_id;

  -- Purchase FROM them: 100kg @ 50 = 5,000 — adds to what you owe them.
  insert into purchases (vendor_id, item_id, warehouse_id, weighed_qty_kg, kaat_pct, rate, watta_pct, date)
  values (v_party_id, v_item_id, v_warehouse_id, 100, 0, 50, 0, current_date);

  -- Sale TO the same party: 50kg @ 120 = 6,000 — nets against what you owe them.
  perform fn_record_sale(
    v_party_id,
    v_warehouse_id,
    current_date,
    jsonb_build_array(jsonb_build_object('item_id', v_item_id, 'weighed_qty_kg', 50, 'kaat_pct', 0, 'rate', 120, 'watta_pct', 0))
  );

  raise notice 'Created test party id: %', v_party_id;
end $$;

-- Expected result on the Khata page for "Test Combined Party (delete me)":
--   Opening Balance   -5000.00
--   Purchase          -10000.00
--   Sale               -4000.00   ("You owe 4000.00")

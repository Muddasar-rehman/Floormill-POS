-- ---------------------------------------------------------------------------
-- Merge Vendors and Customers into a single "Party" concept. The app has
-- always allowed the same party to be picked in both a purchase and a sale
-- at the database level (no FK/check constraint ever required vendor_id to
-- point at a type='vendor' row, or customer_id at type='customer') — Kaat/
-- Watta, ledger math, AP/AR, Trial Balance, Balance Sheet, and the Khata
-- report already compute a party's position purely from their transaction
-- history (see packages/shared/src/ledger.ts: ledgerEntryNetDelta), not
-- from this label. `type` only ever drove the Vendors/Customers page split
-- and the sign of a freshly-created party's opening_balance.
--
-- Sign convention going forward: opening_balance is stored already signed
-- on the same scale as everywhere else in the app — positive = the party
-- owes the mill (receivable), negative = the mill owes the party
-- (payable). Previously that sign was inferred at read time from `type`
-- (vendor: negate, customer: as-is) by ledger.ts's openingNet(). Since
-- `type` is going away, that flip has to happen once, here, for existing
-- rows, so every party's stored opening_balance keeps meaning exactly what
-- it meant before.
-- ---------------------------------------------------------------------------
update parties
set opening_balance = -opening_balance
where type = 'vendor' and opening_balance <> 0;

alter table parties drop column type;
drop type party_type;

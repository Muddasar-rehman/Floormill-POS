-- fn_roznamcha_entry_delete ran as a BEFORE DELETE trigger, so it tried to
-- delete the linked payment/receipt/expense row while the roznamcha_entries
-- row referencing it (via linked_payment_id/linked_receipt_id/linked_expense_id)
-- still existed in the table — violating the very FK it holds. Switching to
-- AFTER DELETE fixes this: by then the roznamcha_entries row is already gone,
-- so deleting the linked row no longer conflicts with anything.
drop trigger trg_roznamcha_entry_delete on roznamcha_entries;

create trigger trg_roznamcha_entry_delete
after delete on roznamcha_entries
for each row execute function fn_roznamcha_entry_delete();

-- Safety net: also make these FKs ON DELETE SET NULL, so deleting a
-- payment/receipt/expense directly (bypassing Roznamcha) is never blocked by
-- a stale roznamcha_entries reference.
alter table roznamcha_entries drop constraint roznamcha_entries_linked_payment_id_fkey;
alter table roznamcha_entries add constraint roznamcha_entries_linked_payment_id_fkey
  foreign key (linked_payment_id) references payments (id) on delete set null;

alter table roznamcha_entries drop constraint roznamcha_entries_linked_receipt_id_fkey;
alter table roznamcha_entries add constraint roznamcha_entries_linked_receipt_id_fkey
  foreign key (linked_receipt_id) references receipts (id) on delete set null;

alter table roznamcha_entries drop constraint roznamcha_entries_linked_expense_id_fkey;
alter table roznamcha_entries add constraint roznamcha_entries_linked_expense_id_fkey
  foreign key (linked_expense_id) references expenses (id) on delete set null;

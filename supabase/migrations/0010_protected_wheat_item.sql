-- Wheat needs to be a permanent, guaranteed-to-exist item that the Wheat
-- Purchases page can always point to — independent of its display name
-- (which the owner may still edit) and impossible to delete by accident.

alter table items add column key text unique;
alter table items add column is_protected boolean not null default false;

-- If an item already named "Wheat" exists, adopt it as the protected one
-- instead of creating a duplicate.
update items set is_protected = true, key = 'wheat'
where lower(name) = 'wheat' and key is null;

-- Otherwise, create it.
insert into items (name, category, mun_kg, is_protected, key)
select 'Wheat', 'Raw Material', 40, true, 'wheat'
where not exists (select 1 from items where key = 'wheat');

create or replace function fn_prevent_protected_item_delete() returns trigger
language plpgsql as $$
begin
  if old.is_protected then
    raise exception 'This item is protected and cannot be deleted.';
  end if;
  return old;
end;
$$;

create trigger trg_prevent_protected_item_delete
before delete on items
for each row execute function fn_prevent_protected_item_delete();

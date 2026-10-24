begin;

alter table public.inventory
  add column if not exists low_stock_threshold integer not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_low_stock_threshold_nonnegative'
      and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_low_stock_threshold_nonnegative
      check (low_stock_threshold >= 0);
  end if;
end $$;

commit;

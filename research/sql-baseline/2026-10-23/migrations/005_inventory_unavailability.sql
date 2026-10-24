begin;

create table if not exists public.inventory_unavailability (
  id bigint generated always as identity primary key,
  inventory_id bigint not null references public.inventory(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_unavailability_valid_range check (start_date <= end_date)
);

create index if not exists inventory_unavailability_item_dates_idx
  on public.inventory_unavailability (inventory_id, start_date, end_date);

alter table public.inventory_unavailability enable row level security;

drop policy if exists inventory_unavailability_admin_read on public.inventory_unavailability;
create policy inventory_unavailability_admin_read
  on public.inventory_unavailability for select to authenticated
  using (public.current_user_role() = 'admin');

revoke insert, update, delete on public.inventory_unavailability from authenticated;
grant select on public.inventory_unavailability to authenticated;

commit;

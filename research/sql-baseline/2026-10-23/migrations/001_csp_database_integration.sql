begin;

alter table public.inventory
  add column if not exists reserved_quantity integer not null default 0,
  add column if not exists borrowed_quantity integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_reserved_quantity_nonnegative'
  ) then
    alter table public.inventory
      add constraint inventory_reserved_quantity_nonnegative check (reserved_quantity >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_borrowed_quantity_nonnegative'
  ) then
    alter table public.inventory
      add constraint inventory_borrowed_quantity_nonnegative check (borrowed_quantity >= 0);
  end if;
end $$;

alter table public.borrow_requests
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.laboratory_rooms (
  id bigint generated always as identity primary key,
  name text not null unique,
  room_type text not null default 'laboratory',
  capacity integer not null default 1 check (capacity > 0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) > 0),
  event_date date not null,
  start_time time,
  end_time time,
  event_type text not null default 'activity'
    check (event_type in ('activity', 'holiday', 'reminder', 'borrowing')),
  description text,
  room_id bigint references public.laboratory_rooms(id) on delete restrict,
  borrow_request_id bigint references public.borrow_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_time_pair check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  )
);

insert into public.laboratory_rooms (name, room_type, capacity, features)
values ('Kitchen Laboratory', 'kitchen', 30, '{"oven": true}'::jsonb)
on conflict (name) do nothing;

create index if not exists borrow_requests_status_dates_idx
  on public.borrow_requests (status, borrow_date, return_date);
create index if not exists borrow_request_items_inventory_idx
  on public.borrow_request_items (inventory_id, request_id);
create index if not exists calendar_events_date_idx
  on public.calendar_events (event_date);
create index if not exists calendar_events_room_time_idx
  on public.calendar_events (room_id, event_date, start_time, end_time);
create unique index if not exists calendar_events_borrow_request_unique
  on public.calendar_events (borrow_request_id)
  where borrow_request_id is not null;

-- Rebuild counters from the authoritative transaction tables. This also
-- backfills requests created before this migration.
update public.inventory set reserved_quantity = 0, borrowed_quantity = 0;

update public.inventory inventory
set reserved_quantity = totals.quantity
from (
  select items.inventory_id, sum(items.quantity)::integer as quantity
  from public.borrow_request_items items
  join public.borrow_requests requests on requests.id = items.request_id
  where requests.status in ('Pending', 'Validated', 'Approved')
  group by items.inventory_id
) totals
where inventory.id = totals.inventory_id;

update public.inventory inventory
set borrowed_quantity = totals.quantity
from (
  select items.inventory_id, sum(items.quantity)::integer as quantity
  from public.borrow_request_items items
  join public.borrow_requests requests on requests.id = items.request_id
  where requests.status = 'Borrowed'
  group by items.inventory_id
) totals
where inventory.id = totals.inventory_id;

-- Add tables to Supabase Realtime only when the publication exists and the
-- table is not already a member.
do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array[
      'inventory', 'borrow_requests', 'borrow_request_items',
      'calendar_events', 'laboratory_rooms'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end $$;

commit;

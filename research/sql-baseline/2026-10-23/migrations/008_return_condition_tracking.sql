begin;

alter table public.borrow_requests
  add column if not exists actual_returned_at timestamptz;

create table if not exists public.borrowing_returns (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.borrow_requests(id) on delete cascade,
  processed_by uuid references auth.users(id) on delete set null,
  remarks text check (remarks is null or length(remarks) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.borrowing_return_items (
  id bigint generated always as identity primary key,
  return_id bigint not null references public.borrowing_returns(id) on delete cascade,
  request_id bigint not null references public.borrow_requests(id) on delete cascade,
  inventory_id bigint not null references public.inventory(id) on delete restrict,
  good_quantity integer not null default 0 check (good_quantity >= 0),
  damaged_quantity integer not null default 0 check (damaged_quantity >= 0),
  missing_quantity integer not null default 0 check (missing_quantity >= 0),
  condition_note text check (condition_note is null or length(condition_note) <= 500),
  created_at timestamptz not null default now(),
  constraint return_item_has_quantity check (good_quantity + damaged_quantity + missing_quantity > 0),
  constraint return_item_once_per_batch unique (return_id, inventory_id)
);

create index if not exists borrowing_returns_request_idx on public.borrowing_returns (request_id, created_at desc);
create index if not exists borrowing_return_items_request_item_idx on public.borrowing_return_items (request_id, inventory_id);

-- Preserve the meaning of requests completed before condition tracking existed.
insert into public.borrowing_returns (request_id, processed_by, remarks, created_at)
select request.id, null, 'Migrated from the previous return workflow.', request.updated_at
from public.borrow_requests request
where request.status = 'Returned'
  and not exists (select 1 from public.borrowing_returns existing where existing.request_id = request.id);

insert into public.borrowing_return_items
  (return_id, request_id, inventory_id, good_quantity, damaged_quantity, missing_quantity, condition_note, created_at)
select migrated.id, item.request_id, item.inventory_id, sum(item.quantity)::integer, 0, 0,
       'Condition was not recorded by the previous return workflow.', migrated.created_at
from public.borrow_request_items item
join public.borrowing_returns migrated on migrated.request_id = item.request_id
  and migrated.remarks = 'Migrated from the previous return workflow.'
where item.quantity > 0
  and not exists (select 1 from public.borrowing_return_items existing
  where existing.request_id = item.request_id and existing.inventory_id = item.inventory_id)
group by migrated.id, item.request_id, item.inventory_id, migrated.created_at;

update public.borrow_requests
set actual_returned_at = coalesce(actual_returned_at, updated_at)
where status = 'Returned';

alter table public.borrowing_returns enable row level security;
alter table public.borrowing_return_items enable row level security;
revoke all on public.borrowing_returns, public.borrowing_return_items from anon, authenticated;
grant select on public.borrowing_returns, public.borrowing_return_items to authenticated;

drop policy if exists borrowing_returns_role_read on public.borrowing_returns;
create policy borrowing_returns_role_read on public.borrowing_returns for select to authenticated using (
  exists (select 1 from public.borrow_requests request
    where request.id = borrowing_returns.request_id and (request.user_id = auth.uid() or public.current_user_role() in ('professor', 'admin')))
);
drop policy if exists borrowing_return_items_role_read on public.borrowing_return_items;
create policy borrowing_return_items_role_read on public.borrowing_return_items for select to authenticated using (
  exists (select 1 from public.borrow_requests request
    where request.id = borrowing_return_items.request_id and (request.user_id = auth.uid() or public.current_user_role() in ('professor', 'admin')))
);

do $$
declare target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array['borrowing_returns', 'borrowing_return_items'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = target_table) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end $$;

commit;

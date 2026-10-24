begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'professor', 'admin')),
  full_name text not null check (length(trim(full_name)) > 0),
  student_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_student_id_required check (
    role <> 'student' or coalesce(length(trim(student_id)), 0) > 0
  )
);

create unique index if not exists profiles_student_id_unique
  on public.profiles (lower(trim(student_id))) where student_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, role, full_name, student_id)
  values (
    new.id,
    'student',
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, new.id::text), '@', 1)),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'student_id'), ''), new.email, new.id::text)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (user_id, role, full_name, student_id)
select id, 'student',
       coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(email, id::text), '@', 1)),
       coalesce(nullif(trim(raw_user_meta_data ->> 'student_id'), ''), email, id::text)
from auth.users
on conflict (user_id) do nothing;

alter table public.borrow_requests
  add column if not exists user_id uuid references auth.users(id) on delete restrict;
create index if not exists borrow_requests_user_created_idx
  on public.borrow_requests (user_id, created_at desc);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.inventory enable row level security;
alter table public.borrow_requests enable row level security;
alter table public.borrow_request_items enable row level security;
alter table public.calendar_events enable row level security;
alter table public.laboratory_rooms enable row level security;

-- Replace any development-era policies so a permissive policy cannot bypass
-- the role model below (PostgreSQL ORs policies for the same operation).
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'profiles', 'inventory', 'borrow_requests', 'borrow_request_items',
        'calendar_events', 'laboratory_rooms'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I',
      policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end $$;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists inventory_read_authenticated on public.inventory;
create policy inventory_read_authenticated on public.inventory for select to authenticated using (true);
drop policy if exists inventory_admin_insert on public.inventory;
create policy inventory_admin_insert on public.inventory for insert to authenticated
  with check (public.current_user_role() = 'admin');
drop policy if exists inventory_admin_update on public.inventory;
create policy inventory_admin_update on public.inventory for update to authenticated
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
drop policy if exists inventory_admin_delete on public.inventory;
create policy inventory_admin_delete on public.inventory for delete to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists borrow_requests_role_read on public.borrow_requests;
create policy borrow_requests_role_read on public.borrow_requests for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('professor', 'admin'));

drop policy if exists borrow_items_role_read on public.borrow_request_items;
create policy borrow_items_role_read on public.borrow_request_items for select to authenticated
  using (exists (
    select 1 from public.borrow_requests request
    where request.id = request_id
      and (request.user_id = auth.uid() or public.current_user_role() in ('professor', 'admin'))
  ));

drop policy if exists calendar_read_authenticated on public.calendar_events;
create policy calendar_read_authenticated on public.calendar_events for select to authenticated using (true);
drop policy if exists rooms_read_authenticated on public.laboratory_rooms;
create policy rooms_read_authenticated on public.laboratory_rooms for select to authenticated using (true);

grant select on public.profiles, public.inventory, public.borrow_requests,
  public.borrow_request_items, public.calendar_events, public.laboratory_rooms to authenticated;
grant insert, update, delete on public.inventory to authenticated;
revoke insert, update, delete on public.borrow_requests, public.borrow_request_items,
  public.calendar_events, public.laboratory_rooms from authenticated;

commit;

begin;

alter table public.profiles add column if not exists is_active boolean not null default true;
create index if not exists profiles_role_active_idx on public.profiles (role, is_active);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid() and is_active = true
$$;
create or replace function public.current_user_is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where user_id = auth.uid()), false)
$$;
revoke all on function public.current_user_is_active() from public;
grant execute on function public.current_user_is_active() to authenticated;

drop policy if exists inventory_read_authenticated on public.inventory;
create policy inventory_read_authenticated on public.inventory for select to authenticated
  using (public.current_user_is_active());
drop policy if exists calendar_read_authenticated on public.calendar_events;
create policy calendar_read_authenticated on public.calendar_events for select to authenticated
  using (public.current_user_is_active());
drop policy if exists rooms_read_authenticated on public.laboratory_rooms;
create policy rooms_read_authenticated on public.laboratory_rooms for select to authenticated
  using (public.current_user_is_active());
drop policy if exists borrow_requests_role_read on public.borrow_requests;
create policy borrow_requests_role_read on public.borrow_requests for select to authenticated
  using (public.current_user_is_active() and (user_id = auth.uid() or public.current_user_role() in ('professor', 'admin')));
drop policy if exists borrow_items_role_read on public.borrow_request_items;
create policy borrow_items_role_read on public.borrow_request_items for select to authenticated using (
  public.current_user_is_active() and exists (select 1 from public.borrow_requests request
    where request.id = request_id and (request.user_id = auth.uid() or public.current_user_role() in ('professor', 'admin')))
);
drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
  using (public.current_user_is_active() and recipient_user_id = auth.uid());
drop policy if exists notifications_own_mark_read on public.notifications;
create policy notifications_own_mark_read on public.notifications for update to authenticated
  using (public.current_user_is_active() and recipient_user_id = auth.uid())
  with check (public.current_user_is_active() and recipient_user_id = auth.uid() and read_at is not null);
drop policy if exists borrowing_returns_role_read on public.borrowing_returns;
create policy borrowing_returns_role_read on public.borrowing_returns for select to authenticated using (
  public.current_user_is_active() and exists (select 1 from public.borrow_requests request
    where request.id = borrowing_returns.request_id and (request.user_id = auth.uid() or public.current_user_role() in ('professor', 'admin')))
);
drop policy if exists borrowing_return_items_role_read on public.borrowing_return_items;
create policy borrowing_return_items_role_read on public.borrowing_return_items for select to authenticated using (
  public.current_user_is_active() and exists (select 1 from public.borrow_requests request
    where request.id = borrowing_return_items.request_id and (request.user_id = auth.uid() or public.current_user_role() in ('professor', 'admin')))
);

commit;

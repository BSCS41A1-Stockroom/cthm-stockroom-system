begin;

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type ~ '^[a-z0-9_]+$'),
  title text not null check (length(trim(title)) between 1 and 120),
  message text not null check (length(trim(message)) between 1 and 500),
  related_path text check (related_path is null or (related_path like '/%' and length(related_path) <= 300)),
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc, id desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
using (recipient_user_id = auth.uid());
drop policy if exists notifications_own_mark_read on public.notifications;
create policy notifications_own_mark_read on public.notifications for update to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid() and read_at is not null);

create or replace function public.notify_low_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_available integer;
  new_available integer;
begin
  new_available := greatest(0, coalesce(new.quantity, 0) + coalesce(new.additional_qty, 0)
    - coalesce(new.replaces, 0) - coalesce(new.missing, 0) - coalesce(new.breakage, 0)
    - coalesce(new.defective, 0) - coalesce(new.total_loss, 0)
    - coalesce(new.reserved_quantity, 0) - coalesce(new.borrowed_quantity, 0));
  if tg_op = 'UPDATE' then
    old_available := greatest(0, coalesce(old.quantity, 0) + coalesce(old.additional_qty, 0)
      - coalesce(old.replaces, 0) - coalesce(old.missing, 0) - coalesce(old.breakage, 0)
      - coalesce(old.defective, 0) - coalesce(old.total_loss, 0)
      - coalesce(old.reserved_quantity, 0) - coalesce(old.borrowed_quantity, 0));
  end if;

  if new_available <= new.low_stock_threshold
     and (tg_op = 'INSERT' or old_available > old.low_stock_threshold) then
    insert into public.notifications
      (recipient_user_id, type, title, message, related_path, entity_type, entity_id)
    select user_id, 'low_inventory', 'Low inventory alert',
      new.item_name || ' has ' || new_available || ' available unit(s) remaining.',
      case when role = 'admin' then '/admin/inventory' else '/admin' end,
      'inventory', new.id::text
    from public.profiles where role in ('professor', 'admin');
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_low_notification_trigger on public.inventory;
create trigger inventory_low_notification_trigger
after insert or update on public.inventory
for each row execute function public.notify_low_inventory();
revoke all on function public.notify_low_inventory() from public;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;

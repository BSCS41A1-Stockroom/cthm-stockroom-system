begin;

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) between 1 and 150),
  description text not null check (length(trim(description)) between 1 and 1000),
  published_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_active_published_idx
  on public.announcements (published_at desc, id desc) where is_active = true;
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
drop policy if exists announcements_active_read on public.announcements;
create policy announcements_active_read on public.announcements for select to authenticated
using (public.current_user_is_active() and is_active and published_at <= now());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements') then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;
commit;

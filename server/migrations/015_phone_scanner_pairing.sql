begin;

create table if not exists public.qr_scanner_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  secret_hash text not null check (length(secret_hash) = 64),
  status text not null default 'waiting' check (status in ('waiting', 'connected', 'scanned', 'closed')),
  scanned_user_id uuid references auth.users(id) on delete set null,
  scan_sequence integer not null default 0 check (scan_sequence >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.qr_scanner_sessions drop constraint if exists qr_scanner_sessions_status_check;
alter table public.qr_scanner_sessions add constraint qr_scanner_sessions_status_check
  check (status in ('waiting', 'connected', 'scanned', 'closed'));

create index if not exists qr_scanner_sessions_staff_expiry_idx
  on public.qr_scanner_sessions (staff_user_id, expires_at desc);

alter table public.qr_scanner_sessions enable row level security;
revoke all on public.qr_scanner_sessions from anon, authenticated;
grant select on public.qr_scanner_sessions to authenticated;

drop policy if exists qr_scanner_sessions_owner_read on public.qr_scanner_sessions;
create policy qr_scanner_sessions_owner_read on public.qr_scanner_sessions for select to authenticated
using (staff_user_id = auth.uid() and public.current_user_role() in ('professor', 'admin'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public' and tablename='qr_scanner_sessions'
  ) then
    alter publication supabase_realtime add table public.qr_scanner_sessions;
  end if;
end $$;

commit;

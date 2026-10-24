begin;

create table if not exists public.borrow_request_custodian_authorizations (
  request_id bigint primary key references public.borrow_requests(id) on delete cascade,
  verified_by uuid references public.profiles(user_id) on delete restrict,
  verified_name text,
  verified_signature_image bytea,
  verified_signature_mime_type text,
  verified_signature_hash text,
  verified_at timestamptz,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  approved_name text,
  approved_signature_image bytea,
  approved_signature_mime_type text,
  approved_signature_hash text,
  approved_at timestamptz,
  authorization_snapshot jsonb,
  document_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custodian_verification_complete check (
    (verified_by is null and verified_name is null and verified_signature_image is null
      and verified_signature_mime_type is null and verified_signature_hash is null and verified_at is null)
    or (verified_by is not null and verified_name is not null and verified_signature_image is not null
      and verified_signature_mime_type in ('image/png','image/jpeg') and verified_signature_hash is not null and verified_at is not null)
  ),
  constraint custodian_approval_complete check (
    (approved_by is null and approved_name is null and approved_signature_image is null
      and approved_signature_mime_type is null and approved_signature_hash is null and approved_at is null
      and authorization_snapshot is null and document_hash is null)
    or (verified_by is not null and approved_by is not null and approved_name is not null and approved_signature_image is not null
      and approved_signature_mime_type in ('image/png','image/jpeg') and approved_signature_hash is not null
      and approved_at is not null and authorization_snapshot is not null and document_hash is not null)
  ),
  constraint custodian_authorization_order check (approved_at is null or approved_at >= verified_at)
);

create index if not exists custodian_authorizations_pending_idx
  on public.borrow_request_custodian_authorizations(verified_at,approved_at,updated_at);
alter table public.borrow_request_custodian_authorizations enable row level security;
revoke all on public.borrow_request_custodian_authorizations from anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
      and tablename='borrow_request_custodian_authorizations'
  ) then
    alter publication supabase_realtime add table public.borrow_request_custodian_authorizations;
  end if;
end $$;

commit;

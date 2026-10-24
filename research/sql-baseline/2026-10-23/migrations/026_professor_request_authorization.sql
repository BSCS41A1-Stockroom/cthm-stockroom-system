create extension if not exists pgcrypto;

create table if not exists public.professor_signatures (
  professor_user_id uuid primary key references public.profiles(user_id) on delete cascade,
  image_data bytea not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg')),
  image_hash text not null,
  updated_at timestamptz not null default now(),
  check (octet_length(image_data) between 1 and 262144)
);

create table if not exists public.borrow_request_authorizations (
  request_id bigint primary key references public.borrow_requests(id) on delete cascade,
  review_token uuid not null unique default gen_random_uuid(),
  status text not null default 'awaiting' check (status in ('awaiting','authorized','rejected')),
  professor_user_id uuid references public.profiles(user_id),
  professor_name text,
  signature_image bytea,
  signature_mime_type text,
  signature_hash text,
  authorized_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  request_snapshot jsonb,
  document_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'authorized') or
    (professor_user_id is not null and professor_name is not null and signature_image is not null
      and signature_hash is not null and authorized_at is not null and request_snapshot is not null and document_hash is not null))
);

insert into public.borrow_request_authorizations (request_id, status)
select id, case when status in ('Validated','Approved','Borrowed','Returned') then 'authorized' else 'awaiting' end
from public.borrow_requests request
where status = 'Pending'
  and not exists (
    select 1
    from public.borrow_request_authorizations as authz
    where authz.request_id = request.id
  );

alter table public.professor_signatures enable row level security;
alter table public.borrow_request_authorizations enable row level security;
revoke all on public.professor_signatures, public.borrow_request_authorizations from anon, authenticated;

create index if not exists borrow_request_authorizations_status_idx
  on public.borrow_request_authorizations(status, created_at);

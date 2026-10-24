begin;

create table if not exists public.student_signatures (
  student_user_id uuid primary key references auth.users(id) on delete cascade,
  image_data bytea not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg')),
  image_hash text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.borrow_request_student_signatures (
  request_id bigint primary key references public.borrow_requests(id) on delete restrict,
  student_user_id uuid not null references auth.users(id) on delete restrict,
  student_name text not null,
  signature_image bytea not null,
  signature_mime_type text not null check (signature_mime_type in ('image/png','image/jpeg')),
  signature_hash text not null check (signature_hash ~ '^[0-9a-f]{64}$'),
  consented_at timestamptz not null default now()
);

create or replace function public.validate_student_signature_owner()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.profiles where user_id=new.student_user_id and role='student' and is_active=true) then
    raise exception 'Borrower signatures require an active Student account.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists student_signature_owner_check on public.student_signatures;
create trigger student_signature_owner_check before insert or update of student_user_id on public.student_signatures
for each row execute function public.validate_student_signature_owner();

create or replace function public.prevent_student_signature_snapshot_mutation()
returns trigger language plpgsql as $$ begin
  raise exception 'Borrower signature snapshots are immutable.' using errcode='55000';
end; $$;

drop trigger if exists immutable_student_signature_snapshot on public.borrow_request_student_signatures;
create trigger immutable_student_signature_snapshot before update or delete on public.borrow_request_student_signatures
for each row execute function public.prevent_student_signature_snapshot_mutation();

alter table public.student_signatures enable row level security;
alter table public.borrow_request_student_signatures enable row level security;
revoke all on public.student_signatures,public.borrow_request_student_signatures from anon,authenticated;
revoke all on function public.validate_student_signature_owner() from public,anon,authenticated;
revoke all on function public.prevent_student_signature_snapshot_mutation() from public,anon,authenticated;

commit;

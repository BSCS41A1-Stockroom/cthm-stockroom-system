begin;

create table if not exists public.custodian_signatures (
  custodian_user_id uuid primary key references public.profiles(user_id) on delete cascade,
  image_data bytea not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg')),
  image_hash text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.validate_custodian_signature_owner()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.profiles
    where user_id=new.custodian_user_id and role='staff' and is_active=true
  ) then
    raise exception 'Custodian signatures require an active Staff account.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists custodian_signature_owner_check on public.custodian_signatures;
create trigger custodian_signature_owner_check
before insert or update of custodian_user_id on public.custodian_signatures
for each row execute function public.validate_custodian_signature_owner();

alter table public.custodian_signatures enable row level security;
revoke all on public.custodian_signatures from anon, authenticated;
revoke all on function public.validate_custodian_signature_owner() from public;

commit;

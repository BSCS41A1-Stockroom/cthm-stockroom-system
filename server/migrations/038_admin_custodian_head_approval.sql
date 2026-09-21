begin;

create table if not exists public.admin_signatures (
  admin_user_id uuid primary key references public.profiles(user_id) on delete cascade,
  image_data bytea not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg')),
  image_hash text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.validate_admin_signature_owner()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.profiles where user_id=new.admin_user_id and role='admin' and is_active=true) then
    raise exception 'Custodian Head signatures require an active Admin account.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_signature_owner_check on public.admin_signatures;
create trigger admin_signature_owner_check before insert or update of admin_user_id on public.admin_signatures
for each row execute function public.validate_admin_signature_owner();

create or replace function public.validate_custodian_authorization_roles()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.verified_by is not null and not exists (
    select 1 from public.profiles where user_id=new.verified_by and role='staff' and is_active=true
  ) then
    raise exception 'Request verification requires an active Staff account.' using errcode='23514';
  end if;
  if new.approved_by is not null and not exists (
    select 1 from public.profiles where user_id=new.approved_by and role='admin' and is_active=true
  ) then
    raise exception 'Final approval requires an active Custodian Head Admin account.' using errcode='23514';
  end if;
  return new;
end;
$$;

alter table public.admin_signatures enable row level security;
revoke all on public.admin_signatures from anon,authenticated;
revoke all on function public.validate_admin_signature_owner() from public,anon,authenticated;
revoke all on function public.validate_custodian_authorization_roles() from public,anon,authenticated;

commit;

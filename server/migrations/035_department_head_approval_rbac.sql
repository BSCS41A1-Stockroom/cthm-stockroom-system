begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student','professor','staff','department_head','admin'));
alter table public.profiles drop constraint if exists profiles_department_role_department_required;
alter table public.profiles add constraint profiles_department_role_department_required
  check (role not in ('staff','department_head') or department_id is not null) not valid;

create table if not exists public.department_head_signatures (
  department_head_user_id uuid primary key references public.profiles(user_id) on delete cascade,
  image_data bytea not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg')),
  image_hash text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.validate_department_head_signature_owner()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.profiles where user_id=new.department_head_user_id
    and role='department_head' and department_id is not null and is_active=true) then
    raise exception 'Signatures require an active Department Head account.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists department_head_signature_owner_check on public.department_head_signatures;
create trigger department_head_signature_owner_check before insert or update of department_head_user_id
on public.department_head_signatures for each row execute function public.validate_department_head_signature_owner();

create or replace function public.validate_custodian_authorization_roles()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.verified_by is not null and not exists (select 1 from public.profiles where user_id=new.verified_by and role='staff' and is_active=true) then
    raise exception 'Request verification requires an active Staff account.' using errcode='23514';
  end if;
  if new.approved_by is not null and not exists (select 1 from public.profiles where user_id=new.approved_by and role='department_head' and is_active=true) then
    raise exception 'Final approval requires an active Department Head account.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists custodian_authorization_role_check on public.borrow_request_custodian_authorizations;
create trigger custodian_authorization_role_check
before insert or update of verified_by,approved_by on public.borrow_request_custodian_authorizations
for each row execute function public.validate_custodian_authorization_roles();

drop policy if exists borrow_requests_role_read on public.borrow_requests;
create policy borrow_requests_role_read on public.borrow_requests for select to authenticated using (
  user_id=auth.uid() or public.current_user_role()='admin'
  or (public.current_user_role()='professor' and assigned_professor_user_id=auth.uid())
  or (public.current_user_role() in ('staff','department_head') and department_id=public.current_user_department_id())
);
drop policy if exists borrow_items_role_read on public.borrow_request_items;
create policy borrow_items_role_read on public.borrow_request_items for select to authenticated using (exists (
  select 1 from public.borrow_requests request where request.id=request_id and (
    request.user_id=auth.uid() or public.current_user_role()='admin'
    or (public.current_user_role()='professor' and request.assigned_professor_user_id=auth.uid())
    or (public.current_user_role() in ('staff','department_head') and request.department_id=public.current_user_department_id())
  )
));

alter table public.department_head_signatures enable row level security;
revoke all on public.department_head_signatures from anon,authenticated;
revoke all on function public.validate_department_head_signature_owner() from public,anon,authenticated;
revoke all on function public.validate_custodian_authorization_roles() from public,anon,authenticated;

-- General Administrators are no longer signatories. Remove any obsolete signature material.
drop table if exists public.admin_signatures;

commit;

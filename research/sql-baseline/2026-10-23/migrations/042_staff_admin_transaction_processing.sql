begin;

-- The transaction screen and API both authorize Staff and Admin accounts.
-- Preserve the signature snapshot safeguard while allowing an Admin's saved
-- Custodian Head signature to be captured for a release or return.
create or replace function public.validate_authorization_signature_owner()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='admin_signatures' and not exists (
    select 1 from public.profiles where user_id=new.admin_user_id and role='admin' and is_active=true
  ) then
    raise exception 'Administrator signatures require an active Admin account.' using errcode='23514';
  end if;
  if tg_table_name='borrowing_transaction_signatures' and not exists (
    select 1 from public.profiles
    where user_id=new.staff_user_id and role in ('staff','admin') and is_active=true
  ) then
    raise exception 'Release and return signatures require an active Staff or Admin account.' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_authorization_signature_owner() from public,anon,authenticated;

commit;

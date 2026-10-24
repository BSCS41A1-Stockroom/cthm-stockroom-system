begin;

create or replace function public.enforce_assigned_professor_authorization()
returns trigger
language plpgsql
security definer set search_path=public
as $$
declare
  assigned_professor uuid;
begin
  if new.status='authorized' then
    select request.assigned_professor_user_id into assigned_professor
    from public.borrow_requests request where request.id=new.request_id;
    if assigned_professor is null then
      raise exception 'Borrowing request % has no assigned professor',new.request_id using errcode='23514';
    end if;
    if new.professor_user_id is distinct from assigned_professor then
      raise exception 'Only the assigned professor may authorize borrowing request %',new.request_id using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_assigned_professor_authorization on public.borrow_request_authorizations;
create trigger enforce_assigned_professor_authorization
  before insert or update of status,professor_user_id on public.borrow_request_authorizations
  for each row execute function public.enforce_assigned_professor_authorization();

revoke all on function public.enforce_assigned_professor_authorization() from public,anon,authenticated;

commit;

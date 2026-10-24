begin;

-- Recover legacy authorized requests from the professor who actually signed them.
-- Requests without trustworthy assignment evidence remain visible only to General Admin.
update public.borrow_requests as br
set assigned_professor_user_id=coalesce(br.assigned_professor_user_id,authz.professor_user_id),
    department_id=coalesce(br.department_id,professor.department_id),
    updated_at=now()
from public.borrow_request_authorizations as authz
join public.profiles professor
  on professor.user_id=authz.professor_user_id
 and professor.role='professor'
 and professor.department_id is not null
where authz.request_id=br.id
  and authz.status='authorized'
  and (br.assigned_professor_user_id is null or br.department_id is null)
  and (br.assigned_professor_user_id is null or br.assigned_professor_user_id=authz.professor_user_id)
  and (br.department_id is null or br.department_id=professor.department_id);

create or replace function public.enforce_request_academic_assignment()
returns trigger
language plpgsql
security definer set search_path=public
as $$
declare
  section_department bigint;
  professor_department bigint;
begin
  if new.department_id is null or new.section_id is null or new.assigned_professor_user_id is null then
    raise exception 'New borrowing requests require a department, section, and assigned professor' using errcode='23514';
  end if;

  select department_id into section_department
  from public.academic_sections where id=new.section_id and is_active=true;
  select department_id into professor_department
  from public.profiles
  where user_id=new.assigned_professor_user_id and role='professor' and is_active=true;

  if section_department is distinct from new.department_id
     or professor_department is distinct from new.department_id then
    raise exception 'The section and professor must belong to the request department' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_request_academic_assignment on public.borrow_requests;
create trigger enforce_request_academic_assignment
  before insert or update of department_id,section_id,assigned_professor_user_id
  on public.borrow_requests
  for each row execute function public.enforce_request_academic_assignment();

revoke all on function public.enforce_request_academic_assignment() from public,anon,authenticated;

commit;

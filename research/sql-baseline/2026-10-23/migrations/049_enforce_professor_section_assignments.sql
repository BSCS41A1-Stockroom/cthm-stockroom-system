begin;

-- Keep one authoritative current teaching assignment for a professor/section.
-- Older rows remain available for historical reporting.
with ranked as (
  select id,
         row_number() over (
           partition by professor_user_id, section_id
           order by updated_at desc, id desc
         ) as assignment_rank
  from public.professor_section_assignments
  where is_active=true
)
update public.professor_section_assignments assignment
set is_active=false,
    updated_at=now()
from ranked
where ranked.id=assignment.id
  and ranked.assignment_rank > 1;

create unique index if not exists professor_section_one_active_idx
  on public.professor_section_assignments(professor_user_id, section_id)
  where is_active=true;

alter table public.borrow_requests
  add column if not exists professor_section_assignment_id bigint
  references public.professor_section_assignments(id) on delete restrict;

create index if not exists borrow_requests_professor_assignment_idx
  on public.borrow_requests(professor_section_assignment_id)
  where professor_section_assignment_id is not null;

create or replace function public.enforce_request_academic_assignment()
returns trigger
language plpgsql
security definer set search_path=public
as $$
declare
  section_department bigint;
  professor_department bigint;
  active_assignment_id bigint;
begin
  if new.department_id is null or new.section_id is null or new.assigned_professor_user_id is null then
    raise exception 'New borrowing requests require a department, section, and assigned professor' using errcode='23514';
  end if;

  select department_id into section_department
  from public.academic_sections
  where id=new.section_id and is_active=true;

  select department_id into professor_department
  from public.profiles
  where user_id=new.assigned_professor_user_id
    and role='professor'
    and is_active=true;

  select id into active_assignment_id
  from public.professor_section_assignments
  where professor_user_id=new.assigned_professor_user_id
    and section_id=new.section_id
    and is_active=true;

  if section_department is distinct from new.department_id
     or professor_department is distinct from new.department_id
     or active_assignment_id is null then
    raise exception 'The professor must have an active assignment for the selected department and section' using errcode='23514';
  end if;

  -- Snapshot the exact academic-year/term assignment. Status-only updates do
  -- not run this trigger, so later deactivation does not invalidate history.
  new.professor_section_assignment_id := active_assignment_id;
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

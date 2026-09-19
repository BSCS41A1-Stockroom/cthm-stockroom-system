begin;

-- Department catalog supplied by the institution.
insert into public.academic_departments (code, name, is_active) values
  ('CTHM', 'CTHM', true),
  ('TECH', 'Technology', true),
  ('PSYCH', 'Psychology', true),
  ('ENG', 'Engineering', true),
  ('SHS', 'Senior High', true)
on conflict do nothing;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'professor', 'staff', 'admin'));
alter table public.profiles drop constraint if exists profiles_staff_department_required;
alter table public.profiles add constraint profiles_staff_department_required
  check (role <> 'staff' or department_id is not null) not valid;

alter table public.laboratory_rooms
  add column if not exists department_id bigint references public.academic_departments(id) on delete restrict;
alter table public.laboratory_rooms drop constraint if exists laboratory_rooms_name_key;
create unique index if not exists laboratory_rooms_department_name_unique
  on public.laboratory_rooms(department_id, lower(trim(name))) where department_id is not null;
create index if not exists laboratory_rooms_department_idx
  on public.laboratory_rooms(department_id, is_active, name);

insert into public.laboratory_rooms (department_id, name, room_type, capacity, features)
select department.id, room.name, room.room_type, 1, '{}'::jsonb
from (values
  ('CTHM','Housekeeping Lab','housekeeping'),
  ('CTHM','Bartending / Barista Lab','bartending_barista'),
  ('CTHM','Food and Beverages Lab','food_and_beverage'),
  ('CTHM','Front Office Lab','front_office'),
  ('CTHM','Kitchen Lab','kitchen'),
  ('TECH','Kitchen Lab','kitchen'),
  ('TECH','Food and Beverages Lab','food_and_beverage'),
  ('TECH','Housekeeping Lab','housekeeping'),
  ('TECH','Front Office Lab','front_office'),
  ('TECH','CSS Lab','computer_systems_servicing'),
  ('TECH','VGD Lab / 2D Animation','visual_graphic_design'),
  ('TECH','Massage Therapy','massage_therapy'),
  ('TECH','Bartending / Barista Lab','bartending_barista'),
  ('PSYCH','Physics / Chemistry','science'),
  ('ENG','Electronic Lab','electronics'),
  ('ENG','Physics Lab','physics'),
  ('SHS','Kitchen Lab','kitchen'),
  ('SHS','Food and Beverages Lab','food_and_beverage')
) as room(department_code,name,room_type)
join public.academic_departments department on department.code=room.department_code
on conflict do nothing;

alter table public.inventory
  add column if not exists room_id bigint references public.laboratory_rooms(id) on delete restrict;
create index if not exists inventory_room_idx on public.inventory(room_id);
create index if not exists profiles_staff_department_idx
  on public.profiles(department_id, full_name) where role='staff' and is_active=true;

create or replace function public.current_user_department_id()
returns bigint language sql stable security definer set search_path=public as $$
  select department_id from public.profiles where user_id=auth.uid() and is_active=true
$$;
revoke all on function public.current_user_department_id() from public;
grant execute on function public.current_user_department_id() to authenticated;

drop policy if exists inventory_read_authenticated on public.inventory;
create policy inventory_read_authenticated on public.inventory for select to authenticated using (
  public.current_user_role() <> 'staff' or exists (
    select 1 from public.laboratory_rooms room
    where room.id=inventory.room_id and room.department_id=public.current_user_department_id()
  )
);
drop policy if exists inventory_admin_insert on public.inventory;
drop policy if exists inventory_department_insert on public.inventory;
create policy inventory_department_insert on public.inventory for insert to authenticated with check (
  public.current_user_role()='admin' or (
    public.current_user_role()='staff' and exists (
      select 1 from public.laboratory_rooms room where room.id=room_id and room.department_id=public.current_user_department_id()
    )
  )
);
drop policy if exists inventory_admin_update on public.inventory;
drop policy if exists inventory_department_update on public.inventory;
create policy inventory_department_update on public.inventory for update to authenticated
using (public.current_user_role()='admin' or (public.current_user_role()='staff' and exists (
  select 1 from public.laboratory_rooms room where room.id=inventory.room_id and room.department_id=public.current_user_department_id()
)))
with check (public.current_user_role()='admin' or (public.current_user_role()='staff' and exists (
  select 1 from public.laboratory_rooms room where room.id=room_id and room.department_id=public.current_user_department_id()
)));
drop policy if exists inventory_admin_delete on public.inventory;
drop policy if exists inventory_department_delete on public.inventory;
create policy inventory_department_delete on public.inventory for delete to authenticated using (
  public.current_user_role()='admin' or (public.current_user_role()='staff' and exists (
    select 1 from public.laboratory_rooms room where room.id=inventory.room_id and room.department_id=public.current_user_department_id()
  ))
);

drop policy if exists rooms_read_authenticated on public.laboratory_rooms;
create policy rooms_read_authenticated on public.laboratory_rooms for select to authenticated using (
  public.current_user_role()<>'staff' or department_id=public.current_user_department_id()
);

drop policy if exists borrow_requests_role_read on public.borrow_requests;
create policy borrow_requests_role_read on public.borrow_requests for select to authenticated using (
  user_id=auth.uid() or public.current_user_role()='admin'
  or (public.current_user_role()='professor' and assigned_professor_user_id=auth.uid())
  or (public.current_user_role()='staff' and department_id=public.current_user_department_id())
);
drop policy if exists borrow_items_role_read on public.borrow_request_items;
create policy borrow_items_role_read on public.borrow_request_items for select to authenticated using (exists (
  select 1 from public.borrow_requests request where request.id=request_id and (
    request.user_id=auth.uid() or public.current_user_role()='admin'
    or (public.current_user_role()='professor' and request.assigned_professor_user_id=auth.uid())
    or (public.current_user_role()='staff' and request.department_id=public.current_user_department_id())
  )
));

grant select on public.academic_departments, public.academic_sections to authenticated;

commit;

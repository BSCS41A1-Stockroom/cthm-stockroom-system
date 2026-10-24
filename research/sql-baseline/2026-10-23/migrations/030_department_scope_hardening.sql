begin;

drop policy if exists calendar_read_authenticated on public.calendar_events;
create policy calendar_read_authenticated on public.calendar_events for select to authenticated using (
  public.current_user_role()<>'staff'
  or (room_id is null and borrow_request_id is null)
  or exists (
    select 1 from public.laboratory_rooms room
    where room.id=calendar_events.room_id and room.department_id=public.current_user_department_id()
  )
  or exists (
    select 1 from public.borrow_requests request
    where request.id=calendar_events.borrow_request_id and request.department_id=public.current_user_department_id()
  )
);

commit;

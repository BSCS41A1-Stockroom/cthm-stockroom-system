begin;

alter table public.calendar_events
  drop constraint if exists calendar_events_event_type_check;
alter table public.calendar_events
  add constraint calendar_events_event_type_check
  check (event_type in ('activity', 'holiday', 'reminder', 'borrowing', 'return_due', 'return_partial', 'return_completed'));

alter table public.calendar_events
  add column if not exists borrowing_return_id bigint references public.borrowing_returns(id) on delete cascade;

drop index if exists public.calendar_events_borrow_request_unique;
create unique index if not exists calendar_events_borrowing_phase_unique
  on public.calendar_events (borrow_request_id, event_type)
  where borrow_request_id is not null and event_type in ('borrowing', 'return_due');
create unique index if not exists calendar_events_return_unique
  on public.calendar_events (borrowing_return_id)
  where borrowing_return_id is not null;

-- Existing borrowed requests also receive a due-date event.
insert into public.calendar_events (title, event_date, event_type, description, borrow_request_id)
select 'Return due: BR-' || lpad(request.id::text, 3, '0'), request.return_date,
       'return_due', 'Return all outstanding items by this date.', request.id
  from public.borrow_requests request
 where request.status = 'Borrowed'
on conflict do nothing;

drop policy if exists calendar_read_authenticated on public.calendar_events;
create policy calendar_read_authenticated on public.calendar_events for select to authenticated
using (
  public.current_user_is_active()
  and (
    borrow_request_id is null
    or public.current_user_role() in ('professor', 'admin')
    or exists (
      select 1 from public.borrow_requests request
       where request.id = borrow_request_id and request.user_id = auth.uid()
    )
  )
);

commit;

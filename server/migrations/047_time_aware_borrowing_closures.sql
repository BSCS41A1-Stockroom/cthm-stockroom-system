begin;

alter table public.borrow_requests
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.borrow_requests drop constraint if exists borrow_requests_time_pair_check;
alter table public.borrow_requests add constraint borrow_requests_time_pair_check check (
  (start_time is null and end_time is null)
  or (start_time is not null and end_time is not null
    and (borrow_date < return_date or start_time < end_time))
);

alter table public.calendar_closures
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.calendar_closures drop constraint if exists calendar_closures_time_pair_check;
alter table public.calendar_closures add constraint calendar_closures_time_pair_check check (
  (start_time is null and end_time is null)
  or (start_time is not null and end_time is not null
    and start_date=end_date and start_time < end_time)
);

commit;

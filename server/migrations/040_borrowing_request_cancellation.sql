begin;

alter table public.borrow_requests
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_type text;

alter table public.borrow_requests drop constraint if exists borrow_requests_cancellation_type_check;
alter table public.borrow_requests add constraint borrow_requests_cancellation_type_check
  check (cancellation_type is null or cancellation_type in ('withdrawn', 'cancelled'));

alter table public.borrow_requests drop constraint if exists borrow_requests_cancellation_complete_check;
alter table public.borrow_requests add constraint borrow_requests_cancellation_complete_check check (
  (cancelled_by is null and cancelled_at is null and cancellation_reason is null and cancellation_type is null)
  or
  (cancelled_at is not null and cancellation_reason is not null and cancellation_type is not null)
);

-- Older installations may have a status constraint created by the initial schema.
alter table public.borrow_requests drop constraint if exists borrow_requests_status_check;
alter table public.borrow_requests add constraint borrow_requests_status_check check (
  status in ('Pending','Validated','Approved','Borrowed','Returned','Rejected','Expired','Withdrawn','Cancelled')
);

create index if not exists borrow_requests_cancellation_history_idx
  on public.borrow_requests (cancelled_at desc)
  where cancelled_at is not null;

commit;

begin;

alter table public.borrow_requests
  add column if not exists overdue_detected_at timestamptz,
  add column if not exists last_overdue_notified_on date,
  add column if not exists overdue_resolved_at timestamptz;

alter table public.notifications
  add column if not exists notification_key text;

create unique index if not exists notifications_notification_key_idx
  on public.notifications (notification_key)
  where notification_key is not null;

create index if not exists borrow_requests_open_overdue_idx
  on public.borrow_requests (return_date, id)
  where status = 'Borrowed';

commit;

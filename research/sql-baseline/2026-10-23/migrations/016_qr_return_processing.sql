begin;

alter table public.qr_scanner_sessions
  add column if not exists scan_mode text not null default 'claim';
alter table public.qr_scanner_sessions drop constraint if exists qr_scanner_sessions_scan_mode_check;
alter table public.qr_scanner_sessions add constraint qr_scanner_sessions_scan_mode_check
  check (scan_mode in ('claim', 'return'));

alter table public.borrowing_returns
  add column if not exists idempotency_key uuid;
create unique index if not exists borrowing_returns_idempotency_unique
  on public.borrowing_returns (idempotency_key)
  where idempotency_key is not null;

alter table public.borrowing_return_items
  drop constraint if exists return_item_condition_note_required;
alter table public.borrowing_return_items
  add constraint return_item_condition_note_required
  check (
    (damaged_quantity + missing_quantity = 0)
    or coalesce(length(trim(condition_note)), 0) > 0
  ) not valid;

commit;

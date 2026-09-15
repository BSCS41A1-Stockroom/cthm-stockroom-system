begin;

alter table public.profiles
  add column if not exists qr_status text not null default 'not_issued',
  add column if not exists qr_issued_at timestamptz,
  add column if not exists qr_issued_by uuid references auth.users(id) on delete set null,
  add column if not exists qr_last_printed_at timestamptz,
  add column if not exists qr_last_printed_by uuid references auth.users(id) on delete set null,
  add column if not exists qr_revocation_reason text;

alter table public.profiles drop constraint if exists profiles_qr_status_check;
alter table public.profiles add constraint profiles_qr_status_check
  check (qr_status in ('not_issued', 'active', 'revoked', 'replacement_required'));
alter table public.profiles drop constraint if exists profiles_qr_revocation_reason_check;
alter table public.profiles add constraint profiles_qr_revocation_reason_check
  check (qr_revocation_reason is null or length(trim(qr_revocation_reason)) between 5 and 500);

commit;

begin;

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists qr_public_id uuid not null default gen_random_uuid(),
  add column if not exists qr_version integer not null default 1 check (qr_version > 0),
  add column if not exists qr_revoked_at timestamptz;

create unique index if not exists profiles_qr_public_id_unique
  on public.profiles (qr_public_id);

alter table public.borrow_requests
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists released_by uuid references auth.users(id) on delete set null,
  add column if not exists released_at timestamptz,
  add column if not exists borrower_identity_verified boolean not null default false;

-- At most one request may be waiting for review or collection per account.
-- Borrowed transactions are deliberately excluded and are controlled by the
-- existing configurable outstanding-borrowing CSP rule.
create unique index if not exists borrow_requests_one_preclaim_per_user
  on public.borrow_requests (user_id)
  where user_id is not null and status in ('Pending', 'Validated', 'Approved');

commit;

begin;

alter table public.announcement_reviews
  add column if not exists suspension_scope text not null default 'unknown'
    check (suspension_scope in ('full_day','partial_day','none','unknown')),
  add column if not exists evidence jsonb not null default '{}'::jsonb;

commit;

begin;

alter table public.borrow_requests
  add column if not exists replaces_request_id bigint references public.borrow_requests(id) on delete restrict;

create unique index if not exists borrow_requests_one_replacement_idx
  on public.borrow_requests(replaces_request_id) where replaces_request_id is not null;

commit;

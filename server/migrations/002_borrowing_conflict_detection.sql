begin;

-- Supports active-request overlap and duplicate checks by normalized student ID.
create index if not exists borrow_requests_student_schedule_idx
  on public.borrow_requests (
    lower(trim(student_id)),
    status,
    borrow_date,
    return_date
  );

-- Enforce valid quantities for new writes without making deployment fail if a
-- legacy database already contains bad rows. The application detects and
-- rejects conflicts involving any such legacy rows.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'borrow_request_items_quantity_positive'
       and conrelid = 'public.borrow_request_items'::regclass
  ) then
    alter table public.borrow_request_items
      add constraint borrow_request_items_quantity_positive
      check (quantity is not null and quantity > 0) not valid;
  end if;
end $$;

commit;

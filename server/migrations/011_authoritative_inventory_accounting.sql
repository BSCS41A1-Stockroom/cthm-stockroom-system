begin;

-- Inventory mutations must pass through the backend transaction boundary,
-- where active borrowing commitments are locked and validated.
revoke insert, update, delete on public.inventory from authenticated;

drop policy if exists inventory_admin_insert on public.inventory;
drop policy if exists inventory_admin_update on public.inventory;
drop policy if exists inventory_admin_delete on public.inventory;

create index if not exists borrow_requests_user_active_idx
  on public.borrow_requests (user_id, status, id)
  where status in ('Pending', 'Validated', 'Approved', 'Borrowed');

create index if not exists borrowing_return_items_inventory_request_idx
  on public.borrowing_return_items (inventory_id, request_id);

commit;

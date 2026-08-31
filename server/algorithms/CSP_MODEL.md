# Borrowing CSP Model

## Runtime scope

The production borrowing endpoints run two complementary CSP validation layers:

1. `borrowingValidation.js` creates exact-quantity allocation variables for requested inventory items and verifies their domains and capacity.
2. `csp.js` evaluates the eight borrowing-policy constraints: inventory capacity, time overlap, duplicate request, borrowing limit, lead time, return/outstanding, active status, and availability date.

The system validates a fixed date range selected by the student. It does not generate alternative dates, rooms, or schedules.

## Variables and domains

For every requested inventory item `i`, the allocation model defines:

- Variable: `Q_i`, identified as `quantity:<inventoryId>`.
- Domain: the exact requested quantity when physical stock can satisfy it; otherwise an empty domain.

The exact-demand design prevents partial allocation from silently changing a student's request.

## Authoritative capacity

Capacity is loaded inside a PostgreSQL transaction while requested inventory rows are locked.

- `Pending`, `Validated`, and `Approved` quantities count when their requested date ranges overlap.
- `Borrowed` quantities count until physically accounted for through return records, regardless of the planned return date.
- Partial returns reduce the outstanding Borrowed quantity immediately.
- Damaged and missing returns remain unavailable through the physical-stock formula.

The physical-stock formula is:

`quantity + additional_qty - replaces - missing - breakage - defective - total_loss`

## Borrower identity and concurrency

Authenticated requests use the immutable Supabase `user_id` for outstanding and active-request checks. Legacy records without `user_id` fall back to normalized `student_id`.

Transactions use:

- An inventory row lock for each requested item.
- A borrower-scoped advisory lock for simultaneous requests by the same user.

This prevents concurrent requests from validating against the same stale capacity or borrower state.

## Validation result

A request is persisted only when both CSP layers succeed. Failures roll back the transaction and return stable reason codes. Inventory changes and release transitions use the same authoritative commitment accounting and fail closed when active data is inconsistent.

# Borrowing Conflict Detection

Every `POST /api/borrowings` and `POST /api/borrowings/validate` request is
checked for conflicts inside the same PostgreSQL transaction as CSP inventory
validation.

## Conflict rules

- `DUPLICATE_BORROWING_REQUEST`: the same normalized student ID already has an
  active request with identical inclusive dates and the same item/quantity set.
- `BORROWING_SCHEDULE_OVERLAP`: the student already has a different active
  request whose inclusive borrowing period overlaps the requested period.
- `INSUFFICIENT_INVENTORY`: overlapping active requests leave fewer usable
  units than the CSP requires.

Active statuses are `Pending`, `Validated`, `Approved`, and `Borrowed`.
`Rejected` and `Returned` requests do not block new requests.

## Concurrency safety

Inventory rows are locked in ID order for capacity checks. A transaction-scoped
PostgreSQL advisory lock derived from the normalized student ID serializes
same-student checks even when simultaneous requests contain different items.
Conflicts return HTTP `422`, the transaction is rolled back, and no request or
inventory reservation is written.

Migration `002_borrowing_conflict_detection.sql` also enforces positive
quantities for new database writes. It uses a `NOT VALID` check so deployment
is not blocked by legacy rows; the runtime context loader fails closed if an
active legacy reservation contains a nonpositive quantity.

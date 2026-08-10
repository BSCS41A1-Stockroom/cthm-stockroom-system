# CSP Database Integration

Task 5 connects borrowing validation, inventory state, requests, and calendar scheduling through PostgreSQL transactions and Supabase Realtime.

## Borrowing transaction lifecycle

| Transition | Inventory effect | Calendar effect |
| --- | --- | --- |
| Create `Pending` | Increase `reserved_quantity` | None |
| `Pending` → `Approved` | Reservation remains | Create linked borrowing event |
| `Approved` → `Borrowed` | Move units from reserved to borrowed | Keep linked event |
| `Borrowed` → `Returned` | Release borrowed units | Keep history event |
| `Pending/Approved` → `Rejected` | Release reserved units | Remove linked event |

Every change locks the request and inventory rows and commits all related changes together. A failed operation rolls back the entire transition.

## Calendar CSP integration

Admin calendar writes use `/api/calendar/events`. When a laboratory room is selected, the backend builds the scheduling CSP from:

- The selected room and its capacity/features
- Requested date, start time, end time, and duration
- Existing timed events for the same room/date

Conflicting events return HTTP `422` and are not written. General events without a room are persisted without a room-conflict constraint.

## Realtime tables

The migration adds these tables to `supabase_realtime`:

- `inventory`
- `borrow_requests`
- `borrow_request_items`
- `calendar_events`
- `laboratory_rooms`

Student borrowing, admin inventory, admin requests, and both calendars subscribe to the relevant table changes and refresh automatically.

## Migration

The idempotent migration is `migrations/001_csp_database_integration.sql`. It creates:

- `inventory.reserved_quantity`
- `inventory.borrowed_quantity`
- `borrow_requests.updated_at`
- `laboratory_rooms`
- `calendar_events`
- Supporting checks, indexes, a default Kitchen Laboratory room, and Realtime publication membership

It also rebuilds reservation counters from existing active request records.

## APIs

- `POST /api/borrowings` — validate, reserve, and create
- `POST /api/borrowings/validate` — validate without writing
- `PATCH /api/borrowings/:id/status` — transactional lifecycle transition
- `GET /api/calendar/events`
- `POST /api/calendar/events`
- `PUT /api/calendar/events/:id`
- `DELETE /api/calendar/events/:id`
- `GET /api/calendar/rooms`

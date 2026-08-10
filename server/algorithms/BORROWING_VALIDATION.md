# Borrowing Validation

Borrowing requests are processed through `POST /api/borrowings`. The endpoint does not trust the browser's displayed availability.

## Processing sequence

1. Validate request dates, purpose, item IDs, duplicates, and quantities before database access.
2. Begin a PostgreSQL transaction.
3. Lock all requested inventory rows with `SELECT ... FOR UPDATE`.
4. Sum quantities from overlapping requests whose status is `Pending`, `Validated`, `Approved`, or `Borrowed`.
5. Build and evaluate the borrowing CSP.
6. Roll back and return HTTP `422` when any constraint fails.
7. Insert the request and its items with status `Pending`, then commit, only when all constraints pass.

The row lock prevents two simultaneous requests from both validating against the same remaining units.

## CSP definition

For every requested inventory item `i`:

- Variable: `Q_i`, the allocated quantity (`quantity:<inventoryId>` in code).
- Domain: integer values from `0` through `min(requestedQuantity, physicalQuantity)`.
- Exact-demand constraint: `Q_i = requestedQuantity`.
- Capacity constraint: `Q_i + overlappingReservedQuantity_i <= physicalQuantity_i`.
- Domain constraint: `Q_i` must belong to its generated domain.

Physical quantity uses the stockroom inventory formula:

`quantity + additional_qty - replaces - missing - breakage - defective - total_loss`

Borrow and return dates are inclusive when finding overlapping reservations.

## API

Validate without saving:

```http
POST /api/borrowings/validate
Content-Type: application/json
```

Validate and save atomically:

```http
POST /api/borrowings
Content-Type: application/json
```

Payload:

```json
{
  "borrowDate": "2026-08-10",
  "returnDate": "2026-08-12",
  "purpose": "Culinary laboratory exercise",
  "items": [
    { "inventoryId": 1, "quantity": 3 }
  ]
}
```

Invalid requests return HTTP `422` with machine-readable reason codes such as `INVALID_DATE_RANGE`, `ITEM_NOT_FOUND`, or `INSUFFICIENT_INVENTORY`.

## Configuration

Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` to the Supabase PostgreSQL connection string. The client uses `VITE_API_URL` when configured and otherwise defaults to `http://localhost:5000`.

Run both applications during local development:

```powershell
cd server
npm run dev
```

```powershell
cd client
npm run dev
```

Run automated verification with:

```powershell
cd server
npm test
```

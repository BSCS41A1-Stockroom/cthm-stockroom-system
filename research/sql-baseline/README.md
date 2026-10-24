# Original SQL baseline

The 2026-10-23 snapshot preserves the original borrowing validation SQL before optimization. It does not alter application behavior or execute database queries. This scope is the seven queries in `loadValidationContext`, not every SQL statement in the application.

## Query inventory (execution order)

| ID / SQL file | Purpose | Parameters in positional order |
| --- | --- | --- |
| `01-borrower-lock.sql` | Transaction-scoped borrower advisory lock | `$1`: `user:<userId>` or `student:<trimmed lowercase studentId>` |
| `02-accountability.sql` | First unresolved accountability case; skipped without user ID | `$1`: user UUID |
| `03-usable-inventory.sql` | Usable stock and inspection deductions; ordered inventory row locks | `$1`: distinct inventory IDs as text array; `$2`: requested return date |
| `04-inventory-commitments.sql` | Grouped return accounting and relevant borrowing commitments; **primary optimization target** | `$1`: inventory IDs as text array; `$2`: `[Pending, Validated, Approved]`; `$3`: return date; `$4`: borrow date; `$5`: start time or null; `$6`: end time or null |
| `05-outstanding-borrowing.sql` | First outstanding borrowing for the authenticated/legacy borrower | `$1`: user UUID or null; `$2`: trimmed lowercase student ID |
| `06-borrower-conflicts.sql` | Relevant active borrower requests and their items | `$1`: user UUID or null; `$2`: trimmed lowercase student ID; `$3`: `ACTIVE_BORROWING_STATUSES`, preserved in the source snapshot |
| `07-item-unavailability.sql` | Item restrictions overlapping requested dates | `$1`: inventory IDs as text array; `$2`: return date; `$3`: borrow date |

The dated directory contains the exact SQL string contents, full controller source (including parameter bindings and transaction context), conflict-detection source, migration files, and SHA-256 integrity manifest with source commit and line numbers. Snapshot JavaScript files are reference artifacts, not application modules to run.

## Fair comparison rules

- Keep this baseline unchanged. Store optimized variants separately with their own version and hashes. The capture script refuses to overwrite an existing snapshot.
- Benchmark query 04 first. Treat queries 01 and 03 as required transaction/locking context, not optimizations to remove. Measure standalone query time separately from complete validation latency and lock waiting.
- Preserve commitment quantities **and** `has_invalid_quantity`; numeric/string driver conversion is not a change in SQL correctness. Preserve null, aggregation, row multiplicity, partial-return, status, date/time and outstanding-borrowing behavior.
- Use identical fixtures, parameter sets, schema/index configuration, settings and consistent database state for each comparison. Migration copies are not a live schema export: record the actual test database version, schema, indexes, statistics and relevant settings before measurements.
- Queries 05 and 06 depend on the current Asia/Manila date. Record the transaction time and keep fixtures/time conditions comparable; avoid comparisons spanning a date boundary.
- Capture the original baseline and a separately identified conventionally corrected baseline if type-compatible ID comparisons or other basic fixes are introduced. Do not silently replace the original.
- Use a disposable test database, not production. Run locking queries within explicit transactions and release locks with rollback/commit. EXPLAIN ANALYZE actually executes a statement.
- Compare equivalent outputs before timing. Document warm-up, repetitions, query order, cache conditions, execution plans, row counts, buffer activity, latency, resource measurements and selector overhead. No performance results have been collected by this snapshot.

## Integrity verification

`manifest.json` records SHA-256 for every captured artifact. Verify those against the snapshot itself, not against later edited application code. SHA-256 here detects accidental changes; it is not independent proof of authorship or a tamper-proof archive. Commit the research baseline to Git to retain its history.

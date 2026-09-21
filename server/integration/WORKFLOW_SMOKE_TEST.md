# Disposable-project borrowing workflow smoke test

Use a **separate, disposable** Supabase project with migrations 001–040 applied in order. Do not use production accounts or inventory. Set `TEST_DATABASE_URL` in `server/.env` to that project's PostgreSQL URL; it must differ from `DATABASE_URL`. Run `npm run test:integration` from `server/`. The integration suite creates and drops only uniquely named test schemas.

The automated tests cover database concurrency and the actual withdrawal/cancellation transaction. The following cross-role browser/API checks still need a migrated Supabase project and four test accounts (student, assigned professor, department staff, admin):

1. Create test inventory with at least three available units in the staff account's department. Give all four accounts the required signatures and QR credentials.
2. Submit a two-unit student request. Confirm it is Pending, appears only in the assigned professor's review queue, and reserves exactly two units. A second overlapping request must respect the remaining capacity.
3. Have the assigned professor authorize it. Confirm it becomes Validated, the signed form is archived, and the department staff queue receives it. An unrelated professor must not authorize it.
4. Have department staff verify it and admin give final Custodian Head approval. Confirm it becomes Approved/Ready for Claim, not Borrowed. Neither role should be able to skip the preceding signature stage.
5. Scan the student's account QR with staff, release the items, and confirm the request becomes Borrowed. Confirm borrowed and reserved counters change once, a release signature/receipt exists, and the return deadline appears in the calendar.
6. Scan the same account QR for return. If multiple active borrowings exist, select the intended request. Record the return and confirm inventory counters, return signature/receipt, and finalized history are correct. Repeating the same return submission must not double-count units.
7. Submit another Pending request and withdraw it as the student. Confirm the reservation is released, the professor review link no longer opens, and the request remains visible as Withdrawn with its reason and timestamp.
8. Submit and professor-authorize another request, then cancel it as department staff with a reason. Confirm it remains Cancelled, its reservation is released, the student is notified, and the audit log identifies the staff actor and previous status. Staff from another department must be denied.
9. Try withdrawal/cancellation after Approved and after Borrowed; both must be rejected without changing status or inventory. Repeat a successful cancellation; the second attempt must be rejected without a second release.

Before deployment, inspect the Supabase SQL Editor for the migration 040 columns and constraints, and check the application logs for any missing-column or relation errors. Do not treat a skipped integration suite as a pass against Supabase.

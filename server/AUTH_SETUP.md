# Supabase authentication setup

1. Run `migrations/003_authentication_and_rbac.sql` in the Supabase SQL editor after migrations 001 and 002.
2. In Supabase Authentication, create the user accounts. New accounts safely default to the `student` role.
3. Assign trusted staff roles in the SQL editor (never from browser metadata):

```sql
update public.profiles
set role = 'admin', full_name = 'Stockroom Administrator', student_id = null
where user_id = (select id from auth.users where email = 'admin@example.com');

update public.profiles
set role = 'professor', full_name = 'Professor Name', student_id = null
where user_id = (select id from auth.users where email = 'professor@example.com');
```

4. Configure the frontend environment:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_API_URL=https://YOUR_SERVER.example.com
```

5. Configure the backend environment:

```env
DATABASE_URL=YOUR_SUPABASE_POSTGRES_CONNECTION_STRING
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
CLIENT_URL=https://YOUR_FRONTEND.example.com
QR_SIGNING_SECRET=GENERATE_A_RANDOM_SECRET_WITH_AT_LEAST_32_CHARACTERS
```

`CLIENT_URL` accepts a comma-separated list when both preview and production frontend origins are required. Never expose the database password or Supabase service-role key in the frontend.

For account invitations, the first `CLIENT_URL` origin is used as the password-setup redirect. Add `https://YOUR_FRONTEND_DOMAIN/set-password` (and `http://localhost:5173/set-password` for local testing) to Supabase Authentication > URL Configuration > Redirect URLs. Configure Supabase Authentication > Security and Protection > Password Security with a minimum length of 8 and required uppercase, lowercase, digit, and symbol characters. The app's invitation form additionally limits passwords to 16 characters; Supabase's built-in password settings do not offer a maximum-length control, so this upper bound is not a global server-side rule for other Supabase password flows.

Legacy borrowing records have no authenticated owner and remain visible to professors/admins. If students must see legacy records, link their `borrow_requests.user_id` values to the correct `profiles.user_id` after verifying ownership.

## Account QR claim setup

Run `migrations/013_borrowing_calendar_deadlines.sql` through `migrations/017_physical_qr_issuance.sql` in numeric order in the Supabase SQL editor. Generate `QR_SIGNING_SECRET` locally with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` and add the output only to the backend environment. Never add this secret to a `VITE_` variable or expose it in browser code. Changing this secret invalidates every existing account QR code.

Run migrations `018_serialized_asset_tracking.sql` through `021_asset_maintenance_tracking.sql` in numeric order to enable serialized assets, incident handling, physical counts, and audited maintenance/repair cases. Migration 021 must be applied before deploying the maintenance UI and API.

Phone-camera scanning requires HTTPS in production and camera permission from the browser. USB QR scanners are supported through the manual scanner field because most scanners behave like keyboards.

For phone-to-PC scanning, both devices open the deployed HTTPS frontend and sign in with the same Admin or Professor account. The PC creates a five-minute pairing QR, and the phone scans that code to open the mobile scanner. Migration 015 enables Supabase Realtime for pairing-state updates; no USB connection is used or required.

Migration 016 enables QR return-mode pairings, retry-safe return submissions, and database enforcement requiring a condition note whenever damaged or missing units are recorded.

Migration 017 adds the physical QR issuance lifecycle. New and existing student QR codes begin as `Not Issued`; an Admin must print and mark each label as issued before the student can view or use it. Students cannot regenerate issued codes. Lost, copied, or damaged labels must be revoked or replaced from Admin > User Management.

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
```

`CLIENT_URL` accepts a comma-separated list when both preview and production frontend origins are required. Never expose the database password or Supabase service-role key in the frontend.

Legacy borrowing records have no authenticated owner and remain visible to professors/admins. If students must see legacy records, link their `borrow_requests.user_id` values to the correct `profiles.user_id` after verifying ownership.

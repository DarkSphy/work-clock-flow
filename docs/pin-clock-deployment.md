# PIN clock and employee portal

Apply `supabase/migrations/20260929190000_employee_pin_clock.sql` to the project's existing database **before publishing** this version. GitHub code sync alone does not confirm that the database migration ran. The migration is transactional and repeatable without rotating the existing PIN secret or clearing time entries.

- `/p/$companyId`: public PIN terminal. Four digits identify the employee; a short-lived, single-use ticket confirms the next entry/exit. No employee auth session is created. Lookup and confirmation run through server functions using the existing server-only Supabase service credentials.
- `/funcionario`: employee email/password login and monthly read-only dashboard. The homepage links here using “Sou funcionário”. Existing `?empresa=` links still redirect to the company terminal.
- Company management: administrators set unique four-digit PINs per company and a seven-day schedule, breaks and tracking start date. Existing employees need their first PIN assigned; no automatic default PIN is created. An empty PIN in an edit keeps the old PIN.
- PIN digests use a database-only random secret. No public/authenticated caller can read PINs, enumerate PIN status or call clock RPCs directly. Ten failed company PIN lookups in five minutes pause further lookups until the window expires.
- Direct authenticated time-entry inserts are removed. Profile updates from browser sessions are restricted to `full_name`, preserving onboarding while protecting company membership and schedules.
- Monthly balances are estimates under the current weekly schedule and São Paulo business dates. They exclude today, future days and incomplete shifts from settled balances. Overnight shifts are assigned to the starting workday. Holidays, leave and schedule history are not modeled. Changing the current schedule recalculates prior estimates.

Validation: production build, TypeScript, ESLint on new/changed feature files, eight schedule calculation tests, local PostgreSQL-compatible migration/permission/duplicate-ticket tests and Chromium mobile navigation/keypad checks. No production employee accounts or time entries were created during testing.

Run calculation tests with Node 24: `node --test tests/work-schedule.test.ts`.

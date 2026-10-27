# Shift Scheduler: Technical Design

## Stack

- **Next.js 14.2** (App Router), React 18, TypeScript, Tailwind CSS.
- **Supabase**: Postgres for data, and Supabase Auth for sign-in (email and password).
- **postgres.js** for database access from the server.
- **pdf-lib** for PDF output.
- Deployed on **Vercel**, with the database on Supabase.

## Architecture

- `app/page.tsx` is the single client page. It loads one department's data, holds the screen state, and
  renders the screens in `components/screens/`.
- `app/api/*/route.ts` are the server endpoints. Each one checks the caller first, then does its work.
- `middleware.ts` keeps pages behind sign-in.
- `lib/` holds the logic: access checks, scheduling, labor math, validation, and database helpers. It has no
  UI code, so it can be tested on its own.

Every department's data is loaded in one call (`snapshot`), and every write checks the caller's access to the
department it targets.

## Sign-in

- The login page calls Supabase's password sign-in from the server. On success it stores the access token in an
  httpOnly cookie named `ss_access`.
- `emailForToken` turns the cookie into an email on each request.
- There is no sign-up. Accounts are created in Supabase by an admin.
- Local development without Supabase configuration runs as a single "Deli" department with no sign-in. In
  production the app refuses to start without the Supabase variables.

## Access model

`lib/access.ts` works out, for each request:

1. The signed-in email, from the session cookie.
2. Every department the person can open, with their role in each, from one query that combines three sources:
   - `department_members` (department managers), role `department_manager`.
   - `store_members` (store managers), role `store_manager`, for every department in their store.
   - `app_admins` (company admins), role `admin`, for every department.
   Each department gets the widest role the person has in it.
3. The active department, from the `ss_department` cookie if the person still has access, otherwise the first one.

Helpers:
- `canManageAccessRole(role)`: true for admins and store managers. Controls the Access list and creating or
  deleting departments.
- `isCompanyAdmin(email)`: controls stores, admins, and store manager assignment.
- `canManageStore(email, storeId)`: admins or that store's managers. Controls who can see a store's managers.
- `resolveCaller(request, { accessManagersOnly })`: returns the caller or a response (401, 403, or 503).

Store names and department names are unique within the scope that uses them (stores globally, departments
within a store).

## Data model

All tables with department data carry `department_id`. Row-level security is enabled on every table, with no
policies. The app reads and writes with its server connection, so the public API cannot read the data.

| Table | Purpose |
| --- | --- |
| `stores` | Stores (id, name). |
| `store_members` | Store managers: store_id, email. Unique per store. |
| `app_admins` | Company admins: email (primary key). |
| `departments` | Departments: store_id, name. Unique name per store (case-insensitive). |
| `department_members` | Department managers: department_id, email, role (always `manager`). Unique per department. |
| `settings` | Sales, payroll, rate, break rules, closing limit, title per department. |
| `store_hours` | Day weight (`sales_pct`) for each day, edited in the Schedule screen's labor matrix. The `open` and `close` columns are no longer used. |
| `employees` | Team: name, type, hours, skills, shift types, closing limit, availability for Monday to Saturday. |
| `shift_templates` | Shift needs: name, day, start, end, people needed, required skill, only-for list. |
| `schedule_weeks` | One row per department per week (`week_start`, always a Monday): status `draft` or `published`, the week's forecast (`weekly_sales`), who generated and published it and when, and, once published, the frozen `payroll_pct`, `rate_override` and `day_weights`. |
| `schedule` | Assigned shifts: week_id (required, removed with its week), day, template_id, employee_id, name, start, end. |
| `audit_log` | Change history: department_id, email, action, detail, created_at. Removed with its department. |

Times are stored as text in `HH:MM` (24-hour). Shifts end the same day; overnight shifts are not supported.

## Scheduling

- `lib/generate.ts` and `lib/solver.ts` build a schedule from the templates, availability, skills, closing
  limits, and hour limits. `preview` returns a plan without saving it, and `generate` saves one.
- `lib/swap.ts` swaps the closer for one day. It scores possible moves and picks randomly among the best, so
  repeated presses give different results.
- Shift times are passed to `lib/rules.ts` for availability (`availStatus`), shift types and skills
  (`allowedFor`, `lacksSkill`), and closing limits (`limitFor`).
- A closing shift is one that ends at or after its day's closing time, which is the latest end time among that
  day's shift templates (`closingTimesByDay` in `lib/rules.ts`). There are no separate store hours.

## Weeks

- `lib/weeks.ts` is pure date logic shared by the server and the screens. Dates are `YYYY-MM-DD` strings in the
  store's time zone (`America/New_York`). A week runs Monday to Saturday. The upcoming week, which the app opens
  on, is the next Monday after today.
- `lib/scheduleWeeks.ts` holds the server side: `readWeekStart` reads `?week=` or `body.week` (default: the
  upcoming week; 400 if it isn't a Monday), `refuseIfPublished` (409), `ensureWeek`, `markGenerated`,
  `saveWeekForecast`, `publishWeek`, `unpublishWeek` and `listWeeks`.
- `lib/db.ts` `snapshot(departmentId, weekStart)` loads one department for one week. The week row is not
  created until something is saved, so looking at an empty week leaves nothing behind.
- `withWeekNumbers(snapshot)` puts the week's own forecast into the settings, and for a published week also its
  frozen payroll %, rate and day weights, so `buildReport`, the screens and the PDF all use the week's numbers.
- A published week can't be generated, swapped, edited, or have its forecast changed; the server refuses with
  409 until it is unpublished. Swaps and shift edits lock the week row and check it is still a draft.
- The store overview reads every department for the chosen week and shows each one's status: published, draft,
  or no schedule yet.

## Backups

- `lib/backup.ts` `exportAll(departmentId)` writes a version 2 file: settings, day weights, employees, shift
  templates, and `weeks`, every saved week with its status, numbers, history and shifts.
- `importAll` replaces the department's data in one transaction. Employees and templates get new ids, and each
  week's shifts are translated to them; a shift whose person or template is missing is skipped and counted.
  Weeks keep their status and frozen numbers. A version 1 file (one schedule, no weeks) still imports: its
  schedule becomes a draft for the week in `?week=`.

## Labor and reports

- `lib/report.ts` `buildReport(snapshot)` is a pure function. It builds the labor matrix (per day and week),
  each person's hours, closings, and the totals, from one department's data.
- `lib/matrix.ts` computes daily sales, the labor budget, and required hours from the shift templates.
- `lib/hours.ts` handles clock hours, paid hours, and unpaid lunch.
- The screens and the PDF both use `buildReport`, so the numbers match everywhere.

"Hours to fully staff" comes from the templates (people needed times shift length). "Scheduled so far" comes
from the schedule rows. This is why editing one person's shift changes the second figure but not the first.

## Manual shift edits

- `POST /api/schedule` accepts `{ id, start, end, dryRun? }`. Any caller who can open the department may use it.
- `lib/shiftEdit.ts` `checkShiftEdit` does the check:
  - Errors stop the save: unreadable times, end not after start, overlap with the same person's other shift that
    day.
  - Warnings don't stop it: the person is outside availability, the day or week goes over budget, the person
    goes over max hours, under min hours, or over their closing limit. Each warning is reported only if the
    change makes things worse than before, by comparing `buildReport` before and after the change.
- With `dryRun`, the endpoint returns the check only. The editor calls it as times are typed (debounced 300 ms).
- A saved change updates one row and writes an audit entry.

## Endpoints

| Endpoint | Method | Who | Purpose |
| --- | --- | --- | --- |
| `/api/me` | GET | any signed-in | Current user, store, role, and departments. |
| `/api/data` | GET, POST | department members | Load department data, save or delete rows. |
| `/api/week` | GET, POST | department members | GET: saved weeks, today, this week and next week. POST: save a week's forecast, publish, unpublish. |
| `/api/generate` | POST | department members | Build and save a schedule. |
| `/api/preview` | POST | department members | Preview a schedule without saving. |
| `/api/department` | POST | any signed-in | Switch the active department (remembered in a cookie). |
| `/api/swap` | POST | department members | Swap the closer for one day. |
| `/api/schedule` | POST | department members | Edit one shift's times, with checks. |
| `/api/team` | GET, POST | GET: members; POST: admins and store managers | Department manager list: add, edit, remove. |
| `/api/departments` | POST | admins and store managers | Create a department in the caller's store. |
| `/api/departments/rename` | POST | admins and store managers | Rename the department. |
| `/api/departments/remove` | POST | admins and store managers | Delete the department (typed name confirmation). |
| `/api/stores` | POST | company admins | Create a store with the seven standard departments. |
| `/api/stores/rename` | POST | company admins | Rename the store. |
| `/api/stores/remove` | POST | company admins | Delete the store (typed name, confirmation box, at least one other store). |
| `/api/store-managers` | GET, POST | GET: store managers and admins; POST: admins | List, add, edit, remove store managers. |
| `/api/admins` | GET, POST | company admins | List, add, edit, remove company admins. |
| `/api/store-overview` | GET | store managers and admins | Every department in the store for one week (`?week=`), with each one's status. |
| `/api/store-overview/sales` | POST | store managers and admins | Save one department's forecast for the week (refused if that week is published). |
| `/api/store-overview/payroll` | POST | store managers and admins | Save the store payroll target. |
| `/api/import` | POST | admins and store managers | Replace the department's data, every saved week included, from a backup file. |
| `/api/export` | GET | department members | Download the department's data, every saved week included. |
| `/api/pdf` | GET | department members | Schedule as PDF. |
| `/api/audit` | GET | department members | Recent changes. |
| `/api/login`, `/api/logout` | POST | anyone | Sign in and out. |

Endpoints that work on one week (data, generate, preview, swap, schedule, pdf, week, store-overview) take
`?week=YYYY-MM-DD` or `week` in the body, and default to the upcoming week. Every write records an audit entry with
the signed-in email.

## Database migrations

- `supabase/schema.sql` is the complete setup for a new project. It creates everything and seeds the first
  store and departments.
- `supabase/migrations/` holds the changes for existing databases, numbered and applied in order:
  - 002 to 007: breaks, title, paid hours, rate, first departments, seeding and indexes.
  - 008: stores, store managers, company admins, and the store link for departments.
  - 009: department roles reduced to `manager` only. Old owners become department managers.
  - 010: store payroll target.
  - 011: schedule weeks. Adds `schedule_weeks` (one row per department per Monday, Draft or Published, with the
    week's own forecast and, once published, its payroll %, rate and day weights) and `schedule.week_id`.
    Existing schedules become the week of 2 Nov 2026, Published. Run it at the same time as deploying the code
    that uses weeks: older code can't save a schedule once `week_id` is required.
- Migration 005 has a known issue on a brand-new empty database (the identity sequence). The fix is in
  `schema.sql`, which should be used for new projects.

## Testing done

- Type checks on all changed files (the React types could not be installed offline, so those messages are
  noise from stubs).
- Migrations 008 and 009 on a copy of the current database. Schema compared against a fresh install.
- The access query for store manager, department manager, and admin, on test data.
- The delete store steps on a copy of the test database, with no rows left behind.
- `checkShiftEdit` on sample data: end before start, overlap, availability, labor over budget, minimum hours.
  The closing-limit warning has not been tested yet.

Not tested yet: running the app in a browser against a live database, schedule generation time at full company
scale, and the rename and email edit flows end to end.

## Known limits

- Overnight shifts are not supported.
- Schedule generation time has not been measured at full scale. Serverless functions have time limits.
- The database connection pool is small per server instance. Many people working at once could queue.
- Deleting a store or department removes its change history and saved weeks with it.
- There is no company-wide reporting across stores yet.

## Operations

- Keep Supabase backups enabled (paid plan recommended for production).
- Use Settings > Backup and transfer to export each department regularly.
- Environment variables: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

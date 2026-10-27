# Shift Scheduler

Next.js + Tailwind + Supabase (Postgres), deployed on Vercel.

## Features

- Multiple stores, each with its own departments
- Three roles: company admin, store manager, and department manager
- Shift scheduling with labor budget, hours to fully staff, and cost tracking
- Manual shift time changes with warnings for availability, labor budget, and min/max hours
- Backup and transfer (import and export)

## Roles

| Role               | What they can do                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Company admin      | Everything, including creating and deleting stores and managing other admins              |
| Store manager      | Manages their whole store. Only an admin can assign them.                                 |
| Department manager | Works in their assigned departments. Can't change access or create or delete departments. |

## One-time setup

1. **Supabase project**: create a project, then go to SQL Editor > New query, paste `supabase/schema.sql`, and Run.
2. **Connection string**: go to Project > Connect > _Transaction pooler_ (port 6543). Copy the URI and replace `[YOUR-PASSWORD]` with your database password.
3. **Sign-in**: sign-up is turned off. In Supabase, go to Authentication > Users > Add user for each person.
4. **First admin**: add their email to the `app_admins` table so they can sign in and manage everything.
5. **Local**: copy `.env.example` to `.env.local`, fill in the values, then run `npm install` and `npm run dev`.
6. **Vercel**: import the GitHub repo and add the environment variables `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Deploy.
7. **Bring your data over**: open the deployed site, go to Settings > Backup and transfer > Import from file.

New installs only need `supabase/schema.sql`.

## Environment variables

| Name                | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `DATABASE_URL`      | Postgres connection string (transaction pooler) |
| `SUPABASE_URL`      | Your Supabase project URL                       |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key, used for sign-in    |

The app refuses to run in production if sign-in isn't configured.

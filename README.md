# Shift Scheduler

Next.js + Tailwind + Supabase (Postgres), deployed on Vercel.

## One-time setup

1. **Supabase**: create a project, then SQL Editor > New query, paste `supabase/schema.sql`, Run.
2. **Connection string**: Project > Connect > *Transaction pooler* (port 6543). Copy the URI and put your database password in place of `[YOUR-PASSWORD]`.
3. **Local**: copy `.env.example` to `.env.local`, fill it in, then `npm install` and `npm run dev`.
4. **Vercel**: import the GitHub repo and add the environment variables `DATABASE_URL`, `APP_PASSWORD` (and optionally `APP_USER`). Deploy.
5. **Bring your data over**: open the deployed site, Settings > Backup and transfer > Import from file.

The site is protected by a browser password prompt (HTTP Basic auth). In production the app refuses to run if `APP_PASSWORD` is not set.

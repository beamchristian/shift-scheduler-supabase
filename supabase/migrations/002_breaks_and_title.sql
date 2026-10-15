-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds the lunch break settings and the printed schedule title.
alter table settings
  add column if not exists break_minutes double precision default 30,
  add column if not exists break_after double precision default 5,
  add column if not exists breaks_unpaid double precision default 1,
  add column if not exists schedule_title text default 'Weekly Schedule';

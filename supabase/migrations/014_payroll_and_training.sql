-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds how each person's hours count toward the department's payroll, and whether they are in training.
-- Run it before deploying the code that uses it: saving the Team screen and importing a backup write these columns.
-- Existing people keep counting exactly as before (hourly, not in training).

-- 'hourly' counts the hours they are scheduled (the old behavior).
-- 'salaried' always counts salaried_hours a week, whatever times they work.
-- 'elsewhere' is scheduled here but paid by another department or store management, so it counts 0 hours here.
alter table employees add column if not exists payroll_type text default 'hourly';

-- Weekly hours a salaried person counts for. Blank means 40.
alter table employees add column if not exists salaried_hours double precision;

-- 1 means the person is in training: scheduled as an extra pair of hands, never relied on to cover a shift.
alter table employees add column if not exists in_training double precision default 0;

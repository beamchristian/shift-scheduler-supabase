-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds the most days each person may work in a week. Blank means no limit, so nobody's schedule changes until it is set.
-- Run it before deploying the code that uses it: saving the Team screen and importing a backup write this column.
alter table employees add column if not exists max_days double precision;

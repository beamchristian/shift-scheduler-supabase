-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds the fewest days each person should work in a week.
-- Blank means the default: 5 days for full-timers (or their max days, if lower) and none for part-timers.
-- Set a lower number for a full-timer who has asked for fewer days.
-- Run it before deploying the code that uses it: saving the Team screen and importing a backup write this column.
alter table employees add column if not exists min_days double precision;

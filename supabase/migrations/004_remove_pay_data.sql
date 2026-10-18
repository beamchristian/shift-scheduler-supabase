-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Removes per-person pay from the database. Only the average hourly rate is kept, as one setting.
-- Before running, export your data from the app (Settings > Backup and transfer) in case you need it.

-- 1. The average hourly rate becomes one required setting.
alter table settings alter column rate_override set default 21.15;
update settings set rate_override = 21.15 where rate_override is null or rate_override <= 0;

-- 2. Delete each person's pay.
alter table employees drop column if exists wage;

-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- 0 = budget and min/max hours use scheduled shift hours (default). 1 = they use paid hours (lunch deducted).
alter table settings add column if not exists count_paid_hours double precision default 0;

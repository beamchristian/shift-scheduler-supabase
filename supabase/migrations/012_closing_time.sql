-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds a closing time to each department's settings, as "HH:MM". A shift that ends at or after it counts as a
-- closing shift on every day. Blank keeps the old rule: each day's latest shift template end time.
-- Run it before deploying the code that uses it: saving Settings or importing a backup needs this column.
alter table settings add column if not exists closing_time text;

-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- New rows go to Deli (department 1) until the app is scoped to each department.
alter table store_hours alter column department_id set default 1;
alter table employees alter column department_id set default 1;
alter table shift_templates alter column department_id set default 1;
alter table schedule alter column department_id set default 1;
-- Remove the 36 extra store-hours rows created for the other six departments, so the app shows only Deli.
-- They are recreated per department when the department feature is finished.
delete from store_hours where department_id <> 1;

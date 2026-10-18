-- Department scoping: makes sure every department has its own settings row and store hours.
-- Safe to run more than once. Run after 005 and 006.

-- One settings row per department, found by department_id.
insert into settings (department_id, schedule_title)
select department.id, department.name || ' Weekly Schedule'
from departments department
where not exists (
  select 1 from settings existing where existing.department_id = department.id
);

-- Six store-hours rows (Monday to Saturday) for any department that has none yet.
insert into store_hours (department_id, day, "open", "close", sales_pct)
select department.id, defaults.day_number, '06:00', '20:00', defaults.sales_pct
from departments department
cross join (values (1, 19.0), (2, 15.5), (3, 14.0), (4, 15.0), (5, 17.0), (6, 19.5))
  as defaults(day_number, sales_pct)
where not exists (
  select 1 from store_hours existing where existing.department_id = department.id
);

-- Indexes for the per-department lookups the app makes on every request.
create index if not exists settings_department_idx on settings (department_id);
create index if not exists store_hours_department_idx on store_hours (department_id);
create index if not exists employees_department_idx on employees (department_id);
create index if not exists shift_templates_department_idx on shift_templates (department_id);
create index if not exists schedule_department_idx on schedule (department_id);

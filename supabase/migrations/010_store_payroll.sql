-- Adds a payroll target for each store. The store overview compares total scheduled payroll with it.
-- Blank means no store target has been set.
alter table stores add column if not exists target_payroll_pct double precision;

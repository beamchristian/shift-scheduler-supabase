-- Run once in Supabase after 008. Roles are now three:
-- company admin (app_admins), store manager (store_members), and department manager (department_members).
-- Old department owners become department managers. Admins and store managers now manage who has access.
-- Give the right people store manager or admin access after running this.

update department_members set role = 'manager' where role = 'owner';

alter table department_members drop constraint if exists department_members_role_check;
alter table department_members add constraint department_members_role_check check (role in ('manager'));

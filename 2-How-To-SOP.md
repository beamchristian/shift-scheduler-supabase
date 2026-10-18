# Shift Scheduler: How-To (SOP)

This guide covers the everyday work and every screen. Read the Roles section first, since what you can change
depends on your role.

## Roles

- **Company admin**: everything, in every store.
- **Store manager**: everything in their store.
- **Department manager**: works in their assigned departments, but can't change who has access or create or
  delete departments.

Anyone who can open a department can change a shift's times on its schedule.

## Signing in

1. Open the app and sign in with your email and password.
2. If you don't have a login, ask a company admin or store manager. Sign-up is turned off.
3. To sign out, use Sign out at the top right.

## Choosing a store and department

The top bar shows your store and department, and your role. If you can open more than one department, a
dropdown appears. Departments are grouped by store, so pick the store first, then the department.

## Schedule

This is where most of the week's work happens.

1. **Forecast.** Enter this week's sales forecast and save it. Labor budgets come from this number.
2. **Generate.** Build a new schedule for the department. Any warnings appear above the schedule.
3. **Swap a closer.** Each day has a button to swap the closer, for example when someone calls out. The app
   picks the best option and respects availability, skills, and closing limits.
4. **Change one shift.** Click any shift on the grid (or a row on a phone). In the Edit shift box:
   - Change the start and end.
   - Read the messages. Red messages stop the change (end before start, or the person would be in two places).
     Yellow messages are warnings you can still save through, such as labor over budget or someone outside
     their availability.
   - Save shift. The saved change shows its warnings above the labor section.
   A changed shift updates the labor matrix, each person's hours, and the exports. "To fully staff" stays the
   same, because it comes from the shift setup, not from individual shifts. Change the shift setup on the
   Shifts screen to change it.
5. **Labor matrix.** Compare scheduled hours and cost with the budget for each day and the week.
6. **Summary tiles.** "Hours to fully staff" and "Cost to fully staff" show what the shift setup needs.
   "Scheduled so far" shows what's currently assigned.

## Team

Add and edit the people in the department.

- **Name, position, and type** (full-time or part-time).
- **Minimum and maximum hours** for the week. The schedule flags anyone outside these limits.
- **Skills**: add skills as chips. Press Enter or comma to add, and use the ✕ to remove. Skills are used by
  shifts that require a skill.
- **Shift types**: the shift templates this person may work. Blank means any.
- **Closing limit**: how many closing shifts this person may work in a week. Blank uses the department default.

## Availability

For each person and each day, choose:

- **Blank**: any time.
- **Off**: not available that day.
- **A window**, such as `6am-2pm`: the whole shift must fit inside it.

## Shifts

Shift templates are the shifts the schedule fills each week.

- **Name** (for example Open or Close), **day**, **start**, and **end**.
- **People needed**: how many people this shift requires.
- **Required skill**: pick from the skills on the Team screen. Leave blank for none.
- **Only for**: limit the shift to certain people. Blank means anyone.

Changing a template changes the "to fully staff" hours. Changing one person's shift on the schedule does not.

## Settings

- **Store and payroll**: weekly sales, payroll percentage, the average hourly rate, break rules, and whether
  paid hours are counted.
- **Store hours**: opening and closing times for each day, and each day's share of sales.
- **Backup and transfer**: export this department's data to a file, or import one.
- **Recent changes**: the history of changes in this department, with who made them and when.

## Access (who can work here)

Sections run from the widest access to the narrowest.

1. **Company admins** (company admins only): add, edit, or remove other admins. The last admin can't be removed,
   and nobody can change their own admin email here.
2. **Store managers** (company admins and store managers): add, edit, or remove store managers. Only company
   admins can change this list.
3. **Department managers** (company admins and store managers can change it; others see it read-only): add a
   person by email, edit an email, or remove someone. Create their login in Supabase first, under
   Authentication > Users > Add user, using the same email.
4. **Create a store** (company admins only): enter a name and at least one store manager email. The store starts
   with the seven standard departments.
5. **Create a department** (company admins and store managers): creates a department in the current store.
6. **Rename this department** (company admins and store managers).
7. **Delete this department** (company admins and store managers): type the department's name to confirm. You
   must belong to another department first.
8. **Rename this store** (company admins only).
9. **Delete a store** (company admins only): type the store's name, tick the confirmation box, and confirm in
   the dialog. This removes everything in the store and can't be undone. The app won't delete the last store.

## Common tasks

- **Someone calls out:** Schedule > swap the closer for that day, or click their shift and change or clear it.
- **Someone is leaving early:** Schedule > click their shift > change the end time > read the warnings > save.
- **A new employee starts:** create their login in Supabase, then Team > add them, then Availability.
- **A new store opens:** Access > Create a store > enter the name and the store manager emails.
- **A store manager leaves:** Access > Store managers > remove them. Then add the replacement, if any.
- **Fixing a typo in a name:** Access > Rename this department or store, or Edit next to the email.

## When something looks wrong

- **Missing a store or department:** check that you are signed in with the email the admin gave you. Ask a
  company admin to check your access.
- **A change won't save:** read the red message in the editor. It names the problem, such as an overlapping
  shift.
- **Numbers look stale:** refresh the page. Check Settings > Recent changes to confirm the change was saved.

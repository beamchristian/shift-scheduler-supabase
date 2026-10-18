# Shift Scheduler: User Story and Business Case

Date: October 18, 2026

## The problem

Each store builds its weekly schedule by hand, department by department. It takes hours, labor overruns are
found after the week is over, and changes made during the week aren't tracked. A manager can't see how a
change affects labor, hours, or closing coverage until the week is already set.

## The solution

Shift Scheduler builds each department's weekly schedule from its team, availability, skills, and shift needs.
It shows labor against the sales budget as the schedule changes, and it warns before a manual change causes a
problem. Every store has its own departments, and the company sees and manages all of them from one place.

## Who uses it

- **Company admins** (corporate): see and change every store, create stores, assign store managers, and add
  other admins.
- **Store managers**: run everything in their store, including adding department managers and creating
  departments. Only a company admin can make someone a store manager.
- **Department managers**: build and edit the schedule for their departments, without changing who has access.

## User stories

- As a company admin, I want to create a new store with its standard departments and its store managers, so a
  new store can be running in minutes.
- As a company admin, I want to see every store and department in one place, so I can check labor across the
  company.
- As a company admin, I want to add and remove other admins, so access can be shared without a developer.
- As a store manager, I want to see only my store, so I'm not distracted by other stores.
- As a store manager, I want to add and remove department managers, so the right people can work in each
  department.
- As a store manager, I want to create, rename, and delete departments in my store, so the store's setup can
  change over time.
- As a department manager, I want to generate and adjust my department's schedule, so my department is covered
  each week.
- As anyone working on a schedule, I want to change one person's shift times and see the labor and hours
  effects before I save, so I don't overspend or break someone's limits by accident.
- As a company admin, I want to rename a store or edit someone's email, so mistakes can be fixed without
  deleting anything.
- As a company admin, I want deleting a store to need several confirmations and to keep at least one store, so
  nothing is lost by accident.
- As anyone, I want every change recorded in a history, so I can see who changed what and when.

## Acceptance highlights

- A store manager signing in sees only their store's departments.
- A company admin sees every store, and can create, rename, and delete stores.
- A manual shift change shows errors (end before start, overlapping shifts) that stop it, and warnings (labor
  over budget, hours over or under limits, closings over limit, outside availability) that don't.
- The last company admin can't be removed.
- Every change appears in Settings > Recent changes.

## Business value

- Schedules are built in minutes, not hours, with labor checked against the budget as they are made.
- Labor overruns and missed closing limits show up while the schedule is still being built.
- Each store's data stays separate, and the company sees everything from one place.
- Access is shared by the people who need it, without anyone needing a developer.

## Rollout

1. Test with two stores (current status).
2. Confirm the admin and store manager list, store names, and department names.
3. Bring the remaining stores in one at a time, using Create a store.
4. Review labor in the first two weeks, and tune the budget settings with the store managers.

## Open items

- Store names for the six existing stores and two upcoming stores.
- Whether store managers should be able to add other store managers (currently only company admins can).
- Load testing of schedule generation at full company scale has not been done yet.
- Company-wide reporting across stores is not built yet.

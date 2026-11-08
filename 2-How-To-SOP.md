# Shift Scheduler: How-To (SOP)

This guide covers the everyday work and every screen. Read the Roles section first, since what you can change
depends on your role.

## Roles

- **Company admin**: everything, in every store.
- **Store manager**: everything in their store.
- **Department manager**: works in their assigned departments, but can't change who has access or create or
  delete departments.

Anyone who can open a department can change a shift's times on its schedule, swap it with someone else's shift,
or give it to someone who is off.

## Signing in

1. Open the app and sign in with your email and password.
2. If you don't have a login, ask a company admin or store manager. Sign-up is turned off.
3. To sign out, use Sign out at the top right.

## Choosing a store and department

The top bar shows your store and department, and your role. If you can open more than one department, a
dropdown appears. Departments are grouped by store, so pick the store first, then the department.

## Schedule

This is where most of the week's work happens.

### Weeks

Every schedule belongs to one week, Monday to Saturday. The week bar at the top of the Schedule screen picks it:

- **◀ / ▶** go back or forward a week. **This week** and **Next week** jump straight there. The list on the right
  shows every week that has a saved schedule.
- The screen opens on **next week**, the one being planned. The address bar keeps the week, so a refresh or a
  shared link opens the same one.
- The labels say where the week stands: **Draft** (being worked on), **Published** (the official schedule),
  **No schedule yet**, and **This week**, **Next week** or **Past week**.
- Under the week name: who generated it and when, and who published it and when.

**Publishing.** When a draft is ready, click **Publish schedule**. A published week is locked: Generate, Swap
closers, changing a shift, the forecast and the day weights are all turned off, and the server refuses changes too.
To change a published week, click **Unpublish** (it asks you to confirm), make the changes, and publish it again.
A published week also keeps the payroll %, rate and day weights it was published with, so later changes in
Settings don't change it. The PDF of a draft is marked "DRAFT - not published".

**Past weeks.** A week that is over can still be changed, for example to record a call-out, but the screen warns you
and each change asks you to confirm first. A published past week has to be unpublished first, like any other.

### Each week's work

1. **Forecast.** Enter the week's sales forecast and click away to save it. Labor budgets come from this number.
   Each week keeps its own forecast, and a new week starts from the last one you entered.
2. **Generate.** Build the week's schedule. It replaces only that week's draft. Any warnings appear above the
   schedule. When it's ready, **Publish schedule**.
   - The generator never breaks availability, skills, "Only for", max hours or max days. If it can't fill a
     shift without breaking one of these, it leaves the shift open and the warning names what stopped each
     person. See "When a week won't fill" below.
   - Closing limits are kept whenever the shifts can still be covered. If someone has to close more than their
     limit, a warning says so.
3. **Swap a closer.** Each day has a button to swap the closer, for example when someone calls out. The app
   picks the best option and respects availability, skills, and closing limits.
4. **Change one shift.** Click any shift on the grid (or a row on a phone). In the Edit shift box, do one of these:
   - **Change the start and end.** If the new times turn the shift into a different kind (for example an opener
     that now runs to closing time), the box says so and the shift is renamed when you save: "Opener" becomes
     "Closer", "Subshop Open" becomes "Subshop Closer", and "Production" becomes "Production Closer".
   - **Swap or give away.** Pick another person's shift that day to trade shifts with them, or pick someone
     who is off that day to hand the shift to them. The times stay the same.

   Then read the messages. Red messages stop the change (end before start, the person would be in two places,
   or the person you picked already works that day). Yellow messages are warnings you can still save through,
   such as labor over budget, someone outside their availability or missing a skill, or someone going over
   their hours, days or closing limit. Click **Save shift**. The saved change shows its warnings above the labor
   section.

   A changed shift updates the labor matrix, each person's hours and closes, and the exports. "To fully staff"
   stays the same, because it comes from the shift setup, not from individual shifts. Change the shift setup on
   the Shifts screen to change it.
5. **Labor matrix.** Compare scheduled hours and cost with the budget for each day and the week.
   - **Day weight** (top row): each day's share of the week's sales. Type a new number and click away to
     save it. Weights are relative, so they don't need to add up to 100; the grey figure under each box
     shows the day's actual share. That day's sales, payroll target and allowed hours update below.
6. **Summary tiles.** "Hours to fully staff" and "Cost to fully staff" show what the shift setup needs.
   "Scheduled so far" shows what's currently assigned.
7. **Print.** Click **Download PDF**. Tick **Compact PDF** first to fit the schedule on one page: the labor
   matrix shows only its main rows (sales, target payroll, allowed hours, hours scheduled, scheduled payroll and
   +/- hours), and the schedule rows shrink a little if needed. A very large team can still run onto a second
   page.

### Closing shifts and colors

- A **closing shift** is any shift that ends at or after the **Closing time** in Settings, on every day. For
  example, with Closing time set to 7:00 PM, a shift ending at 7:00 PM or 8:00 PM is a close. If Closing time is
  blank, each day uses the latest end time of that day's shifts on the Shifts screen.
- Under each person's hours, the grid shows how many closes they have. The number turns amber when it's over
  their closing limit.
- Shift colors on the grid and the PDF:
  - **Blue**: a closing shift, whatever its name.
  - **Yellow**: an opening shift (a name with "Open" in it).
  - **Green**: anything else, such as Production or Subshop Mid.
- The colors follow the times. A shift you edit to end at closing time turns blue (and is renamed, see above).

## Team

Add and edit the people in the department.

- **Name, position, and type** (full-time or part-time).
- **Minimum and maximum hours** for the week. The schedule flags anyone outside these limits. These count shift
  hours, or paid hours (lunch taken out) if that is turned on in Settings.
- **Skills**: add skills as chips. Press Enter or comma to add, and use the ✕ to remove. Skills are used by
  shifts that require a skill.
- **Shift types**: the shift templates this person may work. Blank means any.
- **Max closes / wk**: how many closing shifts this person may work in a week. Blank uses the department default
  from Settings. **0 means they never close**: the generator won't give them a closing shift. See "Closing shifts
  and colors" for what counts as a close.
- **Max days / wk**: the most days this person may work in a week. Blank means no limit. The generator never
  goes over it. Use it, for example, to keep full-timers to 5 days, or a part-timer who only works 2 days to 2.

## Availability

For each person and each day, choose:

- **Blank**: any time.
- **Off**: not available that day.
- **A window**, such as `6am-2pm`: the whole shift must fit inside it.

Windows are also how you steer who opens and who closes. A window that ends before closing time (such as
`6am-4pm`) means the person can only open that day. A window that starts mid-morning (such as `9:30am-8pm`)
means they can only close. For example, to have someone close Thursday, Friday and Saturday this week, give
them `9:30am-8pm` on those days and `6am-4pm` on the days they should open. Change it back the next week to
rotate.

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
  - **Default max closing shifts**: the closing limit for anyone whose own is blank on the Team screen. Here,
    0 means no limit.
  - **Closing time**: a shift that ends at or after this time is a closing shift, on every day. Leave it blank to
    use each day's latest shift end instead.
  - **Run budget and min/max on paid hours?**: 0 counts full shift hours. 1 counts paid hours, with the unpaid
    lunch taken out, for the budget and for everyone's min and max hours. Paid hours can let a part-timer fit
    one more shift under their max. Someone set to exactly 40 hours may then show as under their minimum
    (for example 37.5 paid), so set their minimum to match.
- **Backup and transfer**: export this department's data to a file, or import one. The file holds every saved
  week, with its status (Draft or Published) and schedule. Importing replaces everything, every week included.
  An older backup made before weeks were tracked holds one schedule, which comes in as a draft for the week on
  screen.
- **Recent changes** (at the bottom): the last 50 changes in this department, newest first, with who made them,
  when, and what changed, for example "Changed employee · Maria: Max hrs 32 → 40". It covers the team,
  availability, shifts, settings, day weights, forecasts, generating, swapping, editing a shift, publishing,
  imports and access changes. Saving something without changing it adds nothing.

## Store overview

Store managers and company admins see every department in the store added together, for one week.

- The week bar at the top works like the Schedule screen's: **◀ / ▶**, **This week** and **Next week**. It shares
  the week with the Schedule screen, so switching between the two keeps the same week.
- Under the week, a line counts the departments that have published, drafted, or not yet made that week's
  schedule. Each department's table shows its own label: **Published**, **Draft** or **No schedule yet**.
- **Weekly sales** for each department can be changed here for a draft week. A published week's sales are
  locked until that department unpublishes it.
- **Store payroll target**: enter a percentage and save it to see whether the store's total scheduled payroll
  is over or under it, day by day.

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

- **Planning next week:** Schedule opens on next week. Enter the forecast > Generate > check it > Publish schedule.
- **Someone calls out on a published week:** Schedule > Unpublish > swap the closer or change their shift >
  Publish schedule again.
- **Checking every department is ready:** Store overview > Next week > look for any Draft or No schedule yet.
- **Someone calls out:** Schedule > swap the closer for that day, or click their shift > Swap or give away >
  pick someone who is off that day.
- **Two people want to trade shifts:** Schedule > click one of the shifts > Swap or give away > pick the other
  person's shift that day > save.
- **Rotating who closes Saturday:** Availability > give this week's Saturday closer `9:30am-8pm` on Saturday,
  and the person who closed last Saturday a window that ends before closing time, such as `6am-4pm`. Generate.
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
- **A shift doesn't count as a close:** check Settings > Closing time. A shift only counts if it ends at or after
  that time. With Closing time blank, a shift ending at 7 PM doesn't count on a day whose latest shift ends at
  8 PM.

### When a week won't fill

If Generate leaves a shift open ("Unfilled") or warns that someone closes over their limit, the team doesn't
have enough room that week. The generator already searches for a way to reshuffle everyone's week before it gives
up, so generating again without changing anything gives the same result. Read the warning: it names what stopped each person (off that day, already at
their max hours or max days, never closes, and so on). Then make room in one of these ways:

1. **Count paid hours** (Settings): lunch comes off each shift, which often lets a part-timer take one more.
2. **Open someone's availability** on the day that's short, or widen their window.
3. **Raise someone's max hours, max days or closing limit**, if they agree.
4. **Lower the headcount** of a shift on the Shifts screen, if the day can run with fewer people.
5. **Shorten a shift** on the Shifts screen, so it fits under someone's max hours.

Don't give someone a sixth day by hand to make the week fit. Set their max days, so the warning shows the real
gap.

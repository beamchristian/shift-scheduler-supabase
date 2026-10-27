import { NextResponse } from "next/server";
import { runQuery, type RunQuery } from "./db";
import { isWeekStart, upcomingWeekStart, weekLabel } from "./weeks";
import type { ScheduleWeek } from "./types";

// Saving, changing and checking schedule weeks in the database. Date logic that the screens also need is in weeks.ts.

// The message shown when someone tries to change a published week.
export const PUBLISHED_WEEK_MESSAGE = "This week is published. Unpublish it first to make changes.";

// Reads which week a request is for, from "?week=YYYY-MM-DD" in the address or "week" in a JSON body.
// Returns the week's Monday. With no week given, uses the upcoming week. Returns an error response
// when a week is given but is not a Monday date.
export function readWeekStart(request: Request, requestBody?: { week?: unknown }): string | Response {
  const weekText = requestBody?.week ?? new URL(request.url).searchParams.get("week");
  if (weekText === undefined || weekText === null || weekText === "") return upcomingWeekStart();
  const weekStart = String(weekText);
  if (!isWeekStart(weekStart))
    return NextResponse.json({ error: "Pick a week by its Monday date." }, { status: 400 });
  return weekStart;
}

// Returns an error response when the week is published and so can't be changed, or null when it can.
export function refuseIfPublished(week: Pick<ScheduleWeek, "status">): Response | null {
  return week.status === "published" ? NextResponse.json({ error: PUBLISHED_WEEK_MESSAGE }, { status: 409 }) : null;
}

// Finds a department's week, or makes it as a new draft if it doesn't exist yet. A new week starts with the
// department's current forecast. Returns the week's id and status.
export async function ensureWeek(
  departmentId: number,
  weekStart: string,
  runStatement: RunQuery = runQuery,
): Promise<{ id: number; status: ScheduleWeek["status"] }> {
  await runStatement(
    `insert into schedule_weeks (department_id, week_start, weekly_sales)
     values ($1, $2::date, (select weekly_sales from settings where department_id = $1 limit 1))
     on conflict (department_id, week_start) do nothing`,
    [departmentId, weekStart],
  );
  const [weekRow] = await runStatement<{ id: number; status: ScheduleWeek["status"] }>(
    "select id, status from schedule_weeks where department_id = $1 and week_start = $2::date",
    [departmentId, weekStart],
  );
  return weekRow;
}

// Records who generated a week's schedule, and when.
export async function markGenerated(weekId: number, actorEmail: string): Promise<void> {
  await runQuery("update schedule_weeks set generated_by = $1, generated_at = now() where id = $2", [
    actorEmail,
    weekId,
  ]);
}

// Saves a week's sales forecast. It also becomes the department's default forecast, so the next new week
// starts from it. Refuses a published week. Returns an error message, or null when saved.
export async function saveWeekForecast(
  departmentId: number,
  weekStart: string,
  weeklySales: number,
): Promise<string | null> {
  const week = await ensureWeek(departmentId, weekStart);
  if (week.status === "published") return PUBLISHED_WEEK_MESSAGE;
  await runQuery("update schedule_weeks set weekly_sales = $1 where id = $2", [weeklySales, week.id]);
  await runQuery("update settings set weekly_sales = $1 where department_id = $2", [weeklySales, departmentId]);
  return null;
}

// Publishes a week: marks it as the official schedule and saves the payroll %, rate and day weights it uses
// now, so later changes in Settings don't change it. Returns an error message, or null when published.
export async function publishWeek(departmentId: number, weekStart: string, actorEmail: string): Promise<string | null> {
  // Only a saved week with shifts can be published, so a missing week is not created here.
  const [week] = await runQuery<{ id: number; status: string; shift_count: number }>(
    `select week.id, week.status, (select count(*)::int from schedule shift where shift.week_id = week.id) as shift_count
     from schedule_weeks week where week.department_id = $1 and week.week_start = $2::date`,
    [departmentId, weekStart],
  );
  if (week?.status === "published") return "This week is already published.";
  if (!week?.shift_count) return `There is no schedule for ${weekLabel(weekStart)} to publish yet. Generate one first.`;
  await runQuery(
    `update schedule_weeks set
       status = 'published',
       payroll_pct = (select payroll_pct from settings where department_id = $2 limit 1),
       rate_override = (select rate_override from settings where department_id = $2 limit 1),
       day_weights = (select jsonb_object_agg(day::text, sales_pct) from store_hours where department_id = $2),
       published_by = $3,
       published_at = now()
     where id = $1`,
    [week.id, departmentId, actorEmail],
  );
  return null;
}

// Unpublishes a week so it can be changed again. Its saved numbers are kept for the record, but a draft week
// uses the current Settings. Returns an error message, or null when unpublished.
export async function unpublishWeek(departmentId: number, weekStart: string): Promise<string | null> {
  const [changedRow] = await runQuery<{ id: number }>(
    `update schedule_weeks set status = 'draft'
     where department_id = $1 and week_start = $2::date and status = 'published'
     returning id`,
    [departmentId, weekStart],
  );
  return changedRow ? null : "This week is not published.";
}

// One saved week in the week list: its Monday, status, and how many shifts it has.
export interface WeekSummary {
  week_start: string;
  status: ScheduleWeek["status"];
  shift_count: number;
}

// Lists every week a department has a saved schedule for, newest first.
export async function listWeeks(departmentId: number): Promise<WeekSummary[]> {
  return runQuery<WeekSummary>(
    `select to_char(week.week_start, 'YYYY-MM-DD') as week_start, week.status,
            (select count(*)::int from schedule shift where shift.week_id = week.id) as shift_count
     from schedule_weeks week
     where week.department_id = $1
     order by week.week_start desc`,
    [departmentId],
  );
}

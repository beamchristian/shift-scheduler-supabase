import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, runQuery, snapshot } from "../../../lib/db";
import { PUBLISHED_WEEK_MESSAGE, readWeekStart, refuseIfPublished } from "../../../lib/scheduleWeeks";
import { checkShiftEdit } from "../../../lib/shiftEdit";
import { weekLabel } from "../../../lib/weeks";

export const dynamic = "force-dynamic";

// Changes the start and end of one shift in one week of the active department's schedule ("week" in the body,
// or the upcoming week). A published week is refused. Anyone who can open the department may do this. Warnings about labor, hours, closings, and availability
// are returned with the saved schedule. Errors (such as overlapping shifts) stop the change.
// With dryRun set, nothing is saved and only the check is returned, so the editor can show warnings live.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;

  const requestBody = (await request.json().catch(() => ({}))) as {
    id?: number;
    start?: string;
    end?: string;
    dryRun?: boolean;
    week?: string;
  };
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;
  const shiftId = Number(requestBody.id);
  const newStart = String(requestBody.start ?? "");
  const newEnd = String(requestBody.end ?? "");

  try {
    const currentData = await snapshot(caller.departmentId, weekStart);
    const publishedRefusal = refuseIfPublished(currentData.week);
    if (publishedRefusal) return publishedRefusal;
    const check = checkShiftEdit(currentData, shiftId, newStart, newEnd);
    if (check.errors.length)
      return NextResponse.json({ error: check.errors.join(" ") }, { status: 400 });
    if (requestBody.dryRun) return NextResponse.json({ errors: [], warnings: check.warnings });

    const shift = currentData.schedule.find((scheduleRow) => scheduleRow.id === shiftId);
    const personName = currentData.employees.find((person) => person.id === shift?.employee_id)?.name ?? "Unknown";
    // The update only applies while the week is still a draft, in case it was published a moment ago.
    const changedRows = await runQuery(
      `update schedule set "start" = $1, "end" = $2
       where id = $3 and department_id = $4 and week_id = $5
         and exists (select 1 from schedule_weeks where id = $5 and status = 'draft')
       returning id`,
      [newStart, newEnd, shiftId, caller.departmentId, currentData.week.id],
    );
    if (!changedRows.length) return NextResponse.json({ error: PUBLISHED_WEEK_MESSAGE }, { status: 409 });
    await recordAuditEntry(
      caller.departmentId,
      caller.email,
      "Edited shift",
      `${weekLabel(weekStart)}: ${personName} ${shift?.name ?? ""} day ${shift?.day}: ${shift?.start}-${shift?.end} to ${newStart}-${newEnd}`,
    );
    return NextResponse.json({ ...(await snapshot(caller.departmentId, weekStart)), warnings: check.warnings });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

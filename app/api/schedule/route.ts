import { NextResponse } from "next/server";
import { resolveCaller, type Caller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, runQuery, snapshot, transaction } from "../../../lib/db";
import { PUBLISHED_WEEK_MESSAGE, readWeekStart, refuseIfPublished } from "../../../lib/scheduleWeeks";
import { checkShiftEdit, checkShiftSwap } from "../../../lib/shiftEdit";
import type { Snapshot } from "../../../lib/types";
import { weekLabel } from "../../../lib/weeks";

export const dynamic = "force-dynamic";

// What the shift editor sends. Times change one shift's start and end. swapWithShiftId swaps it with another
// person's shift that day, and giveToEmployeeId hands it to someone who is off that day.
interface ShiftChangeRequest {
  id?: number;
  start?: string;
  end?: string;
  swapWithShiftId?: number | null;
  giveToEmployeeId?: number | null;
  dryRun?: boolean;
  week?: string;
}

// Changes one shift in one week of the active department's schedule ("week" in the body, or the upcoming week):
// its start and end, or who works it (a swap with another shift that day, or a hand-over to someone off that day).
// A published week is refused. Anyone who can open the department may do this. Warnings about labor, hours,
// closings, and availability are returned with the saved schedule. Errors (such as overlapping shifts) stop the change.
// With dryRun set, nothing is saved and only the check is returned, so the editor can show warnings live.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;

  const requestBody = (await request.json().catch(() => ({}))) as ShiftChangeRequest;
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;

  try {
    const currentData = await snapshot(caller.departmentId, weekStart);
    const publishedRefusal = refuseIfPublished(currentData.week);
    if (publishedRefusal) return publishedRefusal;
    const isSwap = requestBody.swapWithShiftId != null || requestBody.giveToEmployeeId != null;
    return isSwap
      ? await swapShift(caller, currentData, requestBody, weekStart)
      : await editShiftTimes(caller, currentData, requestBody, weekStart);
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

// Saves a shift's new start and end, and its new name when the times move it between opening, closing and other.
// Returns the saved schedule with warnings, only the check on a dry run, or an error.
async function editShiftTimes(
  caller: Caller,
  currentData: Snapshot,
  requestBody: ShiftChangeRequest,
  weekStart: string,
): Promise<Response> {
  const shiftId = Number(requestBody.id);
  const newStart = String(requestBody.start ?? "");
  const newEnd = String(requestBody.end ?? "");
  const check = checkShiftEdit(currentData, shiftId, newStart, newEnd);
  if (check.errors.length) return NextResponse.json({ error: check.errors.join(" ") }, { status: 400 });
  if (requestBody.dryRun)
    return NextResponse.json({ errors: [], warnings: check.warnings, renamedTo: check.renamedTo ?? null });

  const shift = currentData.schedule.find((scheduleRow) => scheduleRow.id === shiftId);
  const personName = currentData.employees.find((person) => person.id === shift?.employee_id)?.name ?? "Unknown";
  const newName = check.renamedTo ?? shift?.name ?? "";
  // The update only applies while the week is still a draft, in case it was published a moment ago.
  const changedRows = await runQuery(
    `update schedule set "start" = $1, "end" = $2, name = $3
     where id = $4 and department_id = $5 and week_id = $6
       and exists (select 1 from schedule_weeks where id = $6 and status = 'draft')
     returning id`,
    [newStart, newEnd, newName, shiftId, caller.departmentId, currentData.week.id],
  );
  if (!changedRows.length) return NextResponse.json({ error: PUBLISHED_WEEK_MESSAGE }, { status: 409 });
  const renameNote = check.renamedTo ? `, renamed to ${check.renamedTo}` : "";
  await recordAuditEntry(
    caller.departmentId,
    caller.email,
    "Edited shift",
    `${weekLabel(weekStart)}: ${personName} ${shift?.name ?? ""} day ${shift?.day}: ${shift?.start}-${shift?.end} to ${newStart}-${newEnd}${renameNote}`,
  );
  return NextResponse.json({ ...(await snapshot(caller.departmentId, weekStart)), warnings: check.warnings });
}

// Swaps a shift with another person's shift that day, or gives it to someone who is off that day.
// Returns the saved schedule with warnings, only the check on a dry run, or an error.
async function swapShift(
  caller: Caller,
  currentData: Snapshot,
  requestBody: ShiftChangeRequest,
  weekStart: string,
): Promise<Response> {
  const check = checkShiftSwap(
    currentData,
    Number(requestBody.id),
    requestBody.swapWithShiftId != null ? Number(requestBody.swapWithShiftId) : null,
    requestBody.giveToEmployeeId != null ? Number(requestBody.giveToEmployeeId) : null,
  );
  if (check.errors.length) return NextResponse.json({ error: check.errors.join(" ") }, { status: 400 });
  if (requestBody.dryRun) return NextResponse.json({ errors: [], warnings: check.warnings, renamedTo: null });

  // Both rows change together or not at all, and only while the week is still a draft.
  const isSaved = await transaction(async (transactionQuery) => {
    for (const changedRow of check.changedRows) {
      const updatedRows = await transactionQuery(
        `update schedule set employee_id = $1
         where id = $2 and department_id = $3 and week_id = $4
           and exists (select 1 from schedule_weeks where id = $4 and status = 'draft')
         returning id`,
        [changedRow.employee_id, changedRow.id, caller.departmentId, currentData.week.id],
      );
      if (!updatedRows.length) throw new Error(PUBLISHED_WEEK_MESSAGE);
    }
    return true;
  }).catch((thrownError: unknown) => {
    if (errMsg(thrownError) === PUBLISHED_WEEK_MESSAGE) return false;
    throw thrownError;
  });
  if (!isSaved) return NextResponse.json({ error: PUBLISHED_WEEK_MESSAGE }, { status: 409 });
  await recordAuditEntry(
    caller.departmentId,
    caller.email,
    requestBody.swapWithShiftId != null ? "Swapped shifts" : "Reassigned shift",
    `${weekLabel(weekStart)}: ${check.description}`,
  );
  return NextResponse.json({ ...(await snapshot(caller.departmentId, weekStart)), warnings: check.warnings });
}

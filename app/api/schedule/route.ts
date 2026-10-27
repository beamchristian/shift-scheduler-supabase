import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, runQuery, snapshot } from "../../../lib/db";
import { checkShiftEdit } from "../../../lib/shiftEdit";

export const dynamic = "force-dynamic";

// Changes the start and end of one shift on the active department's schedule.
// Anyone who can open the department may do this. Warnings about labor, hours, closings, and availability
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
  };
  const shiftId = Number(requestBody.id);
  const newStart = String(requestBody.start ?? "");
  const newEnd = String(requestBody.end ?? "");

  try {
    const currentData = await snapshot(caller.departmentId);
    const check = checkShiftEdit(currentData, shiftId, newStart, newEnd);
    if (check.errors.length)
      return NextResponse.json({ error: check.errors.join(" ") }, { status: 400 });
    if (requestBody.dryRun) return NextResponse.json({ errors: [], warnings: check.warnings });

    const shift = currentData.schedule.find((scheduleRow) => scheduleRow.id === shiftId);
    const personName = currentData.employees.find((person) => person.id === shift?.employee_id)?.name ?? "Unknown";
    await runQuery(
      `update schedule set "start" = $1, "end" = $2 where id = $3 and department_id = $4`,
      [newStart, newEnd, shiftId, caller.departmentId],
    );
    await recordAuditEntry(
      caller.departmentId,
      caller.email,
      "Edited shift",
      `${personName} ${shift?.name ?? ""} day ${shift?.day}: ${shift?.start}-${shift?.end} to ${newStart}-${newEnd}`,
    );
    return NextResponse.json({ ...(await snapshot(caller.departmentId)), warnings: check.warnings });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

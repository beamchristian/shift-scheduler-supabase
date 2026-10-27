import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { snapshot } from "../../../lib/db";
import { importAll } from "../../../lib/backup";
import { readWeekStart } from "../../../lib/scheduleWeeks";
import { weekLabel } from "../../../lib/weeks";

export const dynamic = "force-dynamic";

// Replaces the active department's data with an uploaded export file. Every saved week is cleared, and the file's
// schedule goes into the week in "?week=YYYY-MM-DD" (or the upcoming week) as a draft.
// Only company admins and store managers, since this replaces everything in the department.
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { accessManagersOnly: true });
  if (caller instanceof Response) return caller;
  const weekStart = readWeekStart(request);
  if (weekStart instanceof Response) return weekStart;

  let uploadedFileContent: unknown;
  try {
    uploadedFileContent = await request.json();
  } catch {
    return NextResponse.json({ error: "That file is not valid JSON." }, { status: 400 });
  }

  const importResult = await importAll(uploadedFileContent, caller.departmentId, weekStart);
  if (!importResult.ok)
    return NextResponse.json({ error: importResult.error }, { status: 400 });
  await recordAuditEntry(
    caller.departmentId,
    caller.email,
    "Imported backup",
    `Replaced employees, shifts, settings and every week; the file's schedule is now ${weekLabel(weekStart)}`,
  );
  return NextResponse.json(await snapshot(caller.departmentId, weekStart));
}

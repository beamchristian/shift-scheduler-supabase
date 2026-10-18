import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { snapshot } from "../../../lib/db";
import { importAll } from "../../../lib/backup";

export const dynamic = "force-dynamic";

// Replaces the active department's data with an uploaded export file. Only company admins and store managers,
// since this replaces everything in the department.
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { accessManagersOnly: true });
  if (caller instanceof Response) return caller;

  let uploadedFileContent: unknown;
  try {
    uploadedFileContent = await request.json();
  } catch {
    return NextResponse.json({ error: "That file is not valid JSON." }, { status: 400 });
  }

  const importResult = await importAll(uploadedFileContent, caller.departmentId);
  if (!importResult.ok)
    return NextResponse.json({ error: importResult.error }, { status: 400 });
  await recordAuditEntry(
    caller.departmentId,
    caller.email,
    "Imported backup",
    "Replaced employees, shifts, settings and the schedule",
  );
  return NextResponse.json(await snapshot(caller.departmentId));
}

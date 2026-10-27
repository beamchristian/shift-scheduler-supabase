import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, snapshot } from "../../../lib/db";
import { generate } from "../../../lib/generate";

export const dynamic = "force-dynamic";

// Builds and saves a new schedule for the active department, then returns its data and any warnings.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  try {
    const warnings = await generate(caller.departmentId);
    await recordAuditEntry(
      caller.departmentId,
      caller.email,
      "Generated schedule",
      warnings.length ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : "No warnings",
    );
    return NextResponse.json({ ...(await snapshot(caller.departmentId)), warnings });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

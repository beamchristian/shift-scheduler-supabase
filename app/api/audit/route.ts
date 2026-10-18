import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { listAuditEntries } from "../../../lib/audit";
import { errMsg } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Returns the newest changes for the active department. Owners and managers can both see them.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  try {
    return NextResponse.json({ entries: await listAuditEntries(caller.departmentId) });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

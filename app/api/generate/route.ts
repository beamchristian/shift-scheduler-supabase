import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, snapshot } from "../../../lib/db";
import { generate } from "../../../lib/generate";
import { markGenerated, readWeekStart, refuseIfPublished } from "../../../lib/scheduleWeeks";
import { weekLabel } from "../../../lib/weeks";

export const dynamic = "force-dynamic";

// Builds and saves a new schedule for one week of the active department ("week" in the body, or the upcoming
// week), then returns that week's data and any warnings. A published week must be unpublished first.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  const requestBody = (await request.json().catch(() => ({}))) as { week?: string };
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;
  try {
    const currentData = await snapshot(caller.departmentId, weekStart);
    const publishedRefusal = refuseIfPublished(currentData.week);
    if (publishedRefusal) return publishedRefusal;

    const { warnings, weekId } = await generate(caller.departmentId, weekStart);
    await markGenerated(weekId, caller.email);
    await recordAuditEntry(
      caller.departmentId,
      caller.email,
      "Generated schedule",
      `${weekLabel(weekStart)}: ${warnings.length ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : "no warnings"}`,
    );
    return NextResponse.json({ ...(await snapshot(caller.departmentId, weekStart)), warnings });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

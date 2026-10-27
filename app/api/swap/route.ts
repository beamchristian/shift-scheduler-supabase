import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, snapshot } from "../../../lib/db";
import { readWeekStart } from "../../../lib/scheduleWeeks";
import { swapClosers } from "../../../lib/swap";
import { weekLabel } from "../../../lib/weeks";

export const dynamic = "force-dynamic";

// Swaps the closer on one day (Monday to Saturday) of one week in the active department's schedule.
// A published week is refused; the message says to unpublish it first.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;

  const requestBody = (await request.json().catch(() => ({}))) as { day?: number; week?: string };
  const day = Number(requestBody.day);
  if (!(day >= 1 && day <= 6))
    return NextResponse.json({ error: "Pick a day from Monday to Saturday." }, { status: 400 });
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;
  try {
    const swapResult = await swapClosers(day, caller.departmentId, weekStart);
    if (swapResult.ok)
      await recordAuditEntry(
        caller.departmentId,
        caller.email,
        "Swapped closers",
        `${weekLabel(weekStart)}: ${swapResult.message}`,
      );
    return NextResponse.json({ ...(await snapshot(caller.departmentId, weekStart)), ...swapResult });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { errMsg } from "../../../lib/db";
import { preview } from "../../../lib/generate";
import { readWeekStart } from "../../../lib/scheduleWeeks";

export const dynamic = "force-dynamic";

// Checks whether the active department's team can cover every required shift in one week. Saves nothing.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  const requestBody = (await request.json().catch(() => ({}))) as { week?: string };
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;
  try {
    return NextResponse.json(await preview(caller.departmentId, weekStart));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { moneyText } from "../../../lib/auditChanges";
import { errMsg, snapshot } from "../../../lib/db";
import {
  currentForecast,
  listWeeks,
  publishWeek,
  readWeekStart,
  saveWeekForecast,
  unpublishWeek,
} from "../../../lib/scheduleWeeks";
import { currentWeekStart, todayInStore, upcomingWeekStart, weekLabel } from "../../../lib/weeks";

export const dynamic = "force-dynamic";

// What the page sends to change one week: save its forecast, publish it, or unpublish it.
interface WeekChangeRequest {
  action?: "forecast" | "publish" | "unpublish";
  // The week's Monday, as "YYYY-MM-DD".
  week?: string;
  weeklySales?: number | string;
}

// Returns the weeks that have a saved schedule (newest first), plus today's date, this week and the upcoming
// week in the store's time zone, so the page can show where it is.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  try {
    const today = todayInStore();
    return NextResponse.json({
      weeks: await listWeeks(caller.departmentId),
      today,
      currentWeek: currentWeekStart(today),
      upcomingWeek: upcomingWeekStart(today),
    });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

// Changes one week of the active department, then returns that week's data. Anyone who can open the department
// may do this. Actions:
// - "forecast" (weeklySales): saves the week's sales forecast. Refused for a published week.
// - "publish": makes the week the official schedule and saves the numbers it uses.
// - "unpublish": lets the week be generated, swapped and edited again.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  const requestBody = (await request.json().catch(() => ({}))) as WeekChangeRequest;
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;

  try {
    let refusal: string | null;
    if (requestBody.action === "forecast") {
      const weeklySales = Number(requestBody.weeklySales);
      if (String(requestBody.weeklySales ?? "").trim() === "" || !Number.isFinite(weeklySales) || weeklySales < 0)
        return NextResponse.json({ error: "Enter a weekly sales forecast of zero or more." }, { status: 400 });
      const previousSales = await currentForecast(caller.departmentId, weekStart);
      refusal = await saveWeekForecast(caller.departmentId, weekStart, weeklySales);
      if (!refusal && previousSales !== weeklySales)
        await recordAuditEntry(
          caller.departmentId,
          caller.email,
          "Changed sales forecast",
          `${weekLabel(weekStart)}: ${moneyText(previousSales)} → ${moneyText(weeklySales)}`,
        );
    } else if (requestBody.action === "publish") {
      refusal = await publishWeek(caller.departmentId, weekStart, caller.email);
      if (!refusal) await recordAuditEntry(caller.departmentId, caller.email, "Published schedule", weekLabel(weekStart));
    } else if (requestBody.action === "unpublish") {
      refusal = await unpublishWeek(caller.departmentId, weekStart);
      if (!refusal) await recordAuditEntry(caller.departmentId, caller.email, "Unpublished schedule", weekLabel(weekStart));
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
    return NextResponse.json(await snapshot(caller.departmentId, weekStart));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { canManageStore, resolveCaller } from "../../../../lib/access";
import { recordAuditEntry } from "../../../../lib/audit";
import { moneyText } from "../../../../lib/auditChanges";
import { errMsg, runQuery } from "../../../../lib/db";
import { currentForecast, readWeekStart, saveWeekForecast } from "../../../../lib/scheduleWeeks";
import { loadStoreOverview } from "../../../../lib/storeOverviewData";
import { weekLabel } from "../../../../lib/weeks";

export const dynamic = "force-dynamic";

// What the store overview sends when someone changes a department's weekly projected sales.
interface SaveWeeklySalesRequest {
  departmentId: number;
  weeklySales: number | string;
  // The week being changed, as its Monday.
  week?: string;
}

// Saves a department's projected sales for one week. The day split keeps the department's day weights,
// so only the weekly total changes. A published week is refused. Returns the updated store overview for that week.
// Only company admins and store managers of the same store may change it. The change is written to that
// department's audit log, since it is that department's forecast.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await canManageStore(caller.email, caller.storeId)))
    return NextResponse.json(
      { error: "Only company admins and store managers can change projected sales." },
      { status: 403 },
    );

  const requestBody = (await request.json()) as SaveWeeklySalesRequest;
  const { departmentId, weeklySales } = requestBody;
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;
  const weeklySalesNumber = Number(weeklySales);
  if (!Number.isInteger(Number(departmentId)) || !Number.isFinite(weeklySalesNumber) || weeklySalesNumber < 0)
    return NextResponse.json({ error: "Enter a weekly sales amount of zero or more." }, { status: 400 });

  try {
    // The department must belong to the caller's store.
    const ownershipRows = await runQuery(
      "select 1 from departments where id = $1 and store_id = $2",
      [Number(departmentId), caller.storeId],
    );
    if (!ownershipRows.length)
      return NextResponse.json({ error: "That department is not in your store." }, { status: 403 });

    const previousSales = await currentForecast(Number(departmentId), weekStart);
    const refusal = await saveWeekForecast(Number(departmentId), weekStart, weeklySalesNumber);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
    if (previousSales !== weeklySalesNumber)
      await recordAuditEntry(
        Number(departmentId),
        caller.email,
        "Changed sales forecast",
        `${weekLabel(weekStart)}: ${moneyText(previousSales)} → ${moneyText(weeklySalesNumber)} (from the store overview)`,
      );
    return NextResponse.json(await loadStoreOverview(caller.storeId, caller.storeName, weekStart));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { canManageStore, resolveCaller } from "../../../lib/access";
import { errMsg, runQuery, snapshot } from "../../../lib/db";
import { buildReport } from "../../../lib/report";
import { buildStoreOverview, type DepartmentReport } from "../../../lib/storeOverview";

export const dynamic = "force-dynamic";

// Returns the labor matrix for the whole store: every department in the caller's store, added together by day.
// Only company admins and store managers of that store can open it.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await canManageStore(caller.email, caller.storeId)))
    return NextResponse.json(
      { error: "Only company admins and store managers can see the store overview." },
      { status: 403 },
    );

  try {
    const departmentRows = await runQuery<{ id: number; name: string }>(
      "select id, name from departments where store_id = $1 order by id",
      [caller.storeId],
    );
    // Loads one department at a time, so the database pool is not flooded.
    const departmentReports: DepartmentReport[] = [];
    for (const departmentRow of departmentRows) {
      const departmentData = await snapshot(departmentRow.id);
      departmentReports.push({
        departmentId: departmentRow.id,
        departmentName: departmentRow.name,
        weeklySales: Number(departmentData.settings.weekly_sales),
        report: buildReport(departmentData),
      });
    }
    const storeRows = await runQuery<{ target_payroll_pct: number | null }>(
      "select target_payroll_pct from stores where id = $1",
      [caller.storeId],
    );
    return NextResponse.json({
      storeName: caller.storeName,
      storePayrollPercent: storeRows[0]?.target_payroll_pct ?? null,
      ...buildStoreOverview(departmentReports),
    });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

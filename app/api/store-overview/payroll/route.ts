import { NextResponse } from "next/server";
import { canManageStore, resolveCaller } from "../../../../lib/access";
import { recordAuditEntry } from "../../../../lib/audit";
import { percentText } from "../../../../lib/auditChanges";
import { errMsg, runQuery } from "../../../../lib/db";
import { readWeekStart } from "../../../../lib/scheduleWeeks";
import { loadStoreOverview } from "../../../../lib/storeOverviewData";

export const dynamic = "force-dynamic";

// What the store overview sends when someone saves the store's payroll target.
// payrollPercent is blank when the target is cleared.
interface SaveStorePayrollRequest {
  payrollPercent: number | string | null;
  // The week the overview is showing, as its Monday. The reply is that week's overview.
  week?: string;
}

// Saves the store-wide payroll target, as a percent of sales, and returns the updated store overview.
// Only company admins and store managers of that store may change it. The change is written to the audit log
// of the department the person has open, since the store itself has no log.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await canManageStore(caller.email, caller.storeId)))
    return NextResponse.json(
      { error: "Only company admins and store managers can change the store payroll target." },
      { status: 403 },
    );

  const requestBody = (await request.json()) as SaveStorePayrollRequest;
  const { payrollPercent } = requestBody;
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;
  const isBlank = payrollPercent === null || String(payrollPercent).trim() === "";
  const payrollPercentNumber = isBlank ? null : Number(payrollPercent);
  if (payrollPercentNumber !== null && (!Number.isFinite(payrollPercentNumber) || payrollPercentNumber < 0 || payrollPercentNumber > 100))
    return NextResponse.json({ error: "Enter a payroll percent between 0 and 100." }, { status: 400 });

  try {
    const [storeRow] = await runQuery<{ target_payroll_pct: number | null }>(
      "select target_payroll_pct from stores where id = $1",
      [caller.storeId],
    );
    const previousPercent = storeRow?.target_payroll_pct ?? null;
    await runQuery("update stores set target_payroll_pct = $1 where id = $2", [payrollPercentNumber, caller.storeId]);
    if ((previousPercent === null ? null : Number(previousPercent)) !== payrollPercentNumber)
      await recordAuditEntry(
        caller.departmentId,
        caller.email,
        "Changed store payroll target",
        `${caller.storeName}: ${percentText(previousPercent)} → ${percentText(payrollPercentNumber)}`,
      );
    return NextResponse.json(await loadStoreOverview(caller.storeId, caller.storeName, weekStart));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

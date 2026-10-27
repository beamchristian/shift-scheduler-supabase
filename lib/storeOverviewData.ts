import { runQuery, snapshot } from "./db";
import { buildReport } from "./report";
import {
  buildStoreOverview,
  type DepartmentReport,
  type StoreOverview,
} from "./storeOverview";

// The store overview as the screen shows it: the store's name, the week shown, and the saved payroll target,
// plus the combined figures.
export interface StoreOverviewPayload extends StoreOverview {
  storeName: string;
  // The week's Monday, as "YYYY-MM-DD".
  weekStart: string;
  storePayrollPercent: number | null;
}

// Loads every department in one store for one week and builds the store overview from their data.
// weekStart is the week's Monday. Departments are loaded one at a time, so the database pool is not flooded.
export async function loadStoreOverview(
  storeId: number,
  storeName: string,
  weekStart: string,
): Promise<StoreOverviewPayload> {
  const departmentRows = await runQuery<{ id: number; name: string }>(
    "select id, name from departments where store_id = $1 order by id",
    [storeId],
  );
  const departmentReports: DepartmentReport[] = [];
  for (const departmentRow of departmentRows) {
    const report = buildReport(await snapshot(departmentRow.id, weekStart));
    departmentReports.push({
      departmentId: departmentRow.id,
      departmentName: departmentRow.name,
      weeklySales: report.weeklySales,
      report,
    });
  }
  const storeRows = await runQuery<{ target_payroll_pct: number | null }>(
    "select target_payroll_pct from stores where id = $1",
    [storeId],
  );
  return {
    storeName,
    weekStart,
    storePayrollPercent: storeRows[0]?.target_payroll_pct ?? null,
    ...buildStoreOverview(departmentReports),
  };
}

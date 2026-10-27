import { runQuery, snapshot } from "./db";
import { buildReport } from "./report";
import { buildStoreOverview, type DepartmentReport, type StoreOverview } from "./storeOverview";

// The store overview as the screen shows it: the store's name and saved payroll target, plus the combined figures.
export interface StoreOverviewPayload extends StoreOverview {
  storeName: string;
  storePayrollPercent: number | null;
}

// Loads every department in one store and builds the store overview from their data.
// Departments are loaded one at a time, so the database pool is not flooded.
export async function loadStoreOverview(storeId: number, storeName: string): Promise<StoreOverviewPayload> {
  const departmentRows = await runQuery<{ id: number; name: string }>(
    "select id, name from departments where store_id = $1 order by id",
    [storeId],
  );
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
    [storeId],
  );
  return {
    storeName,
    storePayrollPercent: storeRows[0]?.target_payroll_pct ?? null,
    ...buildStoreOverview(departmentReports),
  };
}

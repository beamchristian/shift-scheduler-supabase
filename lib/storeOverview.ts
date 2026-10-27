import type { DayRow, Report } from "./report";

// Where one department's schedule for the week stands: published, a draft, or nothing saved yet.
export type DepartmentWeekStatus = "published" | "draft" | "empty";

// One department's labor report, with its name, for combining into the store view.
export interface DepartmentReport {
  departmentId: number;
  departmentName: string;
  // The weekly forecast saved on the Schedule screen for this department.
  weeklySales: number;
  weekStatus: DepartmentWeekStatus;
  report: Report;
}

// The labor figures for one day, added up across every department in the store.
export interface StoreDayTotals {
  day: number;
  sales: number;
  target: number;
  allowed: number;
  req: number;
  reqCost: number;
  sched: number;
  schedCost: number;
}

// One department's figures for each day, shown in the breakdown under the store totals.
export interface DepartmentBreakdown {
  departmentId: number;
  departmentName: string;
  // The weekly forecast saved on the Schedule screen.
  weeklySales: number;
  weekStatus: DepartmentWeekStatus;
  days: DayRow[];
  rate: number;
}

// The whole store view: totals for each day, the week's totals, and each department's own figures.
export interface StoreOverview {
  days: StoreDayTotals[];
  totals: StoreDayTotals;
  departments: DepartmentBreakdown[];
}

// Figures that are added together across departments. Cost fields are added the same way.
const SUMMED_DAY_FIELDS = [
  "sales",
  "target",
  "allowed",
  "req",
  "reqCost",
  "sched",
  "schedCost",
] as const;

// A day with every figure at zero, to add department figures into.
function emptyDayTotals(day: number): StoreDayTotals {
  return {
    day,
    sales: 0,
    target: 0,
    allowed: 0,
    req: 0,
    reqCost: 0,
    sched: 0,
    schedCost: 0,
  };
}

// Reads one department's day as the store view's figures, including the cost to fully staff.
// The cost is worked out here because each department has its own rate.
function departmentDayFigures(dayRow: DayRow, hourlyRate: number) {
  return {
    sales: dayRow.sales,
    target: dayRow.target,
    allowed: dayRow.allowed,
    req: dayRow.req,
    reqCost: dayRow.req * hourlyRate,
    sched: dayRow.sched,
    schedCost: dayRow.schedCost,
  };
}

// Adds every department's figures together, day by day, and keeps each department's own days.
// Returns the store's days in day order, the week's totals, and the per-department breakdown.
export function buildStoreOverview(departmentReports: DepartmentReport[]): StoreOverview {
  const totalsByDay = new Map<number, StoreDayTotals>();
  for (const { report } of departmentReports) {
    for (const dayRow of report.days) {
      const dayTotals = totalsByDay.get(dayRow.day) ?? emptyDayTotals(dayRow.day);
      const figures = departmentDayFigures(dayRow, report.rate);
      for (const fieldName of SUMMED_DAY_FIELDS) dayTotals[fieldName] += figures[fieldName];
      totalsByDay.set(dayRow.day, dayTotals);
    }
  }

  const days = [...totalsByDay.values()].sort((first, second) => first.day - second.day);
  // The week's totals are the sum of the days, so the two always agree.
  const totals = emptyDayTotals(0);
  for (const dayTotals of days)
    for (const fieldName of SUMMED_DAY_FIELDS) totals[fieldName] += dayTotals[fieldName];

  return {
    days,
    totals,
    departments: departmentReports.map(({ departmentId, departmentName, weeklySales, weekStatus, report }) => ({
      departmentId,
      departmentName,
      weeklySales,
      weekStatus,
      days: report.days,
      rate: report.rate,
    })),
  };
}

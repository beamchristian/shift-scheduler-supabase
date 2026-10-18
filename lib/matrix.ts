import { clockHours, paidHours, type BreakRule } from "./hours";
import type { ShiftTemplate, Settings, StoreHour } from "./types";

// Labor matrix: daily hours allowed = daily sales x payroll % / average hourly rate.
// Daily sales = the week's forecast, split across the days by each day's share of weekly sales.
// The average hourly rate is one setting for the whole department. Pay is never stored per person.

// Returns the average hourly rate from the settings, or 0 when none is set.
export function avgRate(settings: Settings): number {
  const overrideRate = Number(settings.rate_override);
  return overrideRate > 0 ? overrideRate : 0;
}

// Splits the weekly sales forecast across the days, in proportion to each day's sales share.
// Returns the sales amount for each day, keyed by day number (1 = Monday).
export function dailySales(
  storeHourRows: StoreHour[],
  settings: Settings,
): Record<number, number> {
  const totalSalesShare = storeHourRows.reduce(
    (runningTotal, storeHour) => runningTotal + Number(storeHour.sales_pct),
    0,
  );
  return Object.fromEntries(
    storeHourRows.map((storeHour) => [
      storeHour.day,
      totalSalesShare > 0
        ? (Number(settings.weekly_sales) * Number(storeHour.sales_pct)) / totalSalesShare
        : 0,
    ]),
  );
}

// The labor budget for one day: the payroll dollars allowed, and the hours those dollars buy at the average rate.
export function dayBudget(
  dailySalesAmount: number,
  settings: Settings,
  hourlyRate: number,
): { target: number; hours: number } {
  const payrollTargetDollars = (dailySalesAmount * Number(settings.payroll_pct)) / 100;
  return {
    target: payrollTargetDollars,
    hours: hourlyRate > 0 ? payrollTargetDollars / hourlyRate : 0,
  };
}

// Hours needed on each day to fill every shift template (people needed x shift length).
// Returns the totals two ways: as scheduled shift hours, and as paid hours. Also the number of people needed.
export function requiredHours(
  shiftTemplates: ShiftTemplate[],
  breakSettings: BreakRule,
): {
  shift: Record<number, number>;
  paid: Record<number, number>;
  heads: Record<number, number>;
} {
  const shiftHoursByDay: Record<number, number> = {};
  const paidHoursByDay: Record<number, number> = {};
  const peopleByDay: Record<number, number> = {};
  for (const template of shiftTemplates) {
    const peopleNeeded = Number(template.needed);
    shiftHoursByDay[template.day] =
      (shiftHoursByDay[template.day] || 0) + peopleNeeded * clockHours(template.start, template.end);
    paidHoursByDay[template.day] =
      (paidHoursByDay[template.day] || 0) + peopleNeeded * paidHours(template.start, template.end, breakSettings);
    peopleByDay[template.day] = (peopleByDay[template.day] || 0) + peopleNeeded;
  }
  return { shift: shiftHoursByDay, paid: paidHoursByDay, heads: peopleByDay };
}

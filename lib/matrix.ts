import { clockHours, paidHours, type BreakRule } from "./hours";
import type { Employee, Settings, ShiftTemplate, StoreHour } from "./types";

// Labor matrix: daily hours allowed = daily sales x payroll % / average hourly rate.
// Daily sales = the week's forecast split by each day's share of weekly sales.
export function avgRate(s: Settings, emps: Employee[]): number {
  const o = Number(s.rate_override);
  if (o > 0) return o;
  const w = emps.map((e) => Number(e.wage)).filter((x) => x > 0);
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0;
}

export function dailySales(
  hs: StoreHour[],
  s: Settings,
): Record<number, number> {
  const total = hs.reduce((a, h) => a + Number(h.sales_pct), 0);
  return Object.fromEntries(
    hs.map((h) => [
      h.day,
      total > 0 ? (Number(s.weekly_sales) * Number(h.sales_pct)) / total : 0,
    ]),
  );
}

export function dayBudget(
  sales: number,
  s: Settings,
  rate: number,
): { target: number; hours: number } {
  const target = (sales * Number(s.payroll_pct)) / 100;
  return { target, hours: rate > 0 ? target / rate : 0 };
}

// Hours needed per day to fill every shift template (headcount x shift length), as scheduled shift hours and as paid hours.
export function requiredHours(
  tpls: ShiftTemplate[],
  rule: BreakRule,
): {
  shift: Record<number, number>;
  paid: Record<number, number>;
  heads: Record<number, number>;
} {
  const shift: Record<number, number> = {};
  const paid: Record<number, number> = {};
  const heads: Record<number, number> = {};
  for (const t of tpls) {
    const n = Number(t.needed);
    shift[t.day] = (shift[t.day] || 0) + n * clockHours(t.start, t.end);
    paid[t.day] = (paid[t.day] || 0) + n * paidHours(t.start, t.end, rule);
    heads[t.day] = (heads[t.day] || 0) + n;
  }
  return { shift, paid, heads };
}

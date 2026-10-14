import type { Employee, Settings, ShiftTemplate, StoreHour } from './types';

// Labor matrix: daily hours allowed = daily sales x payroll % / average hourly rate.
// Daily sales = the week's forecast split by each day's share of weekly sales.
export function avgRate(s: Settings, emps: Employee[]): number {
  const o = Number(s.rate_override);
  if (o > 0) return o;
  const w = emps.map((e) => Number(e.wage)).filter((x) => x > 0);
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0;
}

export function dailySales(hs: StoreHour[], s: Settings): Record<number, number> {
  const total = hs.reduce((a, h) => a + Number(h.sales_pct), 0);
  return Object.fromEntries(hs.map((h) => [h.day, total > 0 ? (Number(s.weekly_sales) * Number(h.sales_pct)) / total : 0]));
}

export function dayBudget(sales: number, s: Settings, rate: number): { target: number; hours: number } {
  const target = (sales * Number(s.payroll_pct)) / 100;
  return { target, hours: rate > 0 ? target / rate : 0 };
}

const toMin = (t: string) => +t.split(':')[0] * 60 + +t.split(':')[1];

// Hours needed per day to fill every shift template completely (headcount x shift length).
export function requiredHours(tpls: ShiftTemplate[]): { hours: Record<number, number>; heads: Record<number, number> } {
  const hours: Record<number, number> = {};
  const heads: Record<number, number> = {};
  for (const t of tpls) {
    hours[t.day] = (hours[t.day] || 0) + Number(t.needed) * ((toMin(t.end) - toMin(t.start)) / 60);
    heads[t.day] = (heads[t.day] || 0) + Number(t.needed);
  }
  return { hours, heads };
}

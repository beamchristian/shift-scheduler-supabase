import { avgRate, dailySales, dayBudget, requiredHours } from "./matrix";
import { breakRule, clockHours, paidHours, type BreakRule } from "./hours";
import type { Employee, ScheduleRow, Snapshot } from "./types";

// "req" and "sched" are the hours the app's logic uses (scheduled shift hours by default).
// "reqAlt" and "schedAlt" are the other figure, shown for reference (paid hours, with the unpaid lunch deducted).
export interface DayRow {
  day: number;
  sales: number;
  target: number;
  allowed: number;
  req: number;
  reqAlt: number;
  sched: number;
  schedAlt: number;
  schedCost: number;
  schedCostAlt: number;
}
export interface EmpRow {
  emp: Employee;
  shifts: ScheduleRow[];
  hours: number;
  alt: number;
  closes: number;
}
export interface Report {
  rule: BreakRule;
  rate: number;
  days: DayRow[];
  heads: Record<number, number>;
  employees: EmpRow[];
  showAlt: boolean; // false when there is no unpaid lunch, so the two figures would be identical
  totals: {
    sales: number;
    target: number;
    allowed: number;
    req: number;
    reqAlt: number;
    reqCost: number;
    reqCostAlt: number;
    sched: number;
    schedAlt: number;
    schedCost: number;
    schedCostAlt: number;
  };
}

// The labor matrix and per-employee hours. Used by the screen and the PDF.
export function buildReport(snap: Snapshot): Report {
  const rule = breakRule(snap.settings);
  const rate = avgRate(snap.settings, snap.employees);
  const sales = dailySales(snap.store_hours, snap.settings);
  const need = requiredHours(snap.shift_templates, rule);
  const closeAt: Record<number, string> = Object.fromEntries(
    snap.store_hours.map((h) => [h.day, h.close]),
  );
  const pick = (shift: number, paid: number) =>
    rule.countPaid ? { main: paid, alt: shift } : { main: shift, alt: paid };

  const days: DayRow[] = snap.store_hours.map((h) => {
    const b = dayBudget(sales[h.day], snap.settings, rate);
    const rows = snap.schedule.filter((s) => s.day === h.day);
    const r = pick(need.shift[h.day] || 0, need.paid[h.day] || 0);
    const sc = pick(
      rows.reduce((a, s) => a + clockHours(s.start, s.end), 0),
      rows.reduce((a, s) => a + paidHours(s.start, s.end, rule), 0),
    );
    return {
      day: h.day,
      sales: sales[h.day],
      target: b.target,
      allowed: b.hours,
      req: r.main,
      reqAlt: r.alt,
      sched: sc.main,
      schedAlt: sc.alt,
      schedCost: sc.main * rate,
      schedCostAlt: sc.alt * rate,
    };
  });

  const employees: EmpRow[] = snap.employees.map((emp) => {
    const shifts = snap.schedule
      .filter((s) => s.employee_id === emp.id)
      .sort((a, b) => a.day - b.day);
    const e = pick(
      shifts.reduce((a, s) => a + clockHours(s.start, s.end), 0),
      shifts.reduce((a, s) => a + paidHours(s.start, s.end, rule), 0),
    );
    return {
      emp,
      shifts,
      hours: e.main,
      alt: e.alt,
      closes: shifts.filter((s) => !!closeAt[s.day] && s.end >= closeAt[s.day])
        .length,
    };
  });

  const sum = (f: (d: DayRow) => number) => days.reduce((a, d) => a + f(d), 0);
  const req = sum((d) => d.req);
  return {
    rule,
    rate,
    days,
    employees,
    heads: need.heads,
    showAlt: rule.minutes > 0 && rule.unpaid,
    totals: {
      sales: sum((d) => d.sales),
      target: sum((d) => d.target),
      allowed: sum((d) => d.allowed),
      req,
      reqAlt: sum((d) => d.reqAlt),
      reqCost: req * rate,
      reqCostAlt: sum((d) => d.reqAlt) * rate,
      sched: sum((d) => d.sched),
      schedAlt: sum((d) => d.schedAlt),
      schedCost: sum((d) => d.schedCost),
      schedCostAlt: sum((d) => d.schedCostAlt),
    },
  };
}

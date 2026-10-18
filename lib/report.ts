import { avgRate, dailySales, dayBudget, requiredHours } from "./matrix";
import { breakRule, clockHours, paidHours, type BreakRule } from "./hours";
import type { Employee, ScheduleRow, Snapshot } from "./types";

// One row of the labor matrix, for one day.
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

// One person's line in the report: their shifts and hours.
export interface EmpRow {
  emp: Employee;
  shifts: ScheduleRow[];
  hours: number;
  alt: number;
  closes: number;
}

// The full report used by the screen and the PDF.
export interface Report {
  rule: BreakRule;
  rate: number;
  days: DayRow[];
  heads: Record<number, number>;
  employees: EmpRow[];
  // False when there is no unpaid lunch, so the two figures would be identical.
  showAlt: boolean;
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

// Builds the labor matrix and each person's hours from one department's data. Used by the screen and the PDF.
export function buildReport(snapshot: Snapshot): Report {
  const breakSettings = breakRule(snapshot.settings);
  const hourlyRate = avgRate(snapshot.settings);
  const dailySalesByDay = dailySales(snapshot.store_hours, snapshot.settings);
  const requiredHoursTotals = requiredHours(snapshot.shift_templates, breakSettings);
  // Closing time for each day, keyed by day number.
  const closingTimeByDay: Record<number, string> = Object.fromEntries(
    snapshot.store_hours.map((storeHour) => [storeHour.day, storeHour.close]),
  );
  // Picks the main figure and the reference figure. The main one depends on the "count paid hours" setting.
  const pickMainAndReference = (shiftFigure: number, paidFigure: number) =>
    breakSettings.countPaid
      ? { main: paidFigure, alt: shiftFigure }
      : { main: shiftFigure, alt: paidFigure };

  // One row per day of the labor matrix.
  const days: DayRow[] = snapshot.store_hours.map((storeHour) => {
    const dayBudgetFigures = dayBudget(dailySalesByDay[storeHour.day], snapshot.settings, hourlyRate);
    const scheduledRowsForDay = snapshot.schedule.filter((scheduleRow) => scheduleRow.day === storeHour.day);
    const requiredFigures = pickMainAndReference(
      requiredHoursTotals.shift[storeHour.day] || 0,
      requiredHoursTotals.paid[storeHour.day] || 0,
    );
    const scheduledFigures = pickMainAndReference(
      scheduledRowsForDay.reduce((runningTotal, row) => runningTotal + clockHours(row.start, row.end), 0),
      scheduledRowsForDay.reduce((runningTotal, row) => runningTotal + paidHours(row.start, row.end, breakSettings), 0),
    );
    return {
      day: storeHour.day,
      sales: dailySalesByDay[storeHour.day],
      target: dayBudgetFigures.target,
      allowed: dayBudgetFigures.hours,
      req: requiredFigures.main,
      reqAlt: requiredFigures.alt,
      sched: scheduledFigures.main,
      schedAlt: scheduledFigures.alt,
      schedCost: scheduledFigures.main * hourlyRate,
      schedCostAlt: scheduledFigures.alt * hourlyRate,
    };
  });

  // One line per person: their shifts (in day order), hours, and closing shifts.
  const employees: EmpRow[] = snapshot.employees.map((employee) => {
    const shiftsForEmployee = snapshot.schedule
      .filter((scheduleRow) => scheduleRow.employee_id === employee.id)
      .sort((first, second) => first.day - second.day);
    const personFigures = pickMainAndReference(
      shiftsForEmployee.reduce((runningTotal, row) => runningTotal + clockHours(row.start, row.end), 0),
      shiftsForEmployee.reduce((runningTotal, row) => runningTotal + paidHours(row.start, row.end, breakSettings), 0),
    );
    return {
      emp: employee,
      shifts: shiftsForEmployee,
      hours: personFigures.main,
      alt: personFigures.alt,
      closes: shiftsForEmployee.filter(
        (row) => !!closingTimeByDay[row.day] && row.end >= closingTimeByDay[row.day],
      ).length,
    };
  });

  // Totals across the week. Cost is hours multiplied by the average hourly rate.
  const sumOverDays = (pickValue: (dayRow: DayRow) => number) =>
    days.reduce((runningTotal, dayRow) => runningTotal + pickValue(dayRow), 0);
  const requiredHoursTotal = sumOverDays((dayRow) => dayRow.req);
  return {
    rule: breakSettings,
    rate: hourlyRate,
    days,
    employees,
    heads: requiredHoursTotals.heads,
    showAlt: breakSettings.minutes > 0 && breakSettings.unpaid,
    totals: {
      sales: sumOverDays((dayRow) => dayRow.sales),
      target: sumOverDays((dayRow) => dayRow.target),
      allowed: sumOverDays((dayRow) => dayRow.allowed),
      req: requiredHoursTotal,
      reqAlt: sumOverDays((dayRow) => dayRow.reqAlt),
      reqCost: requiredHoursTotal * hourlyRate,
      reqCostAlt: sumOverDays((dayRow) => dayRow.reqAlt) * hourlyRate,
      sched: sumOverDays((dayRow) => dayRow.sched),
      schedAlt: sumOverDays((dayRow) => dayRow.schedAlt),
      schedCost: sumOverDays((dayRow) => dayRow.schedCost),
      schedCostAlt: sumOverDays((dayRow) => dayRow.schedCostAlt),
    },
  };
}

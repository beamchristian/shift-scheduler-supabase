import { avgRate, dailySales, dayBudget, requiredHours } from "./matrix";
import { breakRule, clockHours, paidHours, type BreakRule } from "./hours";
import { payrollHoursByDay } from "./payroll";
import { closingTimesByDay, isClosingTime } from "./rules";
import type { Employee, ScheduleRow, Snapshot, StoreHour } from "./types";
import { withWeekNumbers } from "./weeks";

// One row of the labor matrix, for one day.
// "req" and "sched" are the hours the app's logic uses (scheduled shift hours by default).
// "reqAlt" and "schedAlt" are the other figure, shown for reference (paid hours, with the unpaid lunch deducted).
// "sched" counts payroll hours: salaried people count their fixed hours and people billed elsewhere count 0
// (see lib/payroll.ts), so it can differ from the hours actually on the schedule.
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
// hours and alt are the hours they are scheduled; payrollHours is what they count for in payroll.
export interface EmpRow {
  emp: Employee;
  shifts: ScheduleRow[];
  hours: number;
  alt: number;
  payrollHours: number;
  closes: number;
}

// Adds up each person's hours per day and turns them into payroll hours (see lib/payroll.ts).
// hoursOfShift picks the figure to add up: shift hours or paid hours.
// Returns the payroll hours for each day, keyed by day number, across the whole team.
function payrollHoursPerDay(
  snapshot: Snapshot,
  hoursOfShift: (row: ScheduleRow) => number,
): Record<number, number> {
  const teamHoursByDay: Record<number, number> = {};
  for (const employee of snapshot.employees) {
    const workedHoursByDay: Record<number, number> = {};
    for (const row of snapshot.schedule)
      if (row.employee_id === employee.id)
        workedHoursByDay[row.day] = (workedHoursByDay[row.day] || 0) + hoursOfShift(row);
    for (const [day, hours] of Object.entries(payrollHoursByDay(employee, workedHoursByDay)))
      teamHoursByDay[+day] = (teamHoursByDay[+day] || 0) + hours;
  }
  return teamHoursByDay;
}

// The full report used by the screen and the PDF.
export interface Report {
  rule: BreakRule;
  rate: number;
  // The week's forecast and payroll target, as this report uses them.
  weeklySales: number;
  payrollPercent: number;
  // The day weights this report uses. A published week shows the weights it was published with.
  dayWeights: StoreHour[];
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
export function buildReport(departmentSnapshot: Snapshot): Report {
  // The week's own forecast, and for a published week its saved payroll %, rate and day weights.
  const snapshot = withWeekNumbers(departmentSnapshot);
  const breakSettings = breakRule(snapshot.settings);
  const hourlyRate = avgRate(snapshot.settings);
  const dailySalesByDay = dailySales(snapshot.store_hours, snapshot.settings);
  const requiredHoursTotals = requiredHours(
    snapshot.shift_templates,
    breakSettings,
  );
  // Closing time for each day: the time in Settings, or the latest end time among that day's shift templates.
  const closingTimes = closingTimesByDay(
    snapshot.shift_templates,
    snapshot.settings.closing_time,
  );
  // Picks the main figure and the reference figure. The main one depends on the "count paid hours" setting.
  const pickMainAndReference = (shiftFigure: number, paidFigure: number) =>
    breakSettings.countPaid
      ? { main: paidFigure, alt: shiftFigure }
      : { main: shiftFigure, alt: paidFigure };

  // Payroll hours per day, by shift hours and by paid hours.
  const shiftPayrollByDay = payrollHoursPerDay(snapshot, (row) => clockHours(row.start, row.end));
  const paidPayrollByDay = payrollHoursPerDay(snapshot, (row) =>
    paidHours(row.start, row.end, breakSettings),
  );

  // One row per day of the labor matrix.
  const days: DayRow[] = snapshot.store_hours.map((storeHour) => {
    const dayBudgetFigures = dayBudget(
      dailySalesByDay[storeHour.day],
      snapshot.settings,
      hourlyRate,
    );
    const requiredFigures = pickMainAndReference(
      requiredHoursTotals.shift[storeHour.day] || 0,
      requiredHoursTotals.paid[storeHour.day] || 0,
    );
    const scheduledFigures = pickMainAndReference(
      shiftPayrollByDay[storeHour.day] || 0,
      paidPayrollByDay[storeHour.day] || 0,
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
      shiftsForEmployee.reduce(
        (runningTotal, row) => runningTotal + clockHours(row.start, row.end),
        0,
      ),
      shiftsForEmployee.reduce(
        (runningTotal, row) =>
          runningTotal + paidHours(row.start, row.end, breakSettings),
        0,
      ),
    );
    const workedHoursByDay: Record<number, number> = {};
    for (const row of shiftsForEmployee)
      workedHoursByDay[row.day] =
        (workedHoursByDay[row.day] || 0) +
        (breakSettings.countPaid
          ? paidHours(row.start, row.end, breakSettings)
          : clockHours(row.start, row.end));
    return {
      emp: employee,
      shifts: shiftsForEmployee,
      hours: personFigures.main,
      alt: personFigures.alt,
      payrollHours: Object.values(payrollHoursByDay(employee, workedHoursByDay)).reduce(
        (runningTotal, hours) => runningTotal + hours,
        0,
      ),
      closes: shiftsForEmployee.filter((row) =>
        isClosingTime(closingTimes, row.day, row.end),
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
    weeklySales: Number(snapshot.settings.weekly_sales),
    payrollPercent: Number(snapshot.settings.payroll_pct),
    dayWeights: snapshot.store_hours,
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

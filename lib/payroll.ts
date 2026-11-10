// How each person's hours count toward the department's payroll, and who is in training.
// Used by the payroll report (labor matrix, PDF, store overview) and by the schedule generator.
import type { Employee } from "./types";

// How a person is paid, as far as this department's payroll is concerned.
// - hourly: the hours they are scheduled count (the default).
// - salaried: a fixed number of hours counts every week, whatever times they work.
// - elsewhere: they work here but another department or store management pays them, so nothing counts here.
export type PayrollType = "hourly" | "salaried" | "elsewhere";

// The weekly hours a salaried person counts for when none are set.
export const DEFAULT_SALARIED_HOURS = 40;

// The choices offered on the Team screen, in order, with the words shown for each.
export const PAYROLL_TYPE_LABELS: Record<PayrollType, string> = {
  hourly: "Hourly",
  salaried: "Salaried",
  elsewhere: "Billed elsewhere",
};

// The parts of a person this file reads.
type PayrollFields = Pick<Employee, "payroll_type" | "salaried_hours" | "in_training">;

// Reads a person's payroll type. Blank or unknown values (older rows and backups) mean hourly.
// Returns the payroll type.
export function payrollTypeOf(employee: PayrollFields): PayrollType {
  const savedType = String(employee.payroll_type ?? "").trim().toLowerCase();
  return savedType === "salaried" || savedType === "elsewhere" ? savedType : "hourly";
}

// Returns the weekly hours a salaried person counts for: their own number, or 40 when it is blank.
export function salariedHoursOf(employee: PayrollFields): number {
  const savedHours = employee.salaried_hours;
  if (savedHours === null || savedHours === undefined || String(savedHours).trim() === "")
    return DEFAULT_SALARIED_HOURS;
  const hours = Number(savedHours);
  return Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_SALARIED_HOURS;
}

// True when the person is in training: an extra pair of hands, never counted on to cover a shift.
export function isInTraining(employee: PayrollFields): boolean {
  return Number(employee.in_training) === 1;
}

// True when each hour this person is scheduled adds to this department's payroll (hourly people only).
// Salaried hours are already counted in full, and people billed elsewhere cost this department nothing.
export function shiftsAddToPayroll(employee: PayrollFields): boolean {
  return payrollTypeOf(employee) === "hourly";
}

// The hours a salaried person adds to the week whether or not they are scheduled, or 0 for anyone else.
export function fixedWeeklyHours(employee: PayrollFields): number {
  return payrollTypeOf(employee) === "salaried" ? salariedHoursOf(employee) : 0;
}

// Splits the hours a person counts for across the days of the week.
// workedHoursByDay holds the hours they are scheduled each day (any day missing means 0).
// Hourly people count what they work. Salaried people count their fixed hours, spread across their days in
// proportion to the hours they work each day, or evenly over Monday to Saturday when they are not scheduled.
// People billed elsewhere count 0 every day.
// Returns the counted hours keyed by day number (1 = Monday to 6 = Saturday).
export function payrollHoursByDay(
  employee: PayrollFields,
  workedHoursByDay: Record<number, number>,
): Record<number, number> {
  const payrollType = payrollTypeOf(employee);
  const countedHoursByDay: Record<number, number> = {};
  if (payrollType === "hourly") {
    for (const [day, hours] of Object.entries(workedHoursByDay)) countedHoursByDay[+day] = hours;
    return countedHoursByDay;
  }
  if (payrollType === "elsewhere") return countedHoursByDay;

  const weeklyHours = salariedHoursOf(employee);
  const workedTotal = Object.values(workedHoursByDay).reduce((runningTotal, hours) => runningTotal + hours, 0);
  for (let day = 1; day <= 6; day++)
    countedHoursByDay[day] =
      workedTotal > 0 ? (weeklyHours * (workedHoursByDay[day] || 0)) / workedTotal : weeklyHours / 6;
  return countedHoursByDay;
}

// A short note about how a person's hours count, for the schedule and PDF, or "" for an ordinary hourly person.
// Returns text such as "Salaried, counts 40 hrs", "Billed elsewhere" or "In training".
export function payrollNote(employee: PayrollFields): string {
  const notes: string[] = [];
  const payrollType = payrollTypeOf(employee);
  if (payrollType === "salaried") notes.push(`Salaried, counts ${salariedHoursOf(employee)} hrs`);
  if (payrollType === "elsewhere") notes.push("Billed elsewhere");
  if (isInTraining(employee)) notes.push("In training");
  return notes.join(" · ");
}

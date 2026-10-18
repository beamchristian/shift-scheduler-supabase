import { buildReport } from "./report";
import { availStatus, limitFor } from "./rules";
import type { ScheduleRow, ShiftTemplate, Snapshot } from "./types";

// What a manual change to one shift would cause.
// Errors stop the change (the times are unreadable, end before start, or the person would be in two places).
// Warnings do not stop it: they say what the change does to labor, hours, closings, and availability.
export interface ShiftEditCheck {
  errors: string[];
  warnings: string[];
}

// Times must be 24-hour "HH:MM".
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Full day names, indexed by day number (1 = Monday).
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Converts "HH:MM" into minutes since midnight, so times can be compared.
const minutesOfDay = (timeText: string): number => {
  const [hourText, minuteText] = timeText.split(":");
  return +hourText * 60 + +minuteText;
};

// Formats "HH:MM" as a 12-hour time, for example "6:30 AM".
const twelveHourTime = (timeText: string): string => {
  const [hourOf24, minuteOf60] = timeText.split(":").map(Number);
  return `${hourOf24 % 12 || 12}:${String(minuteOf60).padStart(2, "0")} ${hourOf24 >= 12 ? "PM" : "AM"}`;
};

// Hours with one decimal place, for messages.
const hoursText = (hours: number): string => hours.toFixed(1);

// Checks a proposed new start and end for one shift, without saving anything.
// The change is applied to a copy of the department's data, and the labor report is built before and after,
// so a warning only appears when the change makes a day, the week, or a person worse off.
export function checkShiftEdit(
  snapshot: Snapshot,
  shiftId: number,
  newStart: string,
  newEnd: string,
): ShiftEditCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  const shift = snapshot.schedule.find((scheduleRow) => scheduleRow.id === shiftId);
  if (!shift) return { errors: ["That shift was not found. Refresh the page and try again."], warnings };
  if (!TIME_PATTERN.test(newStart) || !TIME_PATTERN.test(newEnd))
    return { errors: ["Enter a start and an end time."], warnings };
  if (minutesOfDay(newEnd) <= minutesOfDay(newStart))
    errors.push("The end time must be after the start time.");

  const employee = snapshot.employees.find((person) => person.id === shift.employee_id);
  const personName = employee?.name ?? "This person";
  const dayName = DAY_NAMES[shift.day] ?? "this day";

  // A person can't work two shifts that overlap on the same day.
  const overlappingShift = snapshot.schedule.find(
    (otherShift) =>
      otherShift.id !== shiftId &&
      otherShift.employee_id === shift.employee_id &&
      otherShift.day === shift.day &&
      minutesOfDay(newStart) < minutesOfDay(otherShift.end) &&
      minutesOfDay(otherShift.start) < minutesOfDay(newEnd),
  );
  if (overlappingShift)
    errors.push(
      `${personName} already works ${overlappingShift.name} ${twelveHourTime(overlappingShift.start)} to ${twelveHourTime(overlappingShift.end)} on ${dayName}.`,
    );
  if (errors.length) return { errors, warnings };

  // The same data with only this shift changed.
  const changedShift: ScheduleRow = { ...shift, start: newStart, end: newEnd };
  const changedSnapshot: Snapshot = {
    ...snapshot,
    schedule: snapshot.schedule.map((scheduleRow) => (scheduleRow.id === shiftId ? changedShift : scheduleRow)),
  };
  const before = buildReport(snapshot);
  const after = buildReport(changedSnapshot);

  // Availability: the new times should fit the person's availability for the day.
  if (employee) {
    const availability = availStatus(employee, {
      day: shift.day,
      start: newStart,
      end: newEnd,
    } as ShiftTemplate);
    if (!availability.ok)
      warnings.push(
        `${personName} is not available on ${dayName} from ${twelveHourTime(newStart)} to ${twelveHourTime(newEnd)}.`,
      );
  }

  // Labor for the day, and for the week, when the change pushes it over budget.
  const dayBefore = before.days.find((dayRow) => dayRow.day === shift.day);
  const dayAfter = after.days.find((dayRow) => dayRow.day === shift.day);
  if (dayAfter && dayAfter.sched > dayAfter.allowed && dayAfter.sched > (dayBefore?.sched ?? 0))
    warnings.push(
      `${dayName} labor goes over budget: ${hoursText(dayAfter.sched)} scheduled hours against ${hoursText(dayAfter.allowed)} allowed.`,
    );
  if (after.totals.sched > after.totals.allowed && after.totals.sched > before.totals.sched)
    warnings.push(
      `The week goes over labor budget: ${hoursText(after.totals.sched)} scheduled hours against ${hoursText(after.totals.allowed)} allowed.`,
    );

  // The person's hours and closing shifts, compared with their limits.
  if (employee) {
    const personBefore = before.employees.find((row) => row.emp.id === employee.id);
    const personAfter = after.employees.find((row) => row.emp.id === employee.id);
    if (personBefore && personAfter) {
      const maxHours = Number(employee.max_hours);
      const minHours = Number(employee.min_hours);
      const closeLimit = limitFor(employee, snapshot.settings.max_closes);
      if (maxHours > 0 && personAfter.hours > maxHours && personAfter.hours > personBefore.hours)
        warnings.push(
          `${personName} would be at ${hoursText(personAfter.hours)} hours, over their maximum of ${maxHours}.`,
        );
      if (minHours > 0 && personAfter.hours < minHours && personAfter.hours < personBefore.hours)
        warnings.push(
          `${personName} would be at ${hoursText(personAfter.hours)} hours, under their minimum of ${minHours}.`,
        );
      if (personAfter.closes > closeLimit && personAfter.closes > personBefore.closes)
        warnings.push(
          `${personName} would work ${personAfter.closes} closing shifts, over their limit of ${closeLimit}.`,
        );
    }
  }

  return { errors, warnings };
}

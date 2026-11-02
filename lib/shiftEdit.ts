import { buildReport, type Report } from "./report";
import { allowedFor, availStatus, lacksSkill, limitFor, maxDaysFor, shiftKindFinder, type ShiftKind } from "./rules";
import type { Employee, ScheduleRow, ShiftTemplate, Snapshot } from "./types";

// What a manual change to one shift would cause.
// Errors stop the change (the times are unreadable, end before start, or the person would be in two places).
// Warnings do not stop it: they say what the change does to labor, hours, closings, and availability.
// renamedTo is the shift's new name when the new times change it between opening, closing and other.
export interface ShiftEditCheck {
  errors: string[];
  warnings: string[];
  renamedTo?: string;
}

// Times must be 24-hour "HH:MM".
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Full day names, indexed by day number (1 = Monday).
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The word in a shift name that says it opens or closes, such as "Open", "Opener", "Close" or "Closer".
const ROLE_WORD_PATTERN = /\b(open(?:er|ing)?|clos(?:e|er|ing))\b/i;

// The word a renamed shift gets for each kind. "other" has no word of its own unless the name is left empty.
const ROLE_WORDS: Record<ShiftKind, string> = { open: "Opener", close: "Closer", other: "Mid" };

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

// Gives a shift name the word for its new kind. "Subshop Open" becomes "Subshop Closer", "Closer" becomes "Opener".
// A name without an open or close word gets the word added ("Production" becomes "Production Closer").
// For "other", the open or close word is taken out, and an empty name becomes "Mid".
// Returns the new name.
export function nameForKind(shiftName: string, newKind: ShiftKind): string {
  const hasRoleWord = ROLE_WORD_PATTERN.test(shiftName);
  if (newKind === "other") {
    const nameWithoutRole = shiftName.replace(ROLE_WORD_PATTERN, "").replace(/\s+/g, " ").trim();
    return nameWithoutRole || ROLE_WORDS.other;
  }
  if (hasRoleWord) return shiftName.replace(ROLE_WORD_PATTERN, ROLE_WORDS[newKind]);
  return `${shiftName} ${ROLE_WORDS[newKind]}`.trim();
}

// The name a shift should have after its times change: a new name when the times move it between
// opening, closing and other, or its current name when its kind stays the same.
export function nameAfterEdit(snapshot: Snapshot, shift: ScheduleRow, newStart: string, newEnd: string): string {
  const kindOf = shiftKindFinder(snapshot.shift_templates, snapshot.settings.closing_time);
  const kindBefore = kindOf(shift);
  const kindAfter = kindOf({ ...shift, start: newStart, end: newEnd });
  return kindBefore === kindAfter ? shift.name : nameForKind(shift.name, kindAfter);
}

// Warnings about one person's week after a change: hours over their max or under their min, days over their
// max, and closes over their limit. A warning only appears when the change makes it worse than before.
// Returns the warnings, or an empty list.
function personWeekWarnings(snapshot: Snapshot, before: Report, after: Report, employee: Employee): string[] {
  const warnings: string[] = [];
  const personBefore = before.employees.find((row) => row.emp.id === employee.id);
  const personAfter = after.employees.find((row) => row.emp.id === employee.id);
  if (!personBefore || !personAfter) return warnings;
  const maxHours = Number(employee.max_hours);
  const minHours = Number(employee.min_hours);
  const closeLimit = limitFor(employee, snapshot.settings.max_closes);
  if (maxHours > 0 && personAfter.hours > maxHours && personAfter.hours > personBefore.hours)
    warnings.push(`${employee.name} would be at ${hoursText(personAfter.hours)} hours, over their maximum of ${maxHours}.`);
  if (minHours > 0 && personAfter.hours < minHours && personAfter.hours < personBefore.hours)
    warnings.push(`${employee.name} would be at ${hoursText(personAfter.hours)} hours, under their minimum of ${minHours}.`);
  // Days worked: the number of different days the person has a shift on.
  const daysBefore = new Set(personBefore.shifts.map((row) => row.day)).size;
  const daysAfter = new Set(personAfter.shifts.map((row) => row.day)).size;
  const maxDays = maxDaysFor(employee);
  if (daysAfter > maxDays && daysAfter > daysBefore)
    warnings.push(`${employee.name} would work ${daysAfter} days, over their max of ${maxDays}.`);
  if (personAfter.closes > closeLimit && personAfter.closes > personBefore.closes)
    warnings.push(
      closeLimit === 0
        ? `${employee.name} has max closes set to 0, so they never close, but would work ${personAfter.closes} closing shifts.`
        : `${employee.name} would work ${personAfter.closes} closing shifts, over their limit of ${closeLimit}.`,
    );
  return warnings;
}

// Warns when a person is not available for a shift's times on its day. Returns the warning, or null.
function availabilityWarning(employee: Employee, shift: Pick<ScheduleRow, "day" | "start" | "end">): string | null {
  const availability = availStatus(employee, { day: shift.day, start: shift.start, end: shift.end } as ShiftTemplate);
  if (availability.ok) return null;
  return `${employee.name} is not available on ${DAY_NAMES[shift.day] ?? "this day"} from ${twelveHourTime(shift.start)} to ${twelveHourTime(shift.end)}.`;
}

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

  // The same data with only this shift changed, including its new name if the times change its kind.
  const renamedTo = nameAfterEdit(snapshot, shift, newStart, newEnd);
  const changedShift: ScheduleRow = { ...shift, start: newStart, end: newEnd, name: renamedTo };
  const changedSnapshot: Snapshot = {
    ...snapshot,
    schedule: snapshot.schedule.map((scheduleRow) => (scheduleRow.id === shiftId ? changedShift : scheduleRow)),
  };
  const before = buildReport(snapshot);
  const after = buildReport(changedSnapshot);

  // Availability: the new times should fit the person's availability for the day.
  if (employee) {
    const availabilityText = availabilityWarning(employee, changedShift);
    if (availabilityText) warnings.push(availabilityText);
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
  if (employee) warnings.push(...personWeekWarnings(snapshot, before, after, employee));

  return { errors, warnings, renamedTo: renamedTo !== shift.name ? renamedTo : undefined };
}

// A swap or hand-over that passed its checks: the schedule rows to save, each with its new person.
export interface ShiftSwapCheck extends ShiftEditCheck {
  changedRows: { id: number; employee_id: number }[];
  // A short description for the change log, for example "Kathleen's Closer and Matthew's Opener on Monday".
  description: string;
}

// Checks swapping one shift with another person's shift on the same day (otherShiftId),
// or giving it to someone who is not working that day (newEmployeeId), without saving anything.
// Errors stop the swap. Warnings cover availability, "only these people", skills, hours and closing limits.
export function checkShiftSwap(
  snapshot: Snapshot,
  shiftId: number,
  otherShiftId: number | null,
  newEmployeeId: number | null,
): ShiftSwapCheck {
  const failed = (message: string): ShiftSwapCheck => ({
    errors: [message],
    warnings: [],
    changedRows: [],
    description: "",
  });
  const shift = snapshot.schedule.find((scheduleRow) => scheduleRow.id === shiftId);
  if (!shift) return failed("That shift was not found. Refresh the page and try again.");
  const employeeById = new Map(snapshot.employees.map((person) => [person.id, person]));
  const holder = employeeById.get(shift.employee_id);
  const holderName = holder?.name ?? "Unknown";
  const dayName = DAY_NAMES[shift.day] ?? "this day";

  // The rows that change, each with the person who will work it.
  let changedRows: { id: number; employee_id: number }[];
  let description: string;
  if (otherShiftId != null) {
    const otherShift = snapshot.schedule.find((scheduleRow) => scheduleRow.id === otherShiftId);
    if (!otherShift || otherShift.day !== shift.day)
      return failed("Pick another shift on the same day to swap with.");
    if (otherShift.employee_id === shift.employee_id) return failed("Both shifts belong to the same person.");
    changedRows = [
      { id: shift.id, employee_id: otherShift.employee_id },
      { id: otherShift.id, employee_id: shift.employee_id },
    ];
    description = `${holderName}'s ${shift.name} and ${employeeById.get(otherShift.employee_id)?.name ?? "Unknown"}'s ${otherShift.name} on ${dayName}`;
  } else if (newEmployeeId != null) {
    const newPerson = employeeById.get(newEmployeeId);
    if (!newPerson) return failed("That person was not found. Refresh the page and try again.");
    if (newPerson.id === shift.employee_id) return failed(`${holderName} already works this shift.`);
    if (snapshot.schedule.some((row) => row.employee_id === newPerson.id && row.day === shift.day))
      return failed(`${newPerson.name} already works on ${dayName}. Swap with their shift instead.`);
    changedRows = [{ id: shift.id, employee_id: newPerson.id }];
    description = `${holderName}'s ${shift.name} on ${dayName} given to ${newPerson.name}`;
  } else return failed("Pick a shift to swap with, or a person to give it to.");

  const changedSnapshot: Snapshot = {
    ...snapshot,
    schedule: snapshot.schedule.map((scheduleRow) => {
      const change = changedRows.find((changedRow) => changedRow.id === scheduleRow.id);
      return change ? { ...scheduleRow, employee_id: change.employee_id } : scheduleRow;
    }),
  };
  const before = buildReport(snapshot);
  const after = buildReport(changedSnapshot);
  const templateById = new Map(snapshot.shift_templates.map((template) => [template.id, template]));

  // For each person taking a new shift: availability, the template's rules, then their week as a whole.
  const warnings: string[] = [];
  for (const changedRow of changedRows) {
    const person = employeeById.get(changedRow.employee_id);
    const row = snapshot.schedule.find((scheduleRow) => scheduleRow.id === changedRow.id);
    if (!person || !row) continue;
    const availabilityText = availabilityWarning(person, row);
    if (availabilityText) warnings.push(availabilityText);
    const template = templateById.get(row.template_id);
    if (template && lacksSkill(person, template))
      warnings.push(`${person.name} isn't tagged with the "${template.skill}" skill that ${row.name} needs.`);
    else if (template && !allowedFor(person, template))
      warnings.push(`${row.name} on ${dayName} is limited to other people or shift types, so ${person.name} isn't normally scheduled on it.`);
  }
  for (const employeeId of new Set([shift.employee_id, ...changedRows.map((row) => row.employee_id)])) {
    const person = employeeById.get(employeeId);
    if (person) warnings.push(...personWeekWarnings(snapshot, before, after, person));
  }
  return { errors: [], warnings, changedRows, description };
}

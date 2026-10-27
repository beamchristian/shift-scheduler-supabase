import { t12 } from "./hours";
import {
  availStatus,
  lacksSkill,
  minutesOfDay,
  norm,
  parseWindow,
} from "./rules";
import type { Employee, ShiftTemplate } from "./types";

// Explains in plain words why the schedule could not fill a shift: who could have worked it,
// and what stopped each of them (availability, already working that day, max hours, and so on).

// Full day names, indexed by day number (1 = Monday).
const DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// The most people named one by one. The rest are counted, so the message stays readable.
const MAX_PEOPLE_LISTED = 4;

// Allows for tiny rounding errors when comparing hours.
const HOURS_TOLERANCE = 1e-9;

// One person's situation at the moment a shift was left open:
// the hours they already work this week, and the shift they already work that day (null when free that day).
export interface PersonForShift {
  employee: Employee;
  hoursThisWeek: number;
  shiftOnSameDay: { name: string; start: string; end: string } | null;
}

// Formats minutes since midnight as a 12-hour time, for example "6:30 AM".
const formatMinutes = (minutesSinceMidnight: number): string =>
  t12(
    `${Math.floor(minutesSinceMidnight / 60)}:${String(minutesSinceMidnight % 60).padStart(2, "0")}`,
  );

// Hours with at most one decimal place, for example "9.5" or "40".
const formatHours = (hours: number): string => String(+hours.toFixed(1));

// Joins names for a sentence, for example "Alma", "Alma and Oscar", or "Alma, Oscar and Gerad".
const joinNames = (names: string[]): string =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// Describes why a person's availability rules them out of a shift, or returns null when it does not.
// Unreadable availability text is treated as "any time" by the scheduler, so it never rules anyone out here.
function availabilityProblem(
  employee: Employee,
  shiftTemplate: ShiftTemplate,
): string | null {
  if (availStatus(employee, shiftTemplate).ok) return null;
  const dayName = DAY_NAMES[shiftTemplate.day] ?? "that day";
  const availabilityText = String(
    (employee as unknown as Record<string, string | null>)[
      "avail_" + shiftTemplate.day
    ] ?? "",
  )
    .trim()
    .toLowerCase();
  if (availabilityText === "off")
    return `${employee.name} is off on ${dayName}`;

  const availableWindow = parseWindow(availabilityText);
  if (!availableWindow) return null;
  const [availableFrom, availableUntil] = availableWindow;
  const startsTooEarly = minutesOfDay(shiftTemplate.start) < availableFrom;
  const endsTooLate = minutesOfDay(shiftTemplate.end) > availableUntil;
  if (startsTooEarly && !endsTooLate)
    return `${employee.name} is available from ${formatMinutes(availableFrom)} on ${dayName}, but the shift starts at ${t12(shiftTemplate.start)}`;
  if (endsTooLate && !startsTooEarly)
    return `${employee.name} is available until ${formatMinutes(availableUntil)} on ${dayName}, but the shift ends at ${t12(shiftTemplate.end)}`;
  return `${employee.name} is only available ${formatMinutes(availableFrom)} to ${formatMinutes(availableUntil)} on ${dayName}`;
}

// True when nothing about the person themselves stops them taking the shift: their shift types allow it,
// they are available, they are free that day, they have the skill, and the hours fit under their max.
// "Only these people" is not checked, so this finds who could step in if that list were changed.
function couldTakeShift(
  person: PersonForShift,
  shiftTemplate: ShiftTemplate,
  shiftHours: number,
): boolean {
  const allowedShiftNames = norm(person.employee.shifts);
  const maxHoursValue = person.employee.max_hours as number | string | null;
  return (
    (!allowedShiftNames.length ||
      allowedShiftNames.includes(shiftTemplate.name.toLowerCase().trim())) &&
    availStatus(person.employee, shiftTemplate).ok &&
    !person.shiftOnSameDay &&
    !lacksSkill(person.employee, shiftTemplate) &&
    maxHoursValue !== null &&
    String(maxHoursValue).trim() !== "" &&
    person.hoursThisWeek + shiftHours <= Number(maxHoursValue) + HOURS_TOLERANCE
  );
}

// For a shift limited to certain people, names anyone outside that list who could take it right now.
// Returns a sentence such as " Oscar and Kathleen could work it if added to Only these people.", or "".
function outsideRestrictionNote(
  shiftTemplate: ShiftTemplate,
  people: PersonForShift[],
  namedPeople: string[],
  shiftHours: number,
): string {
  const peopleWhoFit = people
    .filter(
      (person) =>
        !namedPeople.includes(person.employee.name.toLowerCase().trim()),
    )
    .filter((person) => couldTakeShift(person, shiftTemplate, shiftHours))
    .map((person) => person.employee.name);
  if (!peopleWhoFit.length) return "";
  return ` ${joinNames(peopleWhoFit)} could work it if added to "Only these people" on the Shifts screen, or if that list is cleared.`;
}

// Describes the first thing that stops one person from taking a shift, checked in the order the scheduler applies them.
// Returns a short clause such as "Oscar already works Closer (11:00 AM to 8:00 PM) that day".
function personProblem(
  person: PersonForShift,
  shiftTemplate: ShiftTemplate,
  shiftHours: number,
): string {
  const { employee } = person;

  const allowedShiftNames = norm(employee.shifts);
  if (
    allowedShiftNames.length &&
    !allowedShiftNames.includes(shiftTemplate.name.toLowerCase().trim())
  )
    return `${employee.name} is limited to ${employee.shifts} shifts`;

  const availabilityText = availabilityProblem(employee, shiftTemplate);
  if (availabilityText) return availabilityText;

  if (person.shiftOnSameDay)
    return `${employee.name} already works ${person.shiftOnSameDay.name} (${t12(person.shiftOnSameDay.start)} to ${t12(person.shiftOnSameDay.end)}) that day`;

  // A blank max counts as zero hours, so the person can never be given a shift. Saying so makes that visible.
  const maxHoursValue = employee.max_hours as number | string | null;
  if (maxHoursValue === null || String(maxHoursValue).trim() === "")
    return `${employee.name} has no max hours set on the Team screen, so they can't be given shifts`;
  const maxHours = Number(maxHoursValue);
  if (person.hoursThisWeek + shiftHours > maxHours + HOURS_TOLERANCE)
    return `${employee.name} already has ${formatHours(person.hoursThisWeek)} of their ${formatHours(maxHours)} max hours, and this shift adds ${formatHours(shiftHours)}`;

  // Nothing rules them out on their own. The scheduler could not move other shifts around to free them up.
  return `${employee.name} is free, but every way of fitting them in left another shift uncovered`;
}

// Explains why a shift could not be filled. Returns one or two sentences, for example:
// "Only Matthew can work it: Matthew is available from 9:30 AM on Saturday, but the shift starts at 6:00 AM."
// people: every person on the team, with their hours and shifts as the schedule stands.
// shiftHours: the shift's length in the hours the scheduler counts (shift hours or paid hours).
export function explainUnfilledShift(
  shiftTemplate: ShiftTemplate,
  people: PersonForShift[],
  shiftHours: number,
): string {
  // "Only these people" and the required skill decide who could ever work the shift.
  const namedPeople = norm(shiftTemplate.only_for);
  const requiredSkill = String(shiftTemplate.skill ?? "").trim();
  let eligiblePeople = people;

  // People outside "Only these people" who could step in. Blank when the shift is open to anyone.
  const restrictionNote = namedPeople.length
    ? outsideRestrictionNote(shiftTemplate, people, namedPeople, shiftHours)
    : "";

  if (namedPeople.length) {
    eligiblePeople = people.filter((person) =>
      namedPeople.includes(person.employee.name.toLowerCase().trim()),
    );
    if (!eligiblePeople.length)
      return `It is limited to ${shiftTemplate.only_for}, but no employee has that name.${restrictionNote}`;
  }

  if (requiredSkill) {
    const peopleWithSkill = eligiblePeople.filter(
      (person) => !lacksSkill(person.employee, shiftTemplate),
    );
    if (!peopleWithSkill.length)
      return namedPeople.length
        ? `It is limited to ${joinNames(eligiblePeople.map((person) => person.employee.name))}, but nobody there is tagged with the "${requiredSkill}" skill it needs.${restrictionNote}`
        : `Nobody is tagged with the "${requiredSkill}" skill it needs.`;
    eligiblePeople = peopleWithSkill;
  }

  const eligibleNames = eligiblePeople.map((person) => person.employee.name);
  const opening = namedPeople.length
    ? `Only ${joinNames(eligibleNames)} can work it`
    : requiredSkill
      ? `It needs the "${requiredSkill}" skill, which ${joinNames(eligibleNames)} ${eligibleNames.length === 1 ? "has" : "have"}`
      : "Nobody could take it";

  const problems = eligiblePeople.map((person) =>
    personProblem(person, shiftTemplate, shiftHours),
  );
  const listedProblems = problems.slice(0, MAX_PEOPLE_LISTED);
  const unlistedCount = problems.length - listedProblems.length;
  const unlistedNote =
    unlistedCount > 0 ? `; and ${unlistedCount} more can't take it either` : "";
  return `${opening}: ${listedProblems.join("; ")}${unlistedNote}.${restrictionNote}`;
}

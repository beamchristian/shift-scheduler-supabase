import type { Employee, ShiftTemplate } from "./types";

// Scheduling rules shared by the generator and the swap button.

// Converts "HH:MM" into minutes since midnight.
export const minutesOfDay = (timeText: string): number => {
  const [hourText, minuteText] = timeText.split(":");
  return +hourText * 60 + +minuteText;
};

// Matches a time window such as "6am-2pm", "6:30a-4p" or "06:00-14:00".
const TIME_WINDOW_PATTERN =
  /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/;

// Turns an hour, minute and am/pm marker into minutes since midnight.
const toTwentyFourHourMinutes = (
  hourValue: number,
  minuteValue: number,
  meridiemText?: string,
): number => {
  let hourOf24 = hourValue;
  if (meridiemText?.startsWith("p") && hourValue < 12) hourOf24 += 12;
  if (meridiemText?.startsWith("a") && hourValue === 12) hourOf24 = 0;
  return hourOf24 * 60 + minuteValue;
};

// Reads a time window into [start, end] in minutes since midnight. Returns null if the text is not a window.
// When only the end has am/pm, the start is worked out so it comes before the end.
export const parseWindow = (windowText: string): [number, number] | null => {
  const match = windowText.match(TIME_WINDOW_PATTERN);
  if (!match) return null;
  const endMinutes = toTwentyFourHourMinutes(
    +match[4],
    +(match[5] || 0),
    match[6],
  );
  let startMinutes = toTwentyFourHourMinutes(
    +match[1],
    +(match[2] || 0),
    match[3],
  );
  if (!match[3] && match[6]) {
    const startWithEndMeridiem = toTwentyFourHourMinutes(
      +match[1],
      +(match[2] || 0),
      match[6],
    );
    const startWithOppositeMeridiem = toTwentyFourHourMinutes(
      +match[1],
      +(match[2] || 0),
      match[6].startsWith("p") ? "a" : "p",
    );
    startMinutes =
      startWithEndMeridiem < endMinutes
        ? startWithEndMeridiem
        : startWithOppositeMeridiem;
  }
  return [startMinutes, endMinutes];
};

// Matches a time saved as "HH:MM", for example "19:00".
const SAVED_TIME_PATTERN = /^\d{1,2}:\d{2}/;

// The closing time for each day, as "HH:MM". A shift that ends at or after it is a closing shift.
// departmentClosingTime is the Closing time from Settings. When it is set, every day uses it.
// When it is blank, each day uses the latest end time of its shift templates. Days with no templates are left out.
export function closingTimesByDay(
  shiftTemplates: Pick<ShiftTemplate, "day" | "end">[],
  departmentClosingTime?: string | null,
): Record<number, string> {
  const closingTimes: Record<number, string> = {};
  const settingTime = String(departmentClosingTime ?? "").trim();
  const hasSettingTime = SAVED_TIME_PATTERN.test(settingTime);
  for (const shiftTemplate of shiftTemplates) {
    const latestSoFar = closingTimes[shiftTemplate.day];
    if (hasSettingTime) closingTimes[shiftTemplate.day] = settingTime;
    else if (!latestSoFar || minutesOfDay(shiftTemplate.end) > minutesOfDay(latestSoFar))
      closingTimes[shiftTemplate.day] = shiftTemplate.end;
  }
  return closingTimes;
}

// The kind of a scheduled shift, which sets its color on the schedule and the PDF.
export type ShiftKind = "open" | "close" | "other";

// Builds a function that tells whether a scheduled shift is an opening, closing or other shift.
// It goes by the shift's times, so a shift edited by hand changes kind with its new times:
// - A shift that ends at or after closing time is a close, whatever its name.
// - A shift with "open" in its name is an opener.
// - A shift named as a close that no longer runs to closing time is an opener when it starts no later than
//   that day's latest opening template, and other when it starts later.
export function shiftKindFinder(
  shiftTemplates: Pick<ShiftTemplate, "day" | "start" | "end" | "name">[],
  departmentClosingTime?: string | null,
): (shift: { day: number; start: string; end: string; name: string }) => ShiftKind {
  const closingTimes = closingTimesByDay(shiftTemplates, departmentClosingTime);
  // The latest start, in minutes, among each day's templates with "open" in their name.
  const latestOpenerStartByDay: Record<number, number> = {};
  for (const shiftTemplate of shiftTemplates)
    if (shiftTemplate.name.toLowerCase().includes("open"))
      latestOpenerStartByDay[shiftTemplate.day] = Math.max(
        latestOpenerStartByDay[shiftTemplate.day] ?? -1,
        minutesOfDay(shiftTemplate.start),
      );
  return (shift) => {
    if (isClosingTime(closingTimes, shift.day, shift.end)) return "close";
    const lowerCaseName = shift.name.toLowerCase();
    if (lowerCaseName.includes("open")) return "open";
    const latestOpenerStart = latestOpenerStartByDay[shift.day];
    if (
      lowerCaseName.includes("clos") &&
      latestOpenerStart !== undefined &&
      minutesOfDay(shift.start) <= latestOpenerStart
    )
      return "open";
    return "other";
  };
}

// True when a shift ends at or after its day's closing time.
export function isClosingTime(
  closingTimes: Record<number, string>,
  day: number,
  endTime: string,
): boolean {
  const closingTime = closingTimes[day];
  return !!closingTime && minutesOfDay(endTime) >= minutesOfDay(closingTime);
}

// Splits a comma-separated list into lower-case, trimmed items. Blank items are dropped.
export const norm = (listText: string | null | undefined) =>
  String(listText ?? "")
    .toLowerCase()
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// Whether a person can work a shift on its day, based on their availability for that day.
// Blank means any time, "off" means not available, and a window such as "6am-2pm" means the whole shift must fit inside it.
// `bad` holds the text when it could not be read as a window.
export function availStatus(
  employee: Employee,
  shiftTemplate: ShiftTemplate,
): { ok: boolean; bad?: string } {
  const availabilityText = String(
    (employee as unknown as Record<string, string | null>)[
      "avail_" + shiftTemplate.day
    ] ?? "",
  )
    .trim()
    .toLowerCase();
  if (!availabilityText) return { ok: true };
  if (availabilityText === "off") return { ok: false };
  const window = parseWindow(availabilityText);
  if (!window) return { ok: true, bad: availabilityText };
  return {
    ok:
      minutesOfDay(shiftTemplate.start) >= window[0] &&
      minutesOfDay(shiftTemplate.end) <= window[1],
  };
}

// Hard rules for a person and a shift. Returns true only when every rule allows it:
// the shift may name certain people, a person may be limited to certain shift types, and a required skill must be held.
export function allowedFor(
  employee: Employee,
  shiftTemplate: ShiftTemplate,
): boolean {
  const namedPeopleForShift = norm(shiftTemplate.only_for);
  if (
    namedPeopleForShift.length &&
    !namedPeopleForShift.includes(employee.name.toLowerCase().trim())
  )
    return false;
  const shiftTypesForPerson = norm(employee.shifts);
  if (
    shiftTypesForPerson.length &&
    !shiftTypesForPerson.includes(shiftTemplate.name.toLowerCase().trim())
  )
    return false;
  return !lacksSkill(employee, shiftTemplate);
}

// The weekly closing limit for a person: their own number, or the department default when theirs is blank.
// A person's own 0 means they never close, and returns 0. A blank or 0 department default means no limit.
// Returns Infinity when there is no limit.
export function limitFor(
  employee: Pick<Employee, "max_closes">,
  defaultLimit: number | string | null | undefined,
): number {
  const ownLimit = employee.max_closes;
  if (ownLimit != null && String(ownLimit).trim() !== "" && Number.isFinite(Number(ownLimit)))
    return Math.max(0, Number(ownLimit));
  const departmentLimit = Number(defaultLimit ?? 0);
  return departmentLimit > 0 ? departmentLimit : Infinity;
}

// The most days a person may work in a week. Blank (or unreadable) means no limit, and returns Infinity.
export function maxDaysFor(employee: Pick<Employee, "max_days">): number {
  const ownLimit = employee.max_days;
  if (ownLimit == null || String(ownLimit).trim() === "" || !Number.isFinite(Number(ownLimit)))
    return Infinity;
  return Math.max(0, Number(ownLimit));
}

// True when a shift needs a skill that the person is not tagged with.
export function lacksSkill(
  employee: Employee,
  shiftTemplate: ShiftTemplate,
): boolean {
  const requiredSkill = String(shiftTemplate.skill ?? "")
    .toLowerCase()
    .trim();
  return !!requiredSkill && !norm(employee.skills).includes(requiredSkill);
}

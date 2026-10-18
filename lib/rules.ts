import type { Employee, ShiftTemplate } from "./types";

// Scheduling rules shared by the generator and the swap button.

// Converts "HH:MM" into minutes since midnight.
const minutesOfDay = (timeText: string): number => {
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

// The weekly closing limit for a person: their own number, or the department default.
// Returns Infinity when there is no limit.
export function limitFor(
  employee: Employee,
  defaultLimit: number | string | null | undefined,
): number {
  const ownLimit = employee.max_closes;
  const limitValue =
    ownLimit == null || String(ownLimit).trim() === ""
      ? Number(defaultLimit ?? 0)
      : Number(ownLimit);
  return limitValue > 0 ? limitValue : Infinity;
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

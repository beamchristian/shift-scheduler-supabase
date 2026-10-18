import type { Settings } from "./types";

// The lunch break rule for a shift. A shift longer than `after` hours gets a break of `minutes`.
// That break is unpaid when `unpaid` is true.
// By default, scheduling logic uses scheduled shift hours and paid hours are only shown for reference.
// When `countPaid` is true, scheduling logic uses paid hours instead.
export interface BreakRule {
  minutes: number;
  after: number;
  unpaid: boolean;
  countPaid: boolean;
}

// Reads a setting as a number. Uses the fallback when the setting is blank or missing.
const readNumberSetting = (settingValue: unknown, fallbackValue: number): number =>
  settingValue === null || settingValue === undefined || String(settingValue).trim() === ""
    ? fallbackValue
    : Number(settingValue);

// Builds the break rule from the department's settings.
// Missing values fall back to a 30-minute unpaid break after 5 hours, with shift hours used for logic.
export function breakRule(
  settings: Partial<Pick<Settings, "break_minutes" | "break_after" | "breaks_unpaid" | "count_paid_hours">>,
): BreakRule {
  return {
    minutes: Math.max(0, readNumberSetting(settings.break_minutes, 30)),
    after: readNumberSetting(settings.break_after, 5),
    unpaid: readNumberSetting(settings.breaks_unpaid, 1) !== 0,
    countPaid: readNumberSetting(settings.count_paid_hours, 0) !== 0,
  };
}

// Converts a "HH:MM" time into minutes since midnight.
const toMinutesSinceMidnight = (timeText: string): number =>
  +timeText.split(":")[0] * 60 + +timeText.split(":")[1];

// Clock length of a shift in hours, before any break is taken out.
export const clockHours = (startTime: string, endTime: string) =>
  (toMinutesSinceMidnight(endTime) - toMinutesSinceMidnight(startTime)) / 60;

// True when a shift is long enough to earn the break.
export const hasBreak = (startTime: string, endTime: string, breakSettings: BreakRule) =>
  breakSettings.minutes > 0 && clockHours(startTime, endTime) > breakSettings.after;

// Hours that count for pay and for min/max hours.
// That is the clock length minus the unpaid break, when the shift earns one.
export const paidHours = (startTime: string, endTime: string, breakSettings: BreakRule) =>
  breakSettings.unpaid && hasBreak(startTime, endTime, breakSettings)
    ? Math.max(0, clockHours(startTime, endTime) - breakSettings.minutes / 60)
    : clockHours(startTime, endTime);

// The hours all scheduling logic uses: shift hours by default, or paid hours when the setting says so.
export const logicHours = (startTime: string, endTime: string, breakSettings: BreakRule) =>
  breakSettings.countPaid
    ? paidHours(startTime, endTime, breakSettings)
    : clockHours(startTime, endTime);

// Formats a "HH:MM" time for people to read, in 12-hour form.
// Examples: "6:30 AM", or the short form "6:30a". The short form drops ":00" and uses "a" or "p".
export const t12 = (timeText: string, useShortForm = false) => {
  const [hourOf24, minuteOf60] = timeText.split(":").map(Number);
  const hourOf12 = hourOf24 % 12 || 12;
  const minuteText = minuteOf60
    ? ":" + String(minuteOf60).padStart(2, "0")
    : useShortForm
      ? ""
      : ":00";
  const meridiemText = useShortForm
    ? hourOf24 >= 12 ? "p" : "a"
    : hourOf24 >= 12 ? " PM" : " AM";
  return `${hourOf12}${minuteText}${meridiemText}`;
};

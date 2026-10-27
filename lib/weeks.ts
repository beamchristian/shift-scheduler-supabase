import type { Settings, Snapshot, StoreHour } from "./types";

// Dates and weeks. A schedule week runs Monday (day 1) to Saturday (day 6) and is named by its Monday,
// written as "YYYY-MM-DD". This file has no database code, so the screens can use it too.

// The store's time zone. "Today" and "this week" are worked out here, wherever the server runs.
export const STORE_TIME_ZONE = "America/New_York";

// A "YYYY-MM-DD" date, with nothing else around it.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Short month names for labels, indexed from 0 (January).
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Reads a "YYYY-MM-DD" date as midnight UTC, so adding days never trips over daylight saving.
const toUtcDate = (dateText: string): Date => new Date(`${dateText}T00:00:00Z`);

// Writes a UTC date back as "YYYY-MM-DD".
const toDateText = (date: Date): string => date.toISOString().slice(0, 10);

// Today's date in the store's time zone, as "YYYY-MM-DD".
export function todayInStore(now: Date = new Date()): string {
  // The en-CA format happens to be YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Adds a number of days (negative to go back) to a "YYYY-MM-DD" date. Returns the new date.
export function addDays(dateText: string, dayCount: number): string {
  const date = toUtcDate(dateText);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return toDateText(date);
}

// Day of the week for a date: 1 = Monday through 7 = Sunday.
export function weekdayOf(dateText: string): number {
  return toUtcDate(dateText).getUTCDay() || 7;
}

// True when the text is a real "YYYY-MM-DD" date that falls on a Monday.
export function isWeekStart(dateText: string): boolean {
  if (!DATE_PATTERN.test(dateText)) return false;
  const date = toUtcDate(dateText);
  return !Number.isNaN(date.getTime()) && toDateText(date) === dateText && weekdayOf(dateText) === 1;
}

// The week that is being planned next: the first Monday after today. On a Monday it is the following Monday,
// since that day's week has already started.
export function upcomingWeekStart(today: string = todayInStore()): string {
  return addDays(today, 8 - weekdayOf(today));
}

// The week that today is in. On a Sunday, when the store is closed, that is the week starting tomorrow.
export function currentWeekStart(today: string = todayInStore()): string {
  const weekday = weekdayOf(today);
  return weekday === 7 ? addDays(today, 1) : addDays(today, 1 - weekday);
}

// True once the week's Saturday has passed.
export function isPastWeek(weekStart: string, today: string = todayInStore()): boolean {
  return addDays(weekStart, 5) < today;
}

// The calendar date of one schedule day (1 = Monday) in a week, as "YYYY-MM-DD".
export function dateOfDay(weekStart: string, day: number): string {
  return addDays(weekStart, day - 1);
}

// A short label for one date, for example "Nov 2".
export function shortDateLabel(dateText: string): string {
  const date = toUtcDate(dateText);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

// A label for a whole week, Monday to Saturday, for example "Nov 2 – 7, 2026" or "Nov 30 – Dec 5, 2026".
export function weekLabel(weekStart: string): string {
  const saturday = addDays(weekStart, 5);
  const startDate = toUtcDate(weekStart);
  const endDate = toUtcDate(saturday);
  const endText =
    startDate.getUTCMonth() === endDate.getUTCMonth() ? String(endDate.getUTCDate()) : shortDateLabel(saturday);
  return `${shortDateLabel(weekStart)} – ${endText}, ${endDate.getUTCFullYear()}`;
}

// The schedule numbers a week uses, as copies of the settings and day weights with the week's own values in place.
// Every week uses its own forecast once one is entered. A published week also uses the payroll %, rate and day
// weights it was published with, so later changes in Settings don't change it.
export function withWeekNumbers(snapshot: Snapshot): Snapshot {
  const week = snapshot.week;
  const isFrozen = week.status === "published";
  const settings: Settings = {
    ...snapshot.settings,
    weekly_sales: week.weekly_sales ?? snapshot.settings.weekly_sales,
    payroll_pct: isFrozen && week.payroll_pct != null ? week.payroll_pct : snapshot.settings.payroll_pct,
    rate_override: isFrozen && week.rate_override != null ? week.rate_override : snapshot.settings.rate_override,
  };
  const frozenWeights = isFrozen ? week.day_weights : null;
  const storeHours: StoreHour[] = snapshot.store_hours.map((dayRow) => ({
    ...dayRow,
    sales_pct: frozenWeights?.[String(dayRow.day)] ?? dayRow.sales_pct,
  }));
  return { ...snapshot, settings, store_hours: storeHours };
}

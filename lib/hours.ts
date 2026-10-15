import type { Settings } from './types';

// Lunch break rule: shifts longer than `after` hours include a `minutes` break, which is unpaid when `unpaid` is true.
// By default all budgeting and min/max logic runs on scheduled shift hours and the paid figure is for reference;
// `countPaid` flips that so the logic runs on paid hours instead.
export interface BreakRule { minutes: number; after: number; unpaid: boolean; countPaid: boolean }

const num = (v: unknown, fallback: number) => (v === null || v === undefined || String(v).trim() === '' ? fallback : Number(v));
export function breakRule(s: Partial<Pick<Settings, 'break_minutes' | 'break_after' | 'breaks_unpaid' | 'count_paid_hours'>>): BreakRule {
  return { minutes: Math.max(0, num(s.break_minutes, 30)), after: num(s.break_after, 5), unpaid: num(s.breaks_unpaid, 1) !== 0, countPaid: num(s.count_paid_hours, 0) !== 0 };
}

const toMin = (t: string) => +t.split(':')[0] * 60 + +t.split(':')[1];
export const clockHours = (start: string, end: string) => (toMin(end) - toMin(start)) / 60;
export const hasBreak = (start: string, end: string, r: BreakRule) => r.minutes > 0 && clockHours(start, end) > r.after;
// Hours that count for pay and for min/max hours: clock hours minus the unpaid break, when the shift earns one.
export const paidHours = (start: string, end: string, r: BreakRule) =>
  r.unpaid && hasBreak(start, end, r) ? Math.max(0, clockHours(start, end) - r.minutes / 60) : clockHours(start, end);

// The hours all scheduling logic uses: scheduled shift hours by default, or paid hours when the setting says so.
export const logicHours = (start: string, end: string, r: BreakRule) => (r.countPaid ? paidHours(start, end, r) : clockHours(start, end));

// Standard (12-hour) time: "6:30 AM", or short form "6:30a"
export const t12 = (t: string, short = false) => {
  const [h, m] = t.split(':').map(Number);
  const hh = h % 12 || 12;
  const mm = m ? ':' + String(m).padStart(2, '0') : short ? '' : ':00';
  return `${hh}${mm}${short ? (h >= 12 ? 'p' : 'a') : h >= 12 ? ' PM' : ' AM'}`;
};

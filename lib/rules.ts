import type { Employee, ShiftTemplate } from './types';

// Scheduling rules shared by the generator and the swap button.
const m = (t: string): number => { const [h, mi] = t.split(':'); return +h * 60 + +mi; };
const WINDOW = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/;
const to24 = (h: number, mi: number, ap?: string): number => {
  let x = h;
  if (ap?.startsWith('p') && h < 12) x += 12;
  if (ap?.startsWith('a') && h === 12) x = 0;
  return x * 60 + mi;
};

// Accepts "6am-2pm", "6:30a-4p", "06:00-14:00"
export const parseWindow = (w: string): [number, number] | null => {
  const x = w.match(WINDOW);
  if (!x) return null;
  const end = to24(+x[4], +(x[5] || 0), x[6]);
  let start = to24(+x[1], +(x[2] || 0), x[3]);
  if (!x[3] && x[6]) {
    const same = to24(+x[1], +(x[2] || 0), x[6]);
    const alt = to24(+x[1], +(x[2] || 0), x[6].startsWith('p') ? 'a' : 'p');
    start = same < end ? same : alt;
  }
  return [start, end];
};

export const norm = (x: string | null | undefined) => String(x ?? '').toLowerCase().split(',').map((v) => v.trim()).filter(Boolean);

// Availability: blank = any time, "off" = unavailable, "6am-2pm" = whole shift must fit inside.
export function availStatus(e: Employee, t: ShiftTemplate): { ok: boolean; bad?: string } {
  const w = String((e as unknown as Record<string, string | null>)['avail_' + t.day] ?? '').trim().toLowerCase();
  if (!w) return { ok: true };
  if (w === 'off') return { ok: false };
  const x = parseWindow(w);
  if (!x) return { ok: true, bad: w };
  return { ok: m(t.start) >= x[0] && m(t.end) <= x[1] };
}

// Hard rules: a shift can be limited to named people, a person to certain shift types, and a shift can require a skill.
export function allowedFor(e: Employee, t: ShiftTemplate): boolean {
  const who = norm(t.only_for);
  if (who.length && !who.includes(e.name.toLowerCase().trim())) return false;
  const types = norm(e.shifts);
  if (types.length && !types.includes(t.name.toLowerCase().trim())) return false;
  return !lacksSkill(e, t);
}

// Weekly closing limit: the person's own number, or the default. Infinity = no limit.
export function limitFor(e: Employee, def: number | string | null | undefined): number {
  const o = e.max_closes;
  const v = o == null || String(o).trim() === '' ? Number(def ?? 0) : Number(o);
  return v > 0 ? v : Infinity;
}

// True when a shift requires a skill the person is not tagged with.
export function lacksSkill(e: Employee, t: ShiftTemplate): boolean {
  const need = String(t.skill ?? '').toLowerCase().trim();
  return !!need && !norm(e.skills).includes(need);
}

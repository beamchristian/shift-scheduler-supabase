import { snapshot, transaction } from "./db";
import { breakRule, logicHours } from "./hours";
import { allowedFor, availStatus, lacksSkill, limitFor } from "./rules";
import type {
  Employee,
  ScheduleRow,
  Settings,
  ShiftTemplate,
  StoreHour,
} from "./types";

const FULL = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const m = (t: string): number => {
  const [h, mi] = t.split(":");
  return +h * 60 + +mi;
};
const t12 = (t: string) => {
  const [h, mi] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const label = (r: ScheduleRow) => `${r.name} ${t12(r.start)} to ${t12(r.end)}`;

type Move = {
  a: ScheduleRow;
  A: Employee;
  b?: ScheduleRow;
  B: Employee;
  score: number;
};

// Changes who closes on one day. Either two people trade shifts that day, or a closer is replaced by
// someone who is off that day. Availability, restrictions and max hours are always respected, and moves that
// keep everyone within their closing limit are preferred. Each press picks randomly among the best options.
// departmentId limits the swap to that department's schedule and people.
export async function swapClosers(
  day: number,
  departmentId: number,
): Promise<{ ok: boolean; message: string }> {
  const snap = await snapshot(departmentId);
  const s: Settings = snap.settings;
  const rule = breakRule(s);
  const lenOf = (r: { start: string; end: string }) =>
    logicHours(r.start, r.end, rule);
  const closeAt: Record<number, string> = Object.fromEntries(
    snap.store_hours.map((h) => [h.day, h.close]),
  );
  const emps: Employee[] = snap.employees;
  const tpl = new Map(snap.shift_templates.map((t) => [t.id, t]));
  const rows: ScheduleRow[] = snap.schedule;
  const emp = new Map(emps.map((e) => [e.id, e]));
  const D = FULL[day];

  if (!closeAt[day])
    return { ok: false, message: `No store hours are set for ${D}.` };
  const isClose = (r: ScheduleRow) =>
    !!closeAt[r.day] && m(r.end) >= m(closeAt[r.day]);
  const dayRows = rows.filter((r) => r.day === day);
  const closers = dayRows.filter(isClose);
  if (!closers.length)
    return {
      ok: false,
      message: `There are no closing shifts scheduled on ${D}. Generate a schedule first.`,
    };

  const hours = new Map<number, number>();
  const closes = new Map<number, number>();
  for (const r of rows) {
    hours.set(r.employee_id, (hours.get(r.employee_id) ?? 0) + lenOf(r));
    if (isClose(r))
      closes.set(r.employee_id, (closes.get(r.employee_id) ?? 0) + 1);
  }
  const canTake = (e: Employee, r: ScheduleRow) => {
    const t = tpl.get(r.template_id);
    return !!t && allowedFor(e, t) && availStatus(e, t).ok;
  };
  const working = new Set(dayRows.map((r) => r.employee_id));
  const h = (e: Employee) => hours.get(e.id) ?? 0;
  const lacks = (e: Employee, r: ScheduleRow) => {
    const t = tpl.get(r.template_id);
    return !!t && lacksSkill(e, t);
  };
  const moves: Move[] = [];

  for (const a of closers) {
    const A = emp.get(a.employee_id);
    if (!A) continue;
    // Trade with someone working a non-closing shift the same day
    for (const b of dayRows) {
      const B = emp.get(b.employee_id);
      if (!B || isClose(b) || B.id === A.id || !canTake(A, b) || !canTake(B, a))
        continue;
      const hA = h(A) - lenOf(a) + lenOf(b);
      const hB = h(B) - lenOf(b) + lenOf(a);
      if (hA > A.max_hours + 1e-9 || hB > B.max_hours + 1e-9) continue;
      let score = 0;
      if ((closes.get(B.id) ?? 0) + 1 > limitFor(B, s.max_closes)) score += 100;
      if (hA < A.min_hours - 1e-9) score += 5;
      if (hB < B.min_hours - 1e-9) score += 5;
      if (lacks(A, b)) score += 50;
      if (lacks(B, a)) score += 50;
      moves.push({ a, A, b, B, score });
    }
    // Or replace the closer with someone who is off that day
    for (const C of emps) {
      if (
        working.has(C.id) ||
        !canTake(C, a) ||
        h(C) + lenOf(a) > C.max_hours + 1e-9
      )
        continue;
      let score = 10;
      if ((closes.get(C.id) ?? 0) + 1 > limitFor(C, s.max_closes)) score += 100;
      if (h(A) - lenOf(a) < A.min_hours - 1e-9) score += 5;
      if (lacks(C, a)) score += 50;
      moves.push({ a, A, B: C, score });
    }
  }

  if (!moves.length)
    return {
      ok: false,
      message: `No swap is possible on ${D}. Everyone else who could close is unavailable, already at their max hours, or restricted from that shift.`,
    };
  const best = Math.min(...moves.map((x) => x.score));
  const pool = moves.filter((x) => x.score === best);
  const mv = pool[Math.floor(Math.random() * pool.length)];

  await transaction(async (tx) => {
    // Each update also checks the row belongs to this department, as a second safeguard.
    await tx("update schedule set employee_id=$1 where id=$2 and department_id=$3", [
      mv.B.id,
      mv.a.id,
      departmentId,
    ]);
    if (mv.b)
      await tx("update schedule set employee_id=$1 where id=$2 and department_id=$3", [
        mv.A.id,
        mv.b.id,
        departmentId,
      ]);
  });

  const t1 = tpl.get(mv.a.template_id);
  const t2 = mv.b ? tpl.get(mv.b.template_id) : undefined;
  const skillNotes = [
    t1 && lacksSkill(mv.B, t1)
      ? `${mv.B.name} isn't tagged for ${t1.skill}`
      : "",
    mv.b && t2 && lacksSkill(mv.A, t2)
      ? `${mv.A.name} isn't tagged for ${t2.skill}`
      : "",
  ].filter(Boolean);
  const skillNote = skillNotes.length
    ? ` Note: ${skillNotes.join(" and ")}.`
    : "";
  const over =
    mv.score >= 100
      ? ` This puts ${mv.B.name} over their closing limit, because no other option fit.`
      : "";
  return {
    ok: true,
    message: mv.b
      ? `${D}: ${mv.B.name} now closes (${label(mv.a)}) and ${mv.A.name} takes ${label(mv.b)}.${over}${skillNote}`
      : `${D}: ${mv.B.name} now closes (${label(mv.a)}) in place of ${mv.A.name}, who is off that day.${over}${skillNote}`,
  };
}

import { snapshot, transaction } from "./db";
import { avgRate, dailySales, dayBudget } from "./matrix";
import { repair } from "./solver";
import { breakRule, logicHours } from "./hours";
import { allowedFor, availStatus, limitFor, norm } from "./rules";
import type { Employee, Settings, ShiftTemplate, StoreHour } from "./types";

const D = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const m = (t: string): number => {
  const [h, mi] = t.split(":");
  return +h * 60 + +mi;
};

type Emp = Employee & {
  hrs: number;
  days: Set<number>;
  sk: string[];
  closes: number;
};
export interface Suggestion {
  title: string;
  detail: string;
}
export interface Plan {
  warnings: string[];
  unfilled: string[];
  underMin: string[];
  capacity: number;
  needed: number;
  suggestions: Suggestion[];
  config: string[];
}

// write=true builds and saves the schedule using the payroll budget.
// write=false is a dry run with no payroll limit, used to check whether the team can cover every required shift.
async function plan(write: boolean): Promise<Plan> {
  const snap = await snapshot();
  const s: Settings = snap.settings;
  const rule = breakRule(s);
  // All hour accounting (budget, min/max hours) uses scheduled shift hours, or paid hours if that setting is on
  const lenOf = (t: ShiftTemplate) => logicHours(t.start, t.end, rule);
  const hoursByDay = Object.fromEntries(
    snap.store_hours.map((h) => [h.day, h]),
  );
  const storeHours = Object.values(hoursByDay);
  const emps: Emp[] = snap.employees.map((e) => ({
    ...e,
    hrs: 0,
    closes: 0,
    days: new Set<number>(),
    sk: (e.skills || "")
      .toLowerCase()
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  }));
  const tpls: ShiftTemplate[] = [...snap.shift_templates].sort(
    (a, b) => a.id - b.id,
  );
  const warnings: string[] = [];
  const unfilled: string[] = [];
  const unfilledSlots: ShiftTemplate[] = [];
  const badAvail = new Set<string>();

  const rate = avgRate(s, emps);
  const sales = dailySales(storeHours, s);
  const budget: Record<number, number> = {};
  const dayHrs: Record<number, number> = {};
  for (const h of storeHours) {
    budget[h.day] = dayBudget(sales[h.day], s, rate).hours;
    dayHrs[h.day] = 0;
  }
  const weeklyBudget = Object.values(budget).reduce((a, b) => a + b, 0);
  let weekHrs = 0;
  let avgLen = 10;

  // A closing shift is one that runs to the store's closing time. The weekly closing limit is a preference, not a hard rule.
  const isClose = (t: ShiftTemplate) => {
    const sh = hoursByDay[t.day];
    return !!sh && m(t.end) >= m(sh.close);
  };
  const limitOf = (e: Emp): number => limitFor(e, s.max_closes);

  // Assignments are collected in memory and saved at the end, so the repair pass can still move them around.
  const placed: { t: ShiftTemplate; e: Emp }[] = [];
  const apply = (e: Emp, t: ShiftTemplate) => {
    const len = lenOf(t);
    e.hrs += len;
    e.days.add(t.day);
    dayHrs[t.day] += len;
    weekHrs += len;
    if (isClose(t)) e.closes++;
    placed.push({ t, e });
  };

  // Availability and restrictions come from rules.ts, the same rules the swap button uses.
  const isFree = (e: Emp, t: ShiftTemplate): boolean => {
    const r = availStatus(e, t);
    if (r.bad && write) {
      const k = `${e.name}|${t.day}`;
      if (!badAvail.has(k)) {
        badAvail.add(k);
        warnings.push(
          `Could not read ${e.name}'s availability for ${D[t.day]} ("${r.bad}"), so it was treated as any time.`,
        );
      }
    }
    return r.ok;
  };
  const canWork = (e: Emp, t: ShiftTemplate): boolean =>
    allowedFor(e, t) && isFree(e, t);

  const candidates = (t: ShiftTemplate) =>
    emps.filter(
      (e) =>
        !e.days.has(t.day) && e.hrs + lenOf(t) <= e.max_hours && canWork(e, t),
    );

  const place = (t: ShiftTemplate, required: boolean): Emp | null => {
    const len = lenOf(t);
    const need = (t.skill || "").toLowerCase().trim();
    if (write) {
      if (weekHrs + len > weeklyBudget + 1e-9) return null;
      if (!required && dayHrs[t.day] + len > budget[t.day]) return null;
    }
    const pick = candidates(t)
      .map((e) => {
        let sc = Math.max(0, e.min_hours - e.hrs) * 2 - e.hrs - e.wage * 0.1;
        if (need && e.sk.includes(need)) sc += 100;
        // Part-timers are favored for shorter shifts, full-timers for longer ones
        sc += (e.type === "PT" ? 1 : -1) * (avgLen - len) * 20;
        if (e.type === "FT") sc += 5;
        // Spread closing shifts around and avoid going past the closing limit
        if (isClose(t)) {
          sc -= e.closes * 15;
          if (e.closes >= limitOf(e)) sc -= 1000;
        }
        return { e, sc };
      })
      .sort((a, b) => b.sc - a.sc)[0];
    if (!pick) return null;
    apply(pick.e, t);
    return pick.e;
  };

  // Phase 1: required shifts. Always place the slot with the fewest possible people next,
  // so hard-to-cover shifts (like busy Saturdays) are not left with whoever is left over.
  const slots: ShiftTemplate[] = [];
  for (const t of tpls) {
    const sh = hoursByDay[t.day];
    if (
      write &&
      (m(t.start) < m(s.earliest_start) || m(t.start) > m(s.latest_start))
    )
      warnings.push(
        `${t.name} on ${D[t.day]} starts outside your allowed start window.`,
      );
    if (write && sh && (m(t.start) < m(sh.open) || m(t.end) > m(sh.close)))
      warnings.push(`${t.name} on ${D[t.day]} runs outside store hours.`);
    for (let i = 0; i < t.needed; i++) slots.push(t);
  }
  slots.sort((a, b) => a.day - b.day || (b.skill ? 1 : 0) - (a.skill ? 1 : 0));
  avgLen = slots.length
    ? slots.reduce((a, t) => a + lenOf(t), 0) / slots.length
    : 10;
  const asg: number[] = new Array(slots.length).fill(-1);
  const pending = slots.map((_, i) => i);
  while (pending.length) {
    let bi = 0;
    let bc = Infinity;
    pending.forEach((si, i) => {
      const t = slots[si];
      const b = slots[pending[bi]];
      const c = candidates(t).length;
      if (
        c < bc ||
        (c === bc && t.skill && !b.skill) ||
        (c === bc && !!t.skill === !!b.skill && lenOf(t) < lenOf(b))
      ) {
        bc = c;
        bi = i;
      }
    });
    const si = pending.splice(bi, 1)[0];
    const e = place(slots[si], true);
    asg[si] = e ? emps.indexOf(e) : -1;
  }

  // Second pass: if the first pass left shifts open, move shifts between people to make room for them.
  const allowedM = emps.map((e) => slots.map((t) => canWork(e, t)));
  const open = asg.flatMap((a, i) => (a < 0 ? [i] : []));
  if (open.length)
    repair(
      slots.map((t) => ({ day: t.day, len: lenOf(t) })),
      emps.map((e) => Number(e.max_hours)),
      allowedM,
      asg,
      open,
      write ? weeklyBudget - weekHrs : Infinity,
    );

  // Third pass: improve the schedule without changing which shifts are covered. It reassigns shifts, or swaps two
  // people on the same day, whenever that lowers closes over someone's limit (a preference) or hours below someone's minimum.
  const closeIdx = slots.map(isClose);
  const slotHrs = slots.map(lenOf);
  const maxH = emps.map((e) => Number(e.max_hours));
  const minH = emps.map((e) => Number(e.min_hours));
  const lim = emps.map(limitOf);
  const cost = (): number => {
    const h = emps.map(() => 0);
    const c = emps.map(() => 0);
    asg.forEach((e, i) => {
      if (e >= 0) {
        h[e] += slotHrs[i];
        if (closeIdx[i]) c[e]++;
      }
    });
    return emps.reduce(
      (a, _, e) =>
        a + 1000 * Math.max(0, c[e] - lim[e]) + Math.max(0, minH[e] - h[e]),
      0,
    );
  };
  const hoursOf = (e: number) =>
    asg.reduce((a, x, i) => a + (x === e ? slotHrs[i] : 0), 0);
  const busyOn = (e: number, day: number) =>
    asg.some((x, i) => x === e && slots[i].day === day);
  let best = cost();
  for (let guard = 0; guard < 300; guard++) {
    let move: (() => void) | null = null;
    let bestCost = best;
    for (let i = 0; i < slots.length; i++) {
      const ei = asg[i];
      if (ei < 0) continue;
      for (let ej = 0; ej < emps.length; ej++) {
        if (ej === ei || !allowedM[ej][i]) continue;
        // hand shift i to ej if they are free that day
        if (
          !busyOn(ej, slots[i].day) &&
          hoursOf(ej) + slotHrs[i] <= maxH[ej] + 1e-9
        ) {
          asg[i] = ej;
          const c = cost();
          asg[i] = ei;
          if (c < bestCost - 1e-9) {
            bestCost = c;
            move = () => {
              asg[i] = ej;
            };
          }
        }
        // or swap with the shift ej works that same day
        const k = slots.findIndex(
          (t, kk) => asg[kk] === ej && t.day === slots[i].day,
        );
        if (
          k >= 0 &&
          allowedM[ei][k] &&
          hoursOf(ei) - slotHrs[i] + slotHrs[k] <= maxH[ei] + 1e-9 &&
          hoursOf(ej) - slotHrs[k] + slotHrs[i] <= maxH[ej] + 1e-9
        ) {
          asg[i] = ej;
          asg[k] = ei;
          const c = cost();
          asg[i] = ei;
          asg[k] = ej;
          if (c < bestCost - 1e-9) {
            bestCost = c;
            move = () => {
              asg[i] = ej;
              asg[k] = ei;
            };
          }
        }
      }
    }
    if (!move) break;
    (move as () => void)();
    best = bestCost;
  }

  // Rebuild hours, days and closes from the final assignment
  for (const e of emps) {
    e.hrs = 0;
    e.closes = 0;
    e.days.clear();
  }
  for (const d of Object.keys(dayHrs)) dayHrs[+d] = 0;
  weekHrs = 0;
  placed.length = 0;
  slots.forEach((t, i) => {
    if (asg[i] >= 0) apply(emps[asg[i]], t);
  });
  slots.forEach((t, i) => {
    const label = `${t.name} on ${D[t.day]}`;
    if (asg[i] < 0) {
      const overBudget = write && weekHrs + lenOf(t) > weeklyBudget + 1e-9;
      warnings.push(
        `Unfilled: ${label} (${overBudget ? `weekly hour budget of ${weeklyBudget.toFixed(1)} reached` : "nobody available: availability, max hours, or already working that day"}).`,
      );
      unfilled.push(label);
      unfilledSlots.push(t);
    } else if (write) {
      const need = (t.skill || "").toLowerCase().trim();
      if (need && !emps[asg[i]].sk.includes(need))
        warnings.push(
          `${label} needs "${need}" but ${emps[asg[i]].name} isn't tagged for it.`,
        );
    }
  });

  // Phase 2: extra shifts up to each day's budget, giving the next one to the day with the most unused budget.
  if (write && (s.fill_extra == null || Number(s.fill_extra) !== 0)) {
    const byDay: Record<number, ShiftTemplate[]> = {};
    for (const t of tpls) (byDay[t.day] ||= []).push(t);
    const rot: Record<number, number> = {};
    let progress = true;
    while (progress) {
      progress = false;
      const order = Object.keys(byDay)
        .map(Number)
        .sort((a, b) => budget[b] - dayHrs[b] - (budget[a] - dayHrs[a]));
      for (const d of order) {
        const list = byDay[d];
        for (let i = 0; i < list.length; i++) {
          if (place(list[((rot[d] || 0) + i) % list.length], false)) {
            rot[d] = ((rot[d] || 0) + i + 1) % list.length;
            progress = true;
            break;
          }
        }
        if (progress) break;
      }
    }
  }

  if (write)
    for (const e of emps)
      if (e.closes > limitOf(e))
        warnings.push(
          `${e.name} closes ${e.closes} nights, over their limit of ${limitOf(e)}. It could not be lowered without breaking availability, max hours or another rule.`,
        );

  if (write) {
    await transaction(async (tx) => {
      await tx("delete from schedule");
      if (placed.length) {
        const params = placed.flatMap(({ t, e }) => [
          t.day,
          t.id,
          e.id,
          t.name,
          t.start,
          t.end,
        ]);
        const rows = placed
          .map(
            (_, k) =>
              `($${k * 6 + 1},$${k * 6 + 2},$${k * 6 + 3},$${k * 6 + 4},$${k * 6 + 5},$${k * 6 + 6})`,
          )
          .join(",");
        await tx(
          `insert into schedule (day, template_id, employee_id, name, "start", "end") values ${rows}`,
          params,
        );
      }
    });
  }

  const underMin = emps
    .filter((e) => e.hrs < e.min_hours)
    .map((e) => `${e.name} (${e.hrs}/${e.min_hours} hrs)`);
  if (write)
    for (const u of underMin)
      warnings.push(`${u.replace(" (", " is under their minimum hours (")}.`);

  // Dry run only: data-driven suggestions for fixing what could not be covered.
  const suggestions: Suggestion[] = [];
  if (!write) {
    const minLen = slots.length ? Math.min(...slots.map(lenOf)) : 0;
    if (unfilledSlots.length) {
      // 1. Raise max hours: cheapest raise for each unfilled shift, tracking raises already assumed
      const vh = new Map(
        emps.map((e) => [e.id, { hrs: e.hrs, days: new Set(e.days) }]),
      );
      const raises = new Map<number, { to: number; slots: string[] }>();
      let covered = 0;
      for (const t of unfilledSlots) {
        const len = lenOf(t);
        const best = emps
          .filter((e) => !vh.get(e.id)!.days.has(t.day) && canWork(e, t))
          .map((e) => ({
            e,
            need: Math.max(
              0,
              vh.get(e.id)!.hrs + len - (raises.get(e.id)?.to ?? e.max_hours),
            ),
          }))
          .sort((a, b) => a.need - b.need || a.e.wage - b.e.wage)[0];
        if (!best) continue;
        const v = vh.get(best.e.id)!;
        v.hrs += len;
        v.days.add(t.day);
        covered++;
        const r = raises.get(best.e.id) ?? { to: best.e.max_hours, slots: [] };
        r.to = Math.max(r.to, v.hrs);
        r.slots.push(`${t.name} on ${D[t.day]}`);
        raises.set(best.e.id, r);
      }
      const raised = emps.filter(
        (e) => (raises.get(e.id)?.to ?? 0) > e.max_hours,
      );
      if (raised.length) {
        const extra = raised.reduce(
          (a, e) => a + raises.get(e.id)!.to - e.max_hours,
          0,
        );
        suggestions.push({
          title: `Raise max hours (covers ${covered} of ${unfilledSlots.length} open shifts, adds ${+extra.toFixed(1)} hrs, about $${(extra * rate).toFixed(0)})`,
          detail:
            raised
              .map(
                (e) =>
                  `${e.name} from ${e.max_hours} to ${+raises.get(e.id)!.to.toFixed(1)} to take ${raises.get(e.id)!.slots.join(" and ")}`,
              )
              .join("; ") + ".",
        });
      }
      // 2. Ask people to open up availability
      const asks = [
        ...new Set(
          unfilledSlots
            .map((t) => {
              const names = emps
                .filter(
                  (e) =>
                    !e.days.has(t.day) &&
                    e.hrs + lenOf(t) <= e.max_hours &&
                    allowedFor(e, t) &&
                    !isFree(e, t),
                )
                .map((e) => e.name);
              return names.length
                ? `${t.name} on ${D[t.day]}: ${names.slice(0, 3).join(", ")}`
                : "";
            })
            .filter(Boolean),
        ),
      ];
      if (asks.length)
        suggestions.push({
          title: "Ask about availability",
          detail: `These people have hours left but are marked unavailable. ${asks.join("; ")}.`,
        });
      // 2b. Loosen a restriction
      const loosen = [
        ...new Set(
          unfilledSlots
            .map((t) => {
              const names = emps
                .filter(
                  (e) =>
                    !e.days.has(t.day) &&
                    e.hrs + lenOf(t) <= e.max_hours &&
                    isFree(e, t) &&
                    !allowedFor(e, t),
                )
                .map((e) => e.name);
              return names.length
                ? `${t.name} on ${D[t.day]}: ${names.slice(0, 3).join(", ")}`
                : "";
            })
            .filter(Boolean),
        ),
      ];
      if (loosen.length)
        suggestions.push({
          title: "Loosen a restriction or tag a skill",
          detail: `These people are free and have hours left but are excluded by a restriction or by not having the required skill tag. ${loosen.join("; ")}.`,
        });
      // 3. Lower headcount
      const cuts = new Map<number, { t: ShiftTemplate; n: number }>();
      for (const t of unfilledSlots)
        cuts.set(t.id, { t, n: (cuts.get(t.id)?.n ?? 0) + 1 });
      suggestions.push({
        title: "Lower headcount",
        detail:
          [...cuts.values()]
            .map(
              ({ t, n }) =>
                `${t.name} on ${D[t.day]} from ${t.needed} to ${t.needed - n}`,
            )
            .join("; ") + ".",
      });
      // 4. Hire
      suggestions.push({
        title: "Add staff",
        detail: `You are ${unfilledSlots.length} shifts short. One more full-time employee covers about 4 to 5 shifts a week, so roughly ${Math.ceil(unfilledSlots.length / 4)} more would do it.`,
      });
    }
    // 5. Short shifts for stranded hours
    const stranded = emps
      .map((e) => ({ e, free: e.max_hours - e.hrs }))
      .filter((x) => x.free >= 2 && x.free < minLen);
    if (stranded.length && (unfilledSlots.length || underMin.length))
      suggestions.push({
        title: "Add a short shift",
        detail: `${stranded.map((x) => `${x.e.name} (${+x.free.toFixed(1)} hrs)`).join(", ")} have hours left under their max, but less than a full shift. A short shift template of up to ${Math.floor(Math.max(...stranded.map((x) => x.free)))} hrs would put those hours to use.`,
      });
    // 6. Minimum hours that cannot be reached
    if (underMin.length)
      suggestions.push({
        title: "Minimum hours",
        detail: `${underMin.join(", ")} cannot reach their minimum with the current shifts. Lower those minimums to what is reachable, widen their availability, or add shorter shifts.`,
      });
  }

  const config: string[] = [];
  const names = emps.map((e) => e.name.toLowerCase().trim());
  for (const t of tpls)
    for (const w of norm(t.only_for))
      if (!names.includes(w))
        config.push(
          `${t.name} on ${D[t.day]} is restricted to "${w}", but no employee has that name.`,
        );
  const tplNames = tpls.map((t) => t.name.toLowerCase().trim());
  for (const e of emps)
    for (const x of norm(e.shifts))
      if (!tplNames.includes(x))
        config.push(
          `${e.name} is limited to "${x}", but no shift template has that name.`,
        );
  for (const t of tpls) {
    const need = (t.skill || "").toLowerCase().trim();
    if (need && !emps.some((e) => e.sk.includes(need)))
      config.push(
        `${t.name} on ${D[t.day]} requires the skill "${need}", but no employee is tagged with it.`,
      );
  }
  const configUnique = [...new Set(config)];
  if (write) warnings.push(...configUnique);

  // How many required shifts the team can actually cover
  const capacity = slots.length - unfilledSlots.length;

  return {
    warnings,
    unfilled,
    underMin,
    capacity,
    needed: slots.length,
    suggestions,
    config: configUnique,
  };
}

export async function generate(): Promise<string[]> {
  return (await plan(true)).warnings;
}
export function preview(): Promise<Plan> {
  return plan(false);
}

export interface Slot { day: number; len: number }

// Fills open shifts that the first-pass assignment could not place, using "ejection chains":
// if nobody can simply take a shift, give it to someone who is blocked only by another shift
// (same day, or the max-hours limit) and move that shift to somebody else, repeating up to `maxDepth` moves.
// asg[slot] = employee index or -1. asg is updated in place. room = extra hours that may still be added overall.
export function repair(slots: Slot[], max: number[], allowed: boolean[][], asg: number[], open: number[], room: number, maxDepth = 7, limit = 30000): void {
  const nE = max.length;
  const EPS = 1e-9;
  const hrs: number[] = new Array(nE).fill(0);
  const dayslot: number[][] = Array.from({ length: nE }, () => new Array(8).fill(-1));
  slots.forEach((s, i) => { const e = asg[i]; if (e >= 0) { hrs[e] += s.len; dayslot[e][s.day] = i; } });

  const assign = (s: number, e: number) => { asg[s] = e; hrs[e] += slots[s].len; dayslot[e][slots[s].day] = s; };
  const unassign = (s: number) => { const e = asg[s]; asg[s] = -1; hrs[e] -= slots[s].len; dayslot[e][slots[s].day] = -1; };

  let steps = 0;
  const fill = (s: number, depth: number, used: Set<number>): boolean => {
    if (++steps > limit) return false;
    const { day, len } = slots[s];
    const cands: number[] = [];
    for (let e = 0; e < nE; e++) if (allowed[e][s] && !used.has(e)) cands.push(e);

    for (const e of cands) {
      if (dayslot[e][day] < 0 && hrs[e] + len <= max[e] + EPS) { assign(s, e); return true; }
    }
    if (depth === 0) return false;

    // Someone already works another shift that day: swap it out and re-place it
    for (const e of cands) {
      const s2 = dayslot[e][day];
      if (s2 < 0 || hrs[e] - slots[s2].len + len > max[e] + EPS) continue;
      unassign(s2); assign(s, e); used.add(e);
      const ok = fill(s2, depth - 1, used);
      used.delete(e);
      if (ok) return true;
      unassign(s); assign(s2, e);
    }
    // Someone is free that day but at their max hours: give up another of their shifts
    for (const e of cands) {
      if (dayslot[e][day] >= 0) continue;
      for (let d2 = 1; d2 <= 7; d2++) {
        const s3 = dayslot[e][d2];
        if (s3 < 0 || hrs[e] - slots[s3].len + len > max[e] + EPS) continue;
        unassign(s3); assign(s, e); used.add(e);
        const ok = fill(s3, depth - 1, used);
        used.delete(e);
        if (ok) return true;
        unassign(s); assign(s3, e);
      }
    }
    return false;
  };

  for (const s of open) {
    if (slots[s].len > room + EPS) continue;
    for (let depth = 0; depth <= maxDepth; depth++) {
      steps = 0;
      if (fill(s, depth, new Set())) { room -= slots[s].len; break; }
    }
  }
}

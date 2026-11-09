"use client";
import { breakRule, logicHours, type BreakRule } from "../../../lib/hours";
import { shiftKindFinder, type ShiftKind } from "../../../lib/rules";
import type { Snapshot } from "../../../lib/types";
import {
  DAY_SHORT_LABELS,
  WORK_DAYS,
  minutesOfDay,
  roundTo2,
  shiftChipClasses,
} from "../../../lib/ui/format";
import { cardClass } from "../../../lib/ui/styles";
import { withWeekNumbers } from "../../../lib/weeks";

// How many shifts of one kind are on one day, and the hours they add up to.
interface DayTally {
  shiftCount: number;
  hours: number;
}

// What the table counts: the shifts scheduled this week, or the people the shift templates ask for.
export type ShiftTotalsSource = "schedule" | "templates";

// One shift to count: its name, day and times, and how many people it stands for.
// A scheduled shift is one person; a template is as many people as it needs.
interface CountedShift {
  name: string;
  day: number;
  start: string;
  end: string;
  peopleCount: number;
}

// One row of the totals table: a shift name, with its tally for each day and for the week.
interface ShiftTotalsRow {
  shiftName: string;
  shiftKind: ShiftKind;
  // The earliest start of this shift across the week, in minutes, used to order the rows.
  earliestStartMinutes: number;
  tallyByDay: Record<number, DayTally>;
  weekTally: DayTally;
}

// Openers first, then the shifts in between, then closers, so the table reads like the day runs.
const KIND_ORDER: Record<ShiftKind, number> = { open: 0, other: 1, close: 2 };

// Returns an empty tally for every work day, keyed by day number.
function emptyTallyByDay(): Record<number, DayTally> {
  const tallyByDay: Record<number, DayTally> = {};
  for (const dayNumber of WORK_DAYS)
    tallyByDay[dayNumber] = { shiftCount: 0, hours: 0 };
  return tallyByDay;
}

// Adds a number of people working one shift to a tally. Returns nothing; the tally is changed in place.
function addToTally(tally: DayTally, peopleCount: number, shiftHours: number): void {
  tally.shiftCount += peopleCount;
  tally.hours += peopleCount * shiftHours;
}

// Lists the shifts to count for the chosen source.
// Returns one entry per scheduled shift, or one per template with its people needed.
function countedShiftsFor(data: Snapshot, source: ShiftTotalsSource): CountedShift[] {
  if (source === "schedule")
    return data.schedule.map((scheduledShift) => ({ ...scheduledShift, peopleCount: 1 }));
  return data.shift_templates.map((shiftTemplate) => ({
    name: shiftTemplate.name,
    day: Number(shiftTemplate.day),
    start: shiftTemplate.start,
    end: shiftTemplate.end,
    peopleCount: Number(shiftTemplate.needed) || 0,
  }));
}

// Groups the shifts by name and counts the people on each per day.
// Hours use the same rule as the labor matrix, so scheduled totals match "Hours scheduled" there
// and template totals match "Hours to fully staff".
// Returns the rows ordered openers, others, then closers, each by earliest start and then name.
export function buildShiftTotalsRows(
  data: Snapshot,
  breakSettings: BreakRule,
  source: ShiftTotalsSource,
): ShiftTotalsRow[] {
  const shiftKindOf = shiftKindFinder(
    data.shift_templates,
    data.settings.closing_time,
  );
  const rowsByName = new Map<string, ShiftTotalsRow>();
  for (const countedShift of countedShiftsFor(data, source)) {
    // A template that needs nobody adds nothing, so it doesn't get an empty row.
    if (countedShift.peopleCount <= 0) continue;
    let totalsRow = rowsByName.get(countedShift.name);
    if (!totalsRow) {
      totalsRow = {
        shiftName: countedShift.name,
        shiftKind: shiftKindOf(countedShift),
        earliestStartMinutes: minutesOfDay(countedShift.start),
        tallyByDay: emptyTallyByDay(),
        weekTally: { shiftCount: 0, hours: 0 },
      };
      rowsByName.set(countedShift.name, totalsRow);
    }
    const shiftHours = logicHours(
      countedShift.start,
      countedShift.end,
      breakSettings,
    );
    totalsRow.earliestStartMinutes = Math.min(
      totalsRow.earliestStartMinutes,
      minutesOfDay(countedShift.start),
    );
    const dayTally = totalsRow.tallyByDay[countedShift.day];
    if (dayTally) addToTally(dayTally, countedShift.peopleCount, shiftHours);
    addToTally(totalsRow.weekTally, countedShift.peopleCount, shiftHours);
  }
  return Array.from(rowsByName.values()).sort(
    (firstRow, secondRow) =>
      KIND_ORDER[firstRow.shiftKind] - KIND_ORDER[secondRow.shiftKind] ||
      firstRow.earliestStartMinutes - secondRow.earliestStartMinutes ||
      firstRow.shiftName.localeCompare(secondRow.shiftName),
  );
}

// Adds up every row's tally for each day and for the week, for the totals row at the bottom.
// Returns the day tallies and the week tally.
function sumTotalsRows(totalsRows: ShiftTotalsRow[]): {
  tallyByDay: Record<number, DayTally>;
  weekTally: DayTally;
} {
  const tallyByDay = emptyTallyByDay();
  const weekTally: DayTally = { shiftCount: 0, hours: 0 };
  for (const totalsRow of totalsRows) {
    for (const dayNumber of WORK_DAYS) {
      tallyByDay[dayNumber].shiftCount += totalsRow.tallyByDay[dayNumber].shiftCount;
      tallyByDay[dayNumber].hours += totalsRow.tallyByDay[dayNumber].hours;
    }
    weekTally.shiftCount += totalsRow.weekTally.shiftCount;
    weekTally.hours += totalsRow.weekTally.hours;
  }
  return { tallyByDay, weekTally };
}

// One table cell: the shift count, with its hours in small grey text below. A day with none shows a dash.
function TallyCell({
  tally,
  isBold = false,
}: {
  tally: DayTally;
  isBold?: boolean;
}) {
  if (tally.shiftCount === 0)
    return <td className='px-3 py-2 text-right text-slate-300'>–</td>;
  return (
    <td className='whitespace-nowrap px-3 py-2 text-right tabular-nums'>
      <div className={isBold ? "font-semibold text-slate-900" : "text-slate-700"}>
        {tally.shiftCount}
      </div>
      <div className='text-xs text-slate-400'>{roundTo2(tally.hours)} h</div>
    </td>
  );
}

// The "Shift totals" table: how many people each shift has on each day of the week, with hours,
// a week total column and a totals row. Shift names are colored as openers, closers or other.
// source "schedule" counts this week's scheduled shifts; "templates" counts the people the templates need.
// The title comes from the section around it. Shows a short note when there is nothing to count.
export function ShiftTotalsTable({
  data,
  source = "schedule",
}: {
  data: Snapshot;
  source?: ShiftTotalsSource;
}) {
  // The same break rule the labor matrix uses (see buildReport), so the hours match it.
  const breakSettings = breakRule(withWeekNumbers(data).settings);
  const totalsRows = buildShiftTotalsRows(data, breakSettings, source);
  const isTemplateCount = source === "templates";
  if (totalsRows.length === 0)
    return (
      <div className={`${cardClass} p-6 text-center text-sm text-slate-500`}>
        {isTemplateCount
          ? "No shift templates need anyone yet, so there are no totals to show."
          : "Nothing is scheduled this week yet, so there are no totals to show."}
      </div>
    );
  const columnTotals = sumTotalsRows(totalsRows);
  const headerCellClass =
    "px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <>
      <p className='mb-2 text-xs text-slate-500'>
        {isTemplateCount
          ? "How many people the shift templates need each day, with their hours. This is what a fully staffed week looks like."
          : "How many of each shift are scheduled each day, with their hours."}
      </p>
      <div className={`${cardClass} overflow-x-auto`}>
        <table className='min-w-full text-sm'>
          <thead className='bg-slate-50'>
            <tr>
              <th className='sticky left-0 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Shift
              </th>
              {WORK_DAYS.map((dayNumber) => (
                <th key={dayNumber} className={headerCellClass}>
                  {DAY_SHORT_LABELS[dayNumber]}
                </th>
              ))}
              <th className={headerCellClass}>Week</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100'>
            {totalsRows.map((totalsRow) => (
              <tr key={totalsRow.shiftName}>
                <td className='sticky left-0 whitespace-nowrap bg-white px-3 py-2'>
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${shiftChipClasses(totalsRow.shiftKind)}`}
                  >
                    {totalsRow.shiftName}
                  </span>
                </td>
                {WORK_DAYS.map((dayNumber) => (
                  <TallyCell
                    key={dayNumber}
                    tally={totalsRow.tallyByDay[dayNumber]}
                  />
                ))}
                <TallyCell tally={totalsRow.weekTally} isBold />
              </tr>
            ))}
          </tbody>
          <tfoot className='border-t-2 border-slate-200 bg-slate-50'>
            <tr>
              <td className='sticky left-0 bg-slate-50 px-3 py-2 font-semibold text-slate-900'>
                Total
              </td>
              {WORK_DAYS.map((dayNumber) => (
                <TallyCell
                  key={dayNumber}
                  tally={columnTotals.tallyByDay[dayNumber]}
                  isBold
                />
              ))}
              <TallyCell tally={columnTotals.weekTally} isBold />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

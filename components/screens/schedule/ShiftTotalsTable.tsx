"use client";
import { logicHours, type BreakRule } from "../../../lib/hours";
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

// How many shifts of one kind are on one day, and the hours they add up to.
interface DayTally {
  shiftCount: number;
  hours: number;
}

// One row of the totals table: a shift name as scheduled, with its tally for each day and for the week.
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

// Adds one shift's hours to a tally. Returns nothing; the tally is changed in place.
function addToTally(tally: DayTally, shiftHours: number): void {
  tally.shiftCount += 1;
  tally.hours += shiftHours;
}

// Groups the week's scheduled shifts by name and counts them per day.
// Hours use the same rule as the labor matrix, so the totals match "Hours scheduled" there.
// Returns the rows ordered openers, others, then closers, each by earliest start and then name.
export function buildShiftTotalsRows(
  data: Snapshot,
  breakSettings: BreakRule,
): ShiftTotalsRow[] {
  const shiftKindOf = shiftKindFinder(
    data.shift_templates,
    data.settings.closing_time,
  );
  const rowsByName = new Map<string, ShiftTotalsRow>();
  for (const scheduledShift of data.schedule) {
    let totalsRow = rowsByName.get(scheduledShift.name);
    if (!totalsRow) {
      totalsRow = {
        shiftName: scheduledShift.name,
        shiftKind: shiftKindOf(scheduledShift),
        earliestStartMinutes: minutesOfDay(scheduledShift.start),
        tallyByDay: emptyTallyByDay(),
        weekTally: { shiftCount: 0, hours: 0 },
      };
      rowsByName.set(scheduledShift.name, totalsRow);
    }
    const shiftHours = logicHours(
      scheduledShift.start,
      scheduledShift.end,
      breakSettings,
    );
    totalsRow.earliestStartMinutes = Math.min(
      totalsRow.earliestStartMinutes,
      minutesOfDay(scheduledShift.start),
    );
    const dayTally = totalsRow.tallyByDay[scheduledShift.day];
    if (dayTally) addToTally(dayTally, shiftHours);
    addToTally(totalsRow.weekTally, shiftHours);
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

// The "Shift totals" table: how many of each shift are scheduled on each day of the week, with hours,
// a week total column and a totals row. Shift names are colored as openers, closers or other.
export function ShiftTotalsTable({
  data,
  breakSettings,
}: {
  data: Snapshot;
  // The break rule from the report, so the hours match the labor matrix.
  breakSettings: BreakRule;
}) {
  const totalsRows = buildShiftTotalsRows(data, breakSettings);
  if (totalsRows.length === 0) return null;
  const columnTotals = sumTotalsRows(totalsRows);
  const headerCellClass =
    "px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <>
      <h2 className='mb-1 mt-8 text-sm font-semibold text-slate-700'>
        Shift totals
      </h2>
      <p className='mb-2 text-xs text-slate-500'>
        How many of each shift are scheduled each day, with their hours.
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

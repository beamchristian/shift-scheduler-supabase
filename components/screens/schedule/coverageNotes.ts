import type { Report } from "../../../lib/report";
import type { Snapshot } from "../../../lib/types";
import { DAY_FULL_NAMES, WORK_DAYS, roundTo2 } from "../../../lib/ui/format";

// Builds the warning sentences shown above the labor matrix:
// team hours that don't add up, days whose required hours exceed their weight, and days with more
// people needed than employees on the list.
export function buildCoverageNotes(data: Snapshot, report: Report): string[] {
  const requiredHoursByDay: Record<number, number> = Object.fromEntries(
    report.days.map((dayRow) => [dayRow.day, dayRow.req]),
  );
  const requiredHoursTotal = report.totals.req;
  const minimumHoursTotal = data.employees.reduce(
    (runningTotal, employee) => runningTotal + Number(employee.min_hours),
    0,
  );
  const maximumHoursTotal = data.employees.reduce(
    (runningTotal, employee) => runningTotal + Number(employee.max_hours),
    0,
  );
  const coverageNotes: string[] = [];

  if (requiredHoursTotal > maximumHoursTotal)
    coverageNotes.push(
      `Your team's maximum hours total ${roundTo2(maximumHoursTotal)}, which is less than the ${roundTo2(requiredHoursTotal)} needed. Add staff or raise max hours.`,
    );
  if (minimumHoursTotal > requiredHoursTotal)
    coverageNotes.push(
      `Your team's minimum hours total ${roundTo2(minimumHoursTotal)}, more than the ${roundTo2(requiredHoursTotal)} the shifts need. Add shifts or lower some minimums.`,
    );

  // A day needs more hours than its weight allows (a small tolerance avoids rounding noise).
  for (const dayRow of report.days)
    if ((requiredHoursByDay[dayRow.day] || 0) > dayRow.allowed + 0.01)
      coverageNotes.push(
        `${DAY_FULL_NAMES[dayRow.day]} shifts need ${roundTo2(requiredHoursByDay[dayRow.day] || 0)} hrs but its day weight allows ${roundTo2(dayRow.allowed)}. Required shifts are still filled as long as the weekly total fits.`,
      );

  // A day needs more people than the team has.
  for (const dayNumber of WORK_DAYS)
    if ((report.heads[dayNumber] || 0) > data.employees.length)
      coverageNotes.push(
        `${DAY_FULL_NAMES[dayNumber]} needs ${report.heads[dayNumber]} people but you only have ${data.employees.length} employees.`,
      );

  return coverageNotes;
}

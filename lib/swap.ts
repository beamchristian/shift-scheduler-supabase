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

// Full day names, indexed by day number (1 = Monday).
const FULL_DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Converts "HH:MM" into minutes since midnight, so times can be compared.
const minutesOfDay = (timeText: string): number => {
  const [hourText, minuteText] = timeText.split(":");
  return +hourText * 60 + +minuteText;
};

// Formats "HH:MM" as a 12-hour time for messages, for example "6:30 AM".
const twelveHourTime = (timeText: string) => {
  const [hourOf24, minuteOf60] = timeText.split(":").map(Number);
  return `${hourOf24 % 12 || 12}:${String(minuteOf60).padStart(2, "0")} ${hourOf24 >= 12 ? "PM" : "AM"}`;
};

// Describes a scheduled shift for a message, for example "Close 2:00 PM to 10:00 PM".
const describeShift = (scheduleRow: ScheduleRow) =>
  `${scheduleRow.name} ${twelveHourTime(scheduleRow.start)} to ${twelveHourTime(scheduleRow.end)}`;

// One possible swap. It is either two people trading a closing shift and a non-closing shift on the same day,
// or a closer being replaced by someone who is off that day.
type SwapMove = {
  closingShift: ScheduleRow;
  oldCloser: Employee;
  otherShift?: ScheduleRow;
  newCloser: Employee;
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
  const departmentSnapshot = await snapshot(departmentId);
  const settings: Settings = departmentSnapshot.settings;
  const breakSettings = breakRule(settings);
  // Scheduled length of a shift, using the same hours logic as the generator.
  const shiftLength = (scheduleOrTime: { start: string; end: string }) =>
    logicHours(scheduleOrTime.start, scheduleOrTime.end, breakSettings);
  // Closing time for each day of the week, keyed by day number.
  const closingTimeByDay: Record<number, string> = Object.fromEntries(
    departmentSnapshot.store_hours.map((storeHour: StoreHour) => [storeHour.day, storeHour.close]),
  );
  const employees: Employee[] = departmentSnapshot.employees;
  const templateById = new Map(departmentSnapshot.shift_templates.map((template) => [template.id, template]));
  const scheduleRows: ScheduleRow[] = departmentSnapshot.schedule;
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const dayName = FULL_DAY_NAMES[day];

  if (!closingTimeByDay[day])
    return { ok: false, message: `No store hours are set for ${dayName}.` };
  // A row is a closing shift when it ends at or after the store's closing time.
  const isClosingRow = (scheduleRow: ScheduleRow) =>
    !!closingTimeByDay[scheduleRow.day] &&
    minutesOfDay(scheduleRow.end) >= minutesOfDay(closingTimeByDay[scheduleRow.day]);
  const rowsForDay = scheduleRows.filter((scheduleRow) => scheduleRow.day === day);
  const closingRowsForDay = rowsForDay.filter(isClosingRow);
  if (!closingRowsForDay.length)
    return {
      ok: false,
      message: `There are no closing shifts scheduled on ${dayName}. Generate a schedule first.`,
    };

  // Total hours and closes for each person across the whole week.
  const hoursByEmployee = new Map<number, number>();
  const closesByEmployee = new Map<number, number>();
  for (const scheduleRow of scheduleRows) {
    hoursByEmployee.set(
      scheduleRow.employee_id,
      (hoursByEmployee.get(scheduleRow.employee_id) ?? 0) + shiftLength(scheduleRow),
    );
    if (isClosingRow(scheduleRow))
      closesByEmployee.set(
        scheduleRow.employee_id,
        (closesByEmployee.get(scheduleRow.employee_id) ?? 0) + 1,
      );
  }
  // Whether a person may take this row's shift: the hard rules allow it and they are available.
  const canTakeShift = (employee: Employee, scheduleRow: ScheduleRow) => {
    const template = templateById.get(scheduleRow.template_id);
    return !!template && allowedFor(employee, template) && availStatus(employee, template).ok;
  };
  // The people already working on this day.
  const peopleWorkingDay = new Set(rowsForDay.map((scheduleRow) => scheduleRow.employee_id));
  // A person's current weekly hours.
  const hoursOf = (employee: Employee) => hoursByEmployee.get(employee.id) ?? 0;
  // Whether the person lacks the skill this row's shift requires.
  const lacksSkillForRow = (employee: Employee, scheduleRow: ScheduleRow) => {
    const template = templateById.get(scheduleRow.template_id);
    return !!template && lacksSkill(employee, template);
  };
  const possibleMoves: SwapMove[] = [];

  for (const closingRow of closingRowsForDay) {
    const currentCloser = employeeById.get(closingRow.employee_id);
    if (!currentCloser) continue;

    // Option 1: trade with someone working a non-closing shift the same day.
    for (const otherRow of rowsForDay) {
      const otherPerson = employeeById.get(otherRow.employee_id);
      if (
        !otherPerson ||
        isClosingRow(otherRow) ||
        otherPerson.id === currentCloser.id ||
        !canTakeShift(currentCloser, otherRow) ||
        !canTakeShift(otherPerson, closingRow)
      )
        continue;
      const closerHoursAfterTrade = hoursOf(currentCloser) - shiftLength(closingRow) + shiftLength(otherRow);
      const otherHoursAfterTrade = hoursOf(otherPerson) - shiftLength(otherRow) + shiftLength(closingRow);
      if (
        closerHoursAfterTrade > currentCloser.max_hours + 1e-9 ||
        otherHoursAfterTrade > otherPerson.max_hours + 1e-9
      )
        continue;
      // Lower scores are better. Penalties are added for breaking closing limits, minimum hours and skills.
      let score = 0;
      if ((closesByEmployee.get(otherPerson.id) ?? 0) + 1 > limitFor(otherPerson, settings.max_closes)) score += 100;
      if (closerHoursAfterTrade < currentCloser.min_hours - 1e-9) score += 5;
      if (otherHoursAfterTrade < otherPerson.min_hours - 1e-9) score += 5;
      if (lacksSkillForRow(currentCloser, otherRow)) score += 50;
      if (lacksSkillForRow(otherPerson, closingRow)) score += 50;
      possibleMoves.push({
        closingShift: closingRow,
        oldCloser: currentCloser,
        otherShift: otherRow,
        newCloser: otherPerson,
        score,
      });
    }

    // Option 2: replace the closer with someone who is off that day.
    for (const candidate of employees) {
      if (
        peopleWorkingDay.has(candidate.id) ||
        !canTakeShift(candidate, closingRow) ||
        hoursOf(candidate) + shiftLength(closingRow) > candidate.max_hours + 1e-9
      )
        continue;
      let score = 10;
      if ((closesByEmployee.get(candidate.id) ?? 0) + 1 > limitFor(candidate, settings.max_closes)) score += 100;
      if (hoursOf(currentCloser) - shiftLength(closingRow) < currentCloser.min_hours - 1e-9) score += 5;
      if (lacksSkillForRow(candidate, closingRow)) score += 50;
      possibleMoves.push({
        closingShift: closingRow,
        oldCloser: currentCloser,
        newCloser: candidate,
        score,
      });
    }
  }

  if (!possibleMoves.length)
    return {
      ok: false,
      message: `No swap is possible on ${dayName}. Everyone else who could close is unavailable, already at their max hours, or restricted from that shift.`,
    };
  // Pick at random among the best-scoring moves, so pressing the button again gives a different result.
  const bestScore = Math.min(...possibleMoves.map((move) => move.score));
  const bestMoves = possibleMoves.filter((move) => move.score === bestScore);
  const chosenMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];

  await transaction(async (transactionQuery) => {
    // Each update also checks the row belongs to this department, as a second safeguard.
    await transactionQuery("update schedule set employee_id=$1 where id=$2 and department_id=$3", [
      chosenMove.newCloser.id,
      chosenMove.closingShift.id,
      departmentId,
    ]);
    if (chosenMove.otherShift)
      await transactionQuery("update schedule set employee_id=$1 where id=$2 and department_id=$3", [
        chosenMove.oldCloser.id,
        chosenMove.otherShift.id,
        departmentId,
      ]);
  });

  // Notes for the person when the new closer or the traded person is not tagged for the shift's skill.
  const closingTemplate = templateById.get(chosenMove.closingShift.template_id);
  const otherTemplate = chosenMove.otherShift
    ? templateById.get(chosenMove.otherShift.template_id)
    : undefined;
  const skillNotes = [
    closingTemplate && lacksSkill(chosenMove.newCloser, closingTemplate)
      ? `${chosenMove.newCloser.name} isn't tagged for ${closingTemplate.skill}`
      : "",
    chosenMove.otherShift && otherTemplate && lacksSkill(chosenMove.oldCloser, otherTemplate)
      ? `${chosenMove.oldCloser.name} isn't tagged for ${otherTemplate.skill}`
      : "",
  ].filter(Boolean);
  const skillNote = skillNotes.length ? ` Note: ${skillNotes.join(" and ")}.` : "";
  const closingLimitWarning =
    chosenMove.score >= 100
      ? ` This puts ${chosenMove.newCloser.name} over their closing limit, because no other option fit.`
      : "";
  return {
    ok: true,
    message: chosenMove.otherShift
      ? `${dayName}: ${chosenMove.newCloser.name} now closes (${describeShift(chosenMove.closingShift)}) and ${chosenMove.oldCloser.name} takes ${describeShift(chosenMove.otherShift)}.${closingLimitWarning}${skillNote}`
      : `${dayName}: ${chosenMove.newCloser.name} now closes (${describeShift(chosenMove.closingShift)}) in place of ${chosenMove.oldCloser.name}, who is off that day.${closingLimitWarning}${skillNote}`,
  };
}

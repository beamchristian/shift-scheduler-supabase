import { snapshot, transaction } from "./db";
import { avgRate, dailySales, dayBudget } from "./matrix";
import { repair, searchFullCover } from "./solver";
import { breakRule, logicHours, t12 } from "./hours";
import {
  allowedFor,
  availStatus,
  closingTimesByDay,
  isClosingTime,
  limitFor,
  norm,
} from "./rules";
import { explainUnfilledShift } from "./unfilledReason";
import type { Employee, Settings, ShiftTemplate } from "./types";

// Short day names for messages. Index 1 is Monday.
const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Converts "HH:MM" into minutes since midnight, so times can be compared.
const minutesOfDay = (timeText: string): number => {
  const [hourText, minuteText] = timeText.split(":");
  return +hourText * 60 + +minuteText;
};

// A person while the schedule is being built. Adds the running totals for this week.
type EmployeeWorkingState = Employee & {
  hoursThisWeek: number;
  daysWorked: Set<number>;
  skillTags: string[];
  closesThisWeek: number;
};

// One suggestion for fixing a shortfall, shown to the person.
export interface Suggestion {
  title: string;
  detail: string;
}

// The result of a build or a dry run. Lists every problem found and how well the team covers the shifts.
export interface Plan {
  warnings: string[];
  unfilled: string[];
  // One line per open shift, naming what stopped each person who could have worked it.
  unfilledReasons: string[];
  underMin: string[];
  capacity: number;
  needed: number;
  suggestions: Suggestion[];
  config: string[];
}

// Builds the schedule for one department.
// shouldSave = true builds and saves the schedule, using the payroll budget.
// shouldSave = false is a dry run with no payroll limit. It checks whether the team can cover every required shift.
// departmentId decides whose data is read and whose schedule is replaced.
async function plan(shouldSave: boolean, departmentId: number): Promise<Plan> {
  const departmentSnapshot = await snapshot(departmentId);
  const settings: Settings = departmentSnapshot.settings;
  const breakSettings = breakRule(settings);

  // All hour accounting (budget, min and max hours) uses shift hours, or paid hours if that setting is on.
  const shiftLength = (shiftTemplate: ShiftTemplate) =>
    logicHours(shiftTemplate.start, shiftTemplate.end, breakSettings);

  // One day-weight row per day. If a day appears twice, the last row wins.
  const storeHourByDay = Object.fromEntries(
    departmentSnapshot.store_hours.map((storeHour) => [
      storeHour.day,
      storeHour,
    ]),
  );
  const storeHourList = Object.values(storeHourByDay);

  const employees: EmployeeWorkingState[] = departmentSnapshot.employees.map(
    (employee) => ({
      ...employee,
      hoursThisWeek: 0,
      closesThisWeek: 0,
      daysWorked: new Set<number>(),
      skillTags: (employee.skills || "")
        .toLowerCase()
        .split(",")
        .map((skillName) => skillName.trim())
        .filter(Boolean),
    }),
  );
  // Shift templates in the order they were created.
  const shiftTemplates: ShiftTemplate[] = [
    ...departmentSnapshot.shift_templates,
  ].sort((first, second) => first.id - second.id);
  const warnings: string[] = [];
  const unfilledDescriptions: string[] = [];
  const unfilledSlotTemplates: ShiftTemplate[] = [];
  // Keys of people and days already warned about unreadable availability, so each warning shows once.
  const unreadableAvailabilityKeys = new Set<string>();

  // Payroll budget: the hourly rate, and the hours each day and the whole week can use.
  const hourlyRate = avgRate(settings);
  if (shouldSave && !(hourlyRate > 0))
    warnings.push(
      "Set the average hourly rate in Settings so payroll can be calculated.",
    );
  const dailySalesByDay = dailySales(storeHourList, settings);
  const dailyHourBudget: Record<number, number> = {};
  const scheduledHoursByDay: Record<number, number> = {};
  for (const storeHour of storeHourList) {
    dailyHourBudget[storeHour.day] = dayBudget(
      dailySalesByDay[storeHour.day],
      settings,
      hourlyRate,
    ).hours;
    scheduledHoursByDay[storeHour.day] = 0;
  }
  const weeklyHourBudget = Object.values(dailyHourBudget).reduce(
    (runningTotal, dayHours) => runningTotal + dayHours,
    0,
  );
  let weekHours = 0;
  // Average shift length, used to favor part-timers on shorter shifts. Set once the slots are known.
  let averageShiftLength = 10;

  // A closing shift runs to the day's latest template end time. The weekly closing limit is a preference, not a hard rule.
  const closingTimes = closingTimesByDay(shiftTemplates);
  const isClosingShift = (shiftTemplate: ShiftTemplate) =>
    isClosingTime(closingTimes, shiftTemplate.day, shiftTemplate.end);
  const closingLimitOf = (employee: EmployeeWorkingState): number =>
    limitFor(employee, settings.max_closes);

  // Assignments are collected in memory and saved at the end, so the repair pass can still move them around.
  const placedAssignments: {
    template: ShiftTemplate;
    employee: EmployeeWorkingState;
  }[] = [];
  // Records one shift on a person: their hours, day, closes, and the assignment list.
  const applyAssignment = (
    employee: EmployeeWorkingState,
    shiftTemplate: ShiftTemplate,
  ) => {
    const lengthOfShift = shiftLength(shiftTemplate);
    employee.hoursThisWeek += lengthOfShift;
    employee.daysWorked.add(shiftTemplate.day);
    scheduledHoursByDay[shiftTemplate.day] += lengthOfShift;
    weekHours += lengthOfShift;
    if (isClosingShift(shiftTemplate)) employee.closesThisWeek++;
    placedAssignments.push({ template: shiftTemplate, employee });
  };

  // Whether a person is available for a shift. Warns once about availability text that cannot be read.
  // Availability and restrictions come from rules.ts, the same rules the swap button uses.
  const isAvailable = (
    employee: EmployeeWorkingState,
    shiftTemplate: ShiftTemplate,
  ): boolean => {
    const availabilityResult = availStatus(employee, shiftTemplate);
    if (availabilityResult.bad && shouldSave) {
      const warningKey = `${employee.name}|${shiftTemplate.day}`;
      if (!unreadableAvailabilityKeys.has(warningKey)) {
        unreadableAvailabilityKeys.add(warningKey);
        warnings.push(
          `Could not read ${employee.name}'s availability for ${DAY_LABELS[shiftTemplate.day]} ("${availabilityResult.bad}"), so it was treated as any time.`,
        );
      }
    }
    return availabilityResult.ok;
  };
  // True when the person may work this shift: the hard rules allow it and they are available.
  const canWorkShift = (
    employee: EmployeeWorkingState,
    shiftTemplate: ShiftTemplate,
  ): boolean =>
    allowedFor(employee, shiftTemplate) && isAvailable(employee, shiftTemplate);

  // People who could take a shift right now: not already working that day, with hours to spare, and allowed.
  const candidatePeople = (shiftTemplate: ShiftTemplate) =>
    employees.filter(
      (employee) =>
        !employee.daysWorked.has(shiftTemplate.day) &&
        employee.hoursThisWeek + shiftLength(shiftTemplate) <=
          employee.max_hours &&
        canWorkShift(employee, shiftTemplate),
    );

  // Picks the best person for a shift and records it. Returns the person, or null if nobody fits or the budget is used up.
  // required = true for shifts that must be covered. False for extra shifts, which must stay within the day's budget.
  const placeShift = (
    shiftTemplate: ShiftTemplate,
    isRequired: boolean,
  ): EmployeeWorkingState | null => {
    const lengthOfShift = shiftLength(shiftTemplate);
    const requiredSkill = (shiftTemplate.skill || "").toLowerCase().trim();
    if (shouldSave) {
      if (weekHours + lengthOfShift > weeklyHourBudget + 1e-9) return null;
      if (
        !isRequired &&
        scheduledHoursByDay[shiftTemplate.day] + lengthOfShift >
          dailyHourBudget[shiftTemplate.day]
      )
        return null;
    }
    // Score each candidate. The highest score is picked.
    const bestCandidate = candidatePeople(shiftTemplate)
      .map((employee) => {
        let score =
          Math.max(0, employee.min_hours - employee.hoursThisWeek) * 2 -
          employee.hoursThisWeek;
        if (requiredSkill && employee.skillTags.includes(requiredSkill))
          score += 100;
        // Part-timers are favored for shorter shifts, full-timers for longer ones.
        score +=
          (employee.type === "PT" ? 1 : -1) *
          (averageShiftLength - lengthOfShift) *
          20;
        if (employee.type === "FT") score += 5;
        // Spread closing shifts around, and avoid going past the closing limit.
        if (isClosingShift(shiftTemplate)) {
          score -= employee.closesThisWeek * 15;
          if (employee.closesThisWeek >= closingLimitOf(employee))
            score -= 1000;
        }
        return { employee, score };
      })
      .sort((first, second) => second.score - first.score)[0];
    if (!bestCandidate) return null;
    applyAssignment(bestCandidate.employee, shiftTemplate);
    return bestCandidate.employee;
  };

  // Phase 1: required shifts. Always place the slot with the fewest possible people next,
  // so hard-to-cover shifts (like busy Saturdays) are not left with whoever is left over.
  const slots: ShiftTemplate[] = [];
  for (const shiftTemplate of shiftTemplates) {
    if (
      shouldSave &&
      (minutesOfDay(shiftTemplate.start) <
        minutesOfDay(settings.earliest_start) ||
        minutesOfDay(shiftTemplate.start) > minutesOfDay(settings.latest_start))
    )
      warnings.push(
        `${shiftTemplate.name} on ${DAY_LABELS[shiftTemplate.day]} starts outside your allowed start window.`,
      );
    // One slot for each person the shift needs.
    for (
      let personNumber = 0;
      personNumber < shiftTemplate.needed;
      personNumber++
    )
      slots.push(shiftTemplate);
  }
  // Busiest days first, and skill-tagged shifts before untagged ones.
  slots.sort(
    (first, second) =>
      first.day - second.day || (second.skill ? 1 : 0) - (first.skill ? 1 : 0),
  );
  averageShiftLength = slots.length
    ? slots.reduce(
        (runningTotal, slot) => runningTotal + shiftLength(slot),
        0,
      ) / slots.length
    : 10;

  // For each slot, the index of the person working it, or -1 when it is open.
  const assignedEmployeeBySlot: number[] = new Array(slots.length).fill(-1);
  const pendingSlotIndexes = slots.map((_, slotIndex) => slotIndex);
  while (pendingSlotIndexes.length) {
    // Choose the pending slot with the fewest candidates. Ties go to skill-tagged shifts, then shorter shifts.
    let chosenPendingPosition = 0;
    let fewestCandidates = Infinity;
    pendingSlotIndexes.forEach((slotIndex, pendingPosition) => {
      const slotBeingChecked = slots[slotIndex];
      const currentChoice = slots[pendingSlotIndexes[chosenPendingPosition]];
      const candidateCount = candidatePeople(slotBeingChecked).length;
      if (
        candidateCount < fewestCandidates ||
        (candidateCount === fewestCandidates &&
          slotBeingChecked.skill &&
          !currentChoice.skill) ||
        (candidateCount === fewestCandidates &&
          !!slotBeingChecked.skill === !!currentChoice.skill &&
          shiftLength(slotBeingChecked) < shiftLength(currentChoice))
      ) {
        fewestCandidates = candidateCount;
        chosenPendingPosition = pendingPosition;
      }
    });
    const chosenSlotIndex = pendingSlotIndexes.splice(
      chosenPendingPosition,
      1,
    )[0];
    const chosenEmployee = placeShift(slots[chosenSlotIndex], true);
    assignedEmployeeBySlot[chosenSlotIndex] = chosenEmployee
      ? employees.indexOf(chosenEmployee)
      : -1;
  }

  // Second pass: if the first pass left shifts open, move shifts between people to make room for them.
  const allowedMatrix = employees.map((employee) =>
    slots.map((slot) => canWorkShift(employee, slot)),
  );
  const openSlotIndexes = assignedEmployeeBySlot.flatMap(
    (holderIndex, slotIndex) => (holderIndex < 0 ? [slotIndex] : []),
  );
  if (openSlotIndexes.length)
    repair(
      slots.map((slot) => ({ day: slot.day, len: shiftLength(slot) })),
      employees.map((employee) => Number(employee.max_hours)),
      allowedMatrix,
      assignedEmployeeBySlot,
      openSlotIndexes,
      shouldSave ? weeklyHourBudget - weekHours : Infinity,
    );

  // Last resort for coverage: if shifts are still open, search every combination for a schedule that covers more.
  // Some weeks only work when several people's shifts are reshuffled together, which the repair above can't do.
  if (assignedEmployeeBySlot.some((holderIndex) => holderIndex < 0))
    searchFullCover(
      slots.map((slot) => ({ day: slot.day, len: shiftLength(slot) })),
      employees.map((employee) => Number(employee.max_hours)),
      allowedMatrix,
      assignedEmployeeBySlot,
      shouldSave ? weeklyHourBudget : Infinity,
      {
        minHours: employees.map((employee) => Number(employee.min_hours)),
        closingLimits: employees.map(closingLimitOf),
        isClosingSlot: slots.map(isClosingShift),
      },
    );

  // Third pass: improve the schedule without changing which shifts are covered. It moves a shift to someone else,
  // or swaps two people on the same day, whenever that lowers closes over someone's limit (a preference)
  // or hours below someone's minimum.
  const isClosingSlotFlags = slots.map(isClosingShift);
  const slotHours = slots.map(shiftLength);
  const maxHoursByEmployee = employees.map((employee) =>
    Number(employee.max_hours),
  );
  const minHoursByEmployee = employees.map((employee) =>
    Number(employee.min_hours),
  );
  const closingLimits = employees.map(closingLimitOf);
  // Total penalty for the current assignment. Lower is better.
  const totalPenalty = (): number => {
    const hoursByPerson = employees.map(() => 0);
    const closesByPerson = employees.map(() => 0);
    assignedEmployeeBySlot.forEach((holderIndex, slotIndex) => {
      if (holderIndex >= 0) {
        hoursByPerson[holderIndex] += slotHours[slotIndex];
        if (isClosingSlotFlags[slotIndex]) closesByPerson[holderIndex]++;
      }
    });
    return employees.reduce(
      (runningPenalty, _, personIndex) =>
        runningPenalty +
        1000 *
          Math.max(
            0,
            closesByPerson[personIndex] - closingLimits[personIndex],
          ) +
        Math.max(
          0,
          minHoursByEmployee[personIndex] - hoursByPerson[personIndex],
        ),
      0,
    );
  };
  // Total hours a person is working right now.
  const hoursOfEmployee = (personIndex: number) =>
    assignedEmployeeBySlot.reduce(
      (runningHours, holderIndex, slotIndex) =>
        runningHours + (holderIndex === personIndex ? slotHours[slotIndex] : 0),
      0,
    );
  // Whether a person already has a shift on a given day.
  const employeeBusyOnDay = (personIndex: number, day: number) =>
    assignedEmployeeBySlot.some(
      (holderIndex, slotIndex) =>
        holderIndex === personIndex && slots[slotIndex].day === day,
    );
  let bestPenalty = totalPenalty();
  for (let passCount = 0; passCount < 300; passCount++) {
    let bestMove: (() => void) | null = null;
    let bestPenaltyForMove = bestPenalty;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const currentHolderIndex = assignedEmployeeBySlot[slotIndex];
      if (currentHolderIndex < 0) continue;
      for (
        let otherPersonIndex = 0;
        otherPersonIndex < employees.length;
        otherPersonIndex++
      ) {
        if (
          otherPersonIndex === currentHolderIndex ||
          !allowedMatrix[otherPersonIndex][slotIndex]
        )
          continue;
        // Option A: hand this shift to the other person, if they are free that day.
        if (
          !employeeBusyOnDay(otherPersonIndex, slots[slotIndex].day) &&
          hoursOfEmployee(otherPersonIndex) + slotHours[slotIndex] <=
            maxHoursByEmployee[otherPersonIndex] + 1e-9
        ) {
          assignedEmployeeBySlot[slotIndex] = otherPersonIndex;
          const penaltyIfMoved = totalPenalty();
          assignedEmployeeBySlot[slotIndex] = currentHolderIndex;
          if (penaltyIfMoved < bestPenaltyForMove - 1e-9) {
            bestPenaltyForMove = penaltyIfMoved;
            bestMove = () => {
              assignedEmployeeBySlot[slotIndex] = otherPersonIndex;
            };
          }
        }
        // Option B: swap with the shift the other person works that same day.
        const swapSlotIndex = slots.findIndex(
          (slot, candidateSlotIndex) =>
            assignedEmployeeBySlot[candidateSlotIndex] === otherPersonIndex &&
            slot.day === slots[slotIndex].day,
        );
        if (
          swapSlotIndex >= 0 &&
          allowedMatrix[currentHolderIndex][swapSlotIndex] &&
          hoursOfEmployee(currentHolderIndex) -
            slotHours[slotIndex] +
            slotHours[swapSlotIndex] <=
            maxHoursByEmployee[currentHolderIndex] + 1e-9 &&
          hoursOfEmployee(otherPersonIndex) -
            slotHours[swapSlotIndex] +
            slotHours[slotIndex] <=
            maxHoursByEmployee[otherPersonIndex] + 1e-9
        ) {
          assignedEmployeeBySlot[slotIndex] = otherPersonIndex;
          assignedEmployeeBySlot[swapSlotIndex] = currentHolderIndex;
          const penaltyIfSwapped = totalPenalty();
          assignedEmployeeBySlot[slotIndex] = currentHolderIndex;
          assignedEmployeeBySlot[swapSlotIndex] = otherPersonIndex;
          if (penaltyIfSwapped < bestPenaltyForMove - 1e-9) {
            bestPenaltyForMove = penaltyIfSwapped;
            bestMove = () => {
              assignedEmployeeBySlot[slotIndex] = otherPersonIndex;
              assignedEmployeeBySlot[swapSlotIndex] = currentHolderIndex;
            };
          }
        }
      }
    }
    if (!bestMove) break;
    (bestMove as () => void)();
    bestPenalty = bestPenaltyForMove;
  }

  // Rebuild hours, days and closes from the final assignment.
  for (const employee of employees) {
    employee.hoursThisWeek = 0;
    employee.closesThisWeek = 0;
    employee.daysWorked.clear();
  }
  for (const dayKey of Object.keys(scheduledHoursByDay))
    scheduledHoursByDay[+dayKey] = 0;
  weekHours = 0;
  placedAssignments.length = 0;
  slots.forEach((slot, slotIndex) => {
    if (assignedEmployeeBySlot[slotIndex] >= 0)
      applyAssignment(employees[assignedEmployeeBySlot[slotIndex]], slot);
  });
  // The required shift a person works on a given day, or null when they are free that day.
  const requiredShiftOnDay = (personIndex: number, day: number) => {
    const heldSlotIndex = slots.findIndex(
      (slot, slotIndex) =>
        assignedEmployeeBySlot[slotIndex] === personIndex && slot.day === day,
    );
    return heldSlotIndex >= 0 ? slots[heldSlotIndex] : null;
  };
  // Explains an open shift by naming what stopped each person who could have worked it.
  const explainOpenSlot = (slot: ShiftTemplate) =>
    explainUnfilledShift(
      slot,
      employees.map((employee, personIndex) => ({
        employee,
        hoursThisWeek: employee.hoursThisWeek,
        shiftOnSameDay: requiredShiftOnDay(personIndex, slot.day),
      })),
      shiftLength(slot),
    );
  const unfilledReasons = new Set<string>();

  // Report every shift that is still open, with the reason it is open.
  slots.forEach((slot, slotIndex) => {
    const slotLabel = `${slot.name} on ${DAY_LABELS[slot.day]}`;
    if (assignedEmployeeBySlot[slotIndex] < 0) {
      const isOverWeeklyBudget =
        shouldSave && weekHours + shiftLength(slot) > weeklyHourBudget + 1e-9;
      const reason = isOverWeeklyBudget
        ? `The weekly hour budget of ${weeklyHourBudget.toFixed(1)} is used up.`
        : explainOpenSlot(slot);
      const slotWithTimes = `${slotLabel}, ${t12(slot.start)} to ${t12(slot.end)}`;
      warnings.push(`Unfilled: ${slotWithTimes}. ${reason}`);
      unfilledReasons.add(`${slotWithTimes}. ${reason}`);
      unfilledDescriptions.push(slotLabel);
      unfilledSlotTemplates.push(slot);
    } else if (shouldSave) {
      const requiredSkill = (slot.skill || "").toLowerCase().trim();
      const holder = employees[assignedEmployeeBySlot[slotIndex]];
      if (requiredSkill && !holder.skillTags.includes(requiredSkill))
        warnings.push(
          `${slotLabel} needs "${requiredSkill}" but ${holder.name} isn't tagged for it.`,
        );
    }
  });

  // Phase 2: extra shifts up to each day's budget. The next one goes to the day with the most unused budget.
  if (
    shouldSave &&
    (settings.fill_extra == null || Number(settings.fill_extra) !== 0)
  ) {
    const shiftsByDay: Record<number, ShiftTemplate[]> = {};
    for (const shiftTemplate of shiftTemplates)
      (shiftsByDay[shiftTemplate.day] ||= []).push(shiftTemplate);
    // Where to start looking next time, for each day, so the same shift is not always tried first.
    const rotationByDay: Record<number, number> = {};
    let madeProgress = true;
    while (madeProgress) {
      madeProgress = false;
      const daysByRemainingBudget = Object.keys(shiftsByDay)
        .map(Number)
        .sort(
          (first, second) =>
            dailyHourBudget[second] -
            scheduledHoursByDay[second] -
            (dailyHourBudget[first] - scheduledHoursByDay[first]),
        );
      for (const day of daysByRemainingBudget) {
        const shiftsOnDay = shiftsByDay[day];
        for (let offset = 0; offset < shiftsOnDay.length; offset++) {
          const shiftToTry =
            shiftsOnDay[
              ((rotationByDay[day] || 0) + offset) % shiftsOnDay.length
            ];
          if (placeShift(shiftToTry, false)) {
            rotationByDay[day] =
              ((rotationByDay[day] || 0) + offset + 1) % shiftsOnDay.length;
            madeProgress = true;
            break;
          }
        }
        if (madeProgress) break;
      }
    }
  }

  // Warn about anyone who closes more nights than their limit.
  if (shouldSave)
    for (const employee of employees)
      if (employee.closesThisWeek > closingLimitOf(employee))
        warnings.push(
          `${employee.name} closes ${employee.closesThisWeek} nights, over their limit of ${closingLimitOf(employee)}. It could not be lowered without breaking availability, max hours or another rule.`,
        );

  if (shouldSave) {
    await transaction(async (transactionQuery) => {
      // Replace only this department's schedule. Other departments are not touched.
      await transactionQuery("delete from schedule where department_id = $1", [
        departmentId,
      ]);
      if (placedAssignments.length) {
        // Each new schedule row also records the department it belongs to.
        const columnsPerRow = 7;
        const parameterValues = placedAssignments.flatMap(
          ({ template, employee }) => [
            template.day,
            template.id,
            employee.id,
            template.name,
            template.start,
            template.end,
            departmentId,
          ],
        );
        const placeholderGroups = placedAssignments
          .map(
            (_, rowIndex) =>
              `(${Array.from({ length: columnsPerRow }, (_column, columnIndex) => `$${rowIndex * columnsPerRow + columnIndex + 1}`).join(",")})`,
          )
          .join(",");
        await transactionQuery(
          `insert into schedule (day, template_id, employee_id, name, "start", "end", department_id) values ${placeholderGroups}`,
          parameterValues,
        );
      }
    });
  }

  // People who finish the week below their minimum hours.
  const underMinimumHours = employees
    .filter((employee) => employee.hoursThisWeek < employee.min_hours)
    .map(
      (employee) =>
        `${employee.name} (${employee.hoursThisWeek}/${employee.min_hours} hrs)`,
    );
  if (shouldSave)
    for (const underMinimumText of underMinimumHours)
      warnings.push(
        `${underMinimumText.replace(" (", " is under their minimum hours (")}.`,
      );

  // Dry run only: suggestions for fixing what could not be covered.
  const suggestions: Suggestion[] = [];
  if (!shouldSave) {
    const shortestShiftLength = slots.length
      ? Math.min(...slots.map(shiftLength))
      : 0;
    if (unfilledSlotTemplates.length) {
      // 1. Raise max hours: the cheapest raise for each open shift, counting raises already assumed.
      // virtualState tracks hours and days as if the suggested shifts were already given out.
      const virtualState = new Map(
        employees.map((employee) => [
          employee.id,
          { hours: employee.hoursThisWeek, days: new Set(employee.daysWorked) },
        ]),
      );
      const raisesByEmployee = new Map<
        number,
        { to: number; slots: string[] }
      >();
      let coveredCount = 0;
      for (const slot of unfilledSlotTemplates) {
        const lengthOfShift = shiftLength(slot);
        const cheapestChoice = employees
          .filter(
            (employee) =>
              !virtualState.get(employee.id)!.days.has(slot.day) &&
              canWorkShift(employee, slot),
          )
          .map((employee) => ({
            employee,
            hoursToRaise: Math.max(
              0,
              virtualState.get(employee.id)!.hours +
                lengthOfShift -
                (raisesByEmployee.get(employee.id)?.to ?? employee.max_hours),
            ),
          }))
          .sort(
            (first, second) =>
              first.hoursToRaise - second.hoursToRaise ||
              first.employee.id - second.employee.id,
          )[0];
        if (!cheapestChoice) continue;
        const chosenState = virtualState.get(cheapestChoice.employee.id)!;
        chosenState.hours += lengthOfShift;
        chosenState.days.add(slot.day);
        coveredCount++;
        const raise = raisesByEmployee.get(cheapestChoice.employee.id) ?? {
          to: cheapestChoice.employee.max_hours,
          slots: [],
        };
        raise.to = Math.max(raise.to, chosenState.hours);
        raise.slots.push(`${slot.name} on ${DAY_LABELS[slot.day]}`);
        raisesByEmployee.set(cheapestChoice.employee.id, raise);
      }
      const raisedEmployees = employees.filter(
        (employee) =>
          (raisesByEmployee.get(employee.id)?.to ?? 0) > employee.max_hours,
      );
      if (raisedEmployees.length) {
        const extraHoursTotal = raisedEmployees.reduce(
          (runningTotal, employee) =>
            runningTotal +
            raisesByEmployee.get(employee.id)!.to -
            employee.max_hours,
          0,
        );
        suggestions.push({
          title: `Raise max hours (covers ${coveredCount} of ${unfilledSlotTemplates.length} open shifts, adds ${+extraHoursTotal.toFixed(1)} hrs, about $${(extraHoursTotal * hourlyRate).toFixed(0)})`,
          detail:
            raisedEmployees
              .map(
                (employee) =>
                  `${employee.name} from ${employee.max_hours} to ${+raisesByEmployee.get(employee.id)!.to.toFixed(1)} to take ${raisesByEmployee.get(employee.id)!.slots.join(" and ")}`,
              )
              .join("; ") + ".",
        });
      }
      // 2. Ask people to open up their availability.
      const availabilityAskList = [
        ...new Set(
          unfilledSlotTemplates
            .map((slot) => {
              const namesMarkedUnavailable = employees
                .filter(
                  (employee) =>
                    !employee.daysWorked.has(slot.day) &&
                    employee.hoursThisWeek + shiftLength(slot) <=
                      employee.max_hours &&
                    allowedFor(employee, slot) &&
                    !isAvailable(employee, slot),
                )
                .map((employee) => employee.name);
              return namesMarkedUnavailable.length
                ? `${slot.name} on ${DAY_LABELS[slot.day]}: ${namesMarkedUnavailable.slice(0, 3).join(", ")}`
                : "";
            })
            .filter(Boolean),
        ),
      ];
      if (availabilityAskList.length)
        suggestions.push({
          title: "Ask about availability",
          detail: `These people have hours left but are marked unavailable. ${availabilityAskList.join("; ")}.`,
        });
      // 2b. Loosen a restriction: people who are free, but excluded by a rule or a missing skill tag.
      const restrictionLoosenList = [
        ...new Set(
          unfilledSlotTemplates
            .map((slot) => {
              const namesExcludedByRule = employees
                .filter(
                  (employee) =>
                    !employee.daysWorked.has(slot.day) &&
                    employee.hoursThisWeek + shiftLength(slot) <=
                      employee.max_hours &&
                    isAvailable(employee, slot) &&
                    !allowedFor(employee, slot),
                )
                .map((employee) => employee.name);
              return namesExcludedByRule.length
                ? `${slot.name} on ${DAY_LABELS[slot.day]}: ${namesExcludedByRule.slice(0, 3).join(", ")}`
                : "";
            })
            .filter(Boolean),
        ),
      ];
      if (restrictionLoosenList.length)
        suggestions.push({
          title: "Loosen a restriction or tag a skill",
          detail: `These people are free and have hours left but are excluded by a restriction or by not having the required skill tag. ${restrictionLoosenList.join("; ")}.`,
        });
      // 3. Lower the headcount of the shifts that could not be filled.
      const headcountCuts = new Map<
        number,
        { template: ShiftTemplate; count: number }
      >();
      for (const slot of unfilledSlotTemplates)
        headcountCuts.set(slot.id, {
          template: slot,
          count: (headcountCuts.get(slot.id)?.count ?? 0) + 1,
        });
      suggestions.push({
        title: "Lower headcount",
        detail:
          [...headcountCuts.values()]
            .map(
              ({ template, count }) =>
                `${template.name} on ${DAY_LABELS[template.day]} from ${template.needed} to ${template.needed - count}`,
            )
            .join("; ") + ".",
      });
      // 4. Hire. A full-time person covers about four or five shifts a week.
      suggestions.push({
        title: "Add staff",
        detail: `You are ${unfilledSlotTemplates.length} shifts short. One more full-time employee covers about 4 to 5 shifts a week, so roughly ${Math.ceil(unfilledSlotTemplates.length / 4)} more would do it.`,
      });
    }
    // 5. Short shifts for hours that are left over.
    const strandedHours = employees
      .map((employee) => ({
        employee,
        freeHours: employee.max_hours - employee.hoursThisWeek,
      }))
      .filter(
        (stranded) =>
          stranded.freeHours >= 2 && stranded.freeHours < shortestShiftLength,
      );
    if (
      strandedHours.length &&
      (unfilledSlotTemplates.length || underMinimumHours.length)
    )
      suggestions.push({
        title: "Add a short shift",
        detail: `${strandedHours.map((stranded) => `${stranded.employee.name} (${+stranded.freeHours.toFixed(1)} hrs)`).join(", ")} have hours left under their max, but less than a full shift. A short shift template of up to ${Math.floor(Math.max(...strandedHours.map((stranded) => stranded.freeHours)))} hrs would put those hours to use.`,
      });
    // 6. Minimum hours that cannot be reached.
    if (underMinimumHours.length)
      suggestions.push({
        title: "Minimum hours",
        detail: `${underMinimumHours.join(", ")} cannot reach their minimum with the current shifts. Lower those minimums to what is reachable, widen their availability, or add shorter shifts.`,
      });
  }

  // Setup problems that do not depend on the schedule itself: names that match nobody, and skills nobody has.
  const configProblems: string[] = [];
  const employeeNamesLower = employees.map((employee) =>
    employee.name.toLowerCase().trim(),
  );
  for (const shiftTemplate of shiftTemplates)
    for (const restrictedName of norm(shiftTemplate.only_for))
      if (!employeeNamesLower.includes(restrictedName))
        configProblems.push(
          `${shiftTemplate.name} on ${DAY_LABELS[shiftTemplate.day]} is restricted to "${restrictedName}", but no employee has that name.`,
        );
  const templateNamesLower = shiftTemplates.map((shiftTemplate) =>
    shiftTemplate.name.toLowerCase().trim(),
  );
  for (const employee of employees)
    for (const limitedShiftName of norm(employee.shifts))
      if (!templateNamesLower.includes(limitedShiftName))
        configProblems.push(
          `${employee.name} is limited to "${limitedShiftName}", but no shift template has that name.`,
        );
  for (const shiftTemplate of shiftTemplates) {
    const requiredSkill = (shiftTemplate.skill || "").toLowerCase().trim();
    if (
      requiredSkill &&
      !employees.some((employee) => employee.skillTags.includes(requiredSkill))
    )
      configProblems.push(
        `${shiftTemplate.name} on ${DAY_LABELS[shiftTemplate.day]} requires the skill "${requiredSkill}", but no employee is tagged with it.`,
      );
  }
  const uniqueConfigProblems = [...new Set(configProblems)];
  if (shouldSave) warnings.push(...uniqueConfigProblems);

  // How many of the required shifts the team can actually cover.
  const capacity = slots.length - unfilledSlotTemplates.length;

  return {
    warnings,
    unfilled: unfilledDescriptions,
    unfilledReasons: [...unfilledReasons],
    underMin: underMinimumHours,
    capacity,
    needed: slots.length,
    suggestions,
    config: uniqueConfigProblems,
  };
}

// Builds and saves the schedule for one department. Returns the warnings to show the person.
export async function generate(departmentId: number): Promise<string[]> {
  return (await plan(true, departmentId)).warnings;
}

// Checks one department's staffing without saving anything.
export function preview(departmentId: number): Promise<Plan> {
  return plan(false, departmentId);
}

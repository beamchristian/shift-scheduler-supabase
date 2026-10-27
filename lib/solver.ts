// One shift that needs filling: the day it is on (1 = Monday) and how many hours it lasts.
export interface Slot {
  day: number;
  len: number;
}

// Preferences for the full search, by person index. They only decide which person is tried first;
// they never stop a person from being chosen.
export interface SearchPreferences {
  minHours: number[];
  closingLimits: number[];
  isClosingSlot: boolean[];
}

// Searches for an assignment that covers more shifts than the current one, trying every combination
// until it finds one that covers them all or runs out of steps. This catches schedules that need several
// people's weeks reshuffled together, which the one-move-at-a-time repair below cannot find.
// Respects the same hard rules: allowedMatrix, one shift per person per day, max hours, and the hour budget.
// Replaces assignedEmployeeBySlot in place only when the search covers more shifts. Returns true when it did.
//
// shiftSlots: every shift that needs filling.
// maxHours: the most hours each person may work, by person index.
// allowedMatrix[person][slot]: true when that person may work that shift.
// assignedEmployeeBySlot[slot]: the current assignment, or -1. Updated in place on success.
// hourBudget: the most hours the whole assignment may use (Infinity for none).
// preferences: who to try first, so the result starts close to minimums and closing limits.
// stepLimit and timeLimitMs: when to stop looking, so a hard or very large week can't stall the request.
export function searchFullCover(
  shiftSlots: Slot[],
  maxHours: number[],
  allowedMatrix: boolean[][],
  assignedEmployeeBySlot: number[],
  hourBudget: number,
  preferences: SearchPreferences,
  stepLimit = 400000,
  timeLimitMs = 1500,
): boolean {
  const stopAt = Date.now() + timeLimitMs;
  let isOutOfTime = false;
  const HOURS_TOLERANCE = 1e-9;
  const employeeCount = maxHours.length;
  const slotCount = shiftSlots.length;
  const currentlyCovered = assignedEmployeeBySlot.filter(
    (holderIndex) => holderIndex >= 0,
  ).length;
  if (currentlyCovered === slotCount) return false;

  // Running state for the search: each person's hours, closes and days, and the hours used overall.
  const hoursByEmployee = new Array(employeeCount).fill(0);
  const closesByEmployee = new Array(employeeCount).fill(0);
  const daysByEmployee = Array.from(
    { length: employeeCount },
    () => new Set<number>(),
  );
  const trialAssignment = new Array(slotCount).fill(-1);
  let hoursUsed = 0;
  let bestCovered = currentlyCovered;
  let bestAssignment: number[] | null = null;
  let stepCount = 0;

  // True when the person may take the slot given everything assigned so far.
  const canTake = (slotIndex: number, employeeIndex: number) =>
    allowedMatrix[employeeIndex][slotIndex] &&
    !daysByEmployee[employeeIndex].has(shiftSlots[slotIndex].day) &&
    hoursByEmployee[employeeIndex] + shiftSlots[slotIndex].len <=
      maxHours[employeeIndex] + HOURS_TOLERANCE &&
    hoursUsed + shiftSlots[slotIndex].len <= hourBudget + HOURS_TOLERANCE;

  // Lower is tried first: people still under their minimum, then people with closes to spare, then the least busy.
  const tryOrderScore = (slotIndex: number, employeeIndex: number) => {
    const hoursShort = Math.max(
      0,
      preferences.minHours[employeeIndex] - hoursByEmployee[employeeIndex],
    );
    const overClosingLimit =
      preferences.isClosingSlot[slotIndex] &&
      closesByEmployee[employeeIndex] >=
        preferences.closingLimits[employeeIndex];
    return (
      (overClosingLimit ? 1000 : 0) -
      hoursShort +
      hoursByEmployee[employeeIndex] / 100
    );
  };

  // Gives a slot to a person, or takes it back, keeping the running state in step.
  const place = (
    slotIndex: number,
    employeeIndex: number,
    direction: 1 | -1,
  ) => {
    const slotLength = shiftSlots[slotIndex].len * direction;
    hoursByEmployee[employeeIndex] += slotLength;
    hoursUsed += slotLength;
    if (preferences.isClosingSlot[slotIndex])
      closesByEmployee[employeeIndex] += direction;
    if (direction === 1)
      daysByEmployee[employeeIndex].add(shiftSlots[slotIndex].day);
    else daysByEmployee[employeeIndex].delete(shiftSlots[slotIndex].day);
    trialAssignment[slotIndex] = direction === 1 ? employeeIndex : -1;
  };

  // Tries to cover the remaining slots. Always works on the slot with the fewest people able to take it,
  // and gives up on a branch as soon as it can no longer beat the best result so far.
  const search = (remainingSlots: number[], coveredSoFar: number): void => {
    // Reading the clock every step is slow, so it is checked every thousand steps.
    if (++stepCount % 1000 === 0 && Date.now() > stopAt) isOutOfTime = true;
    if (isOutOfTime || stepCount > stepLimit || bestCovered === slotCount)
      return;
    if (coveredSoFar > bestCovered) {
      bestCovered = coveredSoFar;
      bestAssignment = [...trialAssignment];
    }
    if (
      !remainingSlots.length ||
      coveredSoFar + remainingSlots.length <= bestCovered
    )
      return;

    let chosenPosition = 0;
    let chosenCandidates: number[] = [];
    let fewestCandidates = Infinity;
    remainingSlots.forEach((slotIndex, position) => {
      const candidates: number[] = [];
      for (
        let employeeIndex = 0;
        employeeIndex < employeeCount;
        employeeIndex++
      )
        if (canTake(slotIndex, employeeIndex)) candidates.push(employeeIndex);
      if (candidates.length < fewestCandidates) {
        fewestCandidates = candidates.length;
        chosenPosition = position;
        chosenCandidates = candidates;
      }
    });
    const slotIndex = remainingSlots[chosenPosition];
    const otherSlots = remainingSlots.filter(
      (_, position) => position !== chosenPosition,
    );

    chosenCandidates.sort(
      (first, second) =>
        tryOrderScore(slotIndex, first) - tryOrderScore(slotIndex, second),
    );
    for (const employeeIndex of chosenCandidates) {
      place(slotIndex, employeeIndex, 1);
      search(otherSlots, coveredSoFar + 1);
      place(slotIndex, employeeIndex, -1);
      if (bestCovered === slotCount || stepCount > stepLimit || isOutOfTime)
        return;
    }
    // Leaving this slot open can still lead to a better result for the others.
    search(otherSlots, coveredSoFar);
  };

  search(
    shiftSlots.map((_, slotIndex) => slotIndex),
    0,
  );
  if (!bestAssignment) return false;
  (bestAssignment as number[]).forEach((holderIndex, slotIndex) => {
    assignedEmployeeBySlot[slotIndex] = holderIndex;
  });
  return true;
}

// Fills open shifts that the first-pass assignment could not place, using "ejection chains".
// If nobody can simply take a shift, give it to someone who is blocked only by another shift
// (on the same day, or by their max-hours limit). Move that other shift to someone else.
// Repeat up to `maxDepth` moves deep.
//
// shiftSlots: every shift that needs filling.
// maxHours: the most hours each person may work, by person index.
// allowedMatrix[person][slot]: true when that person may work that shift.
// assignedEmployeeBySlot[slot]: the person working the shift, or -1. Updated in place.
// openSlotIndexes: the shifts still to fill.
// extraHoursRoom: extra hours that may still be added across the whole schedule.
// stepLimit: the most search steps to spend on one shift, so the search always ends.
export function repair(
  shiftSlots: Slot[],
  maxHours: number[],
  allowedMatrix: boolean[][],
  assignedEmployeeBySlot: number[],
  openSlotIndexes: number[],
  extraHoursRoom: number,
  maxDepth = 7,
  stepLimit = 30000,
): void {
  const employeeCount = maxHours.length;
  // Allows for tiny rounding errors when comparing hours.
  const HOURS_TOLERANCE = 1e-9;

  // Hours each person is working right now.
  const hoursByEmployee: number[] = new Array(employeeCount).fill(0);
  // For each person and day, the shift they hold that day, or -1.
  const slotByEmployeeAndDay: number[][] = Array.from(
    { length: employeeCount },
    () => new Array(8).fill(-1),
  );
  shiftSlots.forEach((slot, slotIndex) => {
    const holderIndex = assignedEmployeeBySlot[slotIndex];
    if (holderIndex >= 0) {
      hoursByEmployee[holderIndex] += slot.len;
      slotByEmployeeAndDay[holderIndex][slot.day] = slotIndex;
    }
  });

  // Gives a shift to a person and keeps the hour and day records up to date.
  const assignSlot = (slotIndex: number, employeeIndex: number) => {
    assignedEmployeeBySlot[slotIndex] = employeeIndex;
    hoursByEmployee[employeeIndex] += shiftSlots[slotIndex].len;
    slotByEmployeeAndDay[employeeIndex][shiftSlots[slotIndex].day] = slotIndex;
  };
  // Takes a shift away from whoever holds it and keeps the records up to date.
  const unassignSlot = (slotIndex: number) => {
    const holderIndex = assignedEmployeeBySlot[slotIndex];
    assignedEmployeeBySlot[slotIndex] = -1;
    hoursByEmployee[holderIndex] -= shiftSlots[slotIndex].len;
    slotByEmployeeAndDay[holderIndex][shiftSlots[slotIndex].day] = -1;
  };

  let stepCount = 0;
  // Tries to place one shift. Returns true when it succeeds.
  // peopleUsedInThisChain stops the search from looping back to someone already moved.
  const tryFillSlot = (
    slotIndex: number,
    depthLeft: number,
    peopleUsedInThisChain: Set<number>,
  ): boolean => {
    stepCount++;
    if (stepCount > stepLimit) return false;
    const { day: slotDay, len: slotLength } = shiftSlots[slotIndex];
    const candidatePeople: number[] = [];
    for (let employeeIndex = 0; employeeIndex < employeeCount; employeeIndex++)
      if (
        allowedMatrix[employeeIndex][slotIndex] &&
        !peopleUsedInThisChain.has(employeeIndex)
      )
        candidatePeople.push(employeeIndex);

    // First choice: someone free that day, with hours to spare.
    for (const employeeIndex of candidatePeople) {
      if (
        slotByEmployeeAndDay[employeeIndex][slotDay] < 0 &&
        hoursByEmployee[employeeIndex] + slotLength <=
          maxHours[employeeIndex] + HOURS_TOLERANCE
      ) {
        assignSlot(slotIndex, employeeIndex);
        return true;
      }
    }
    if (depthLeft === 0) return false;

    // Second choice: someone already has another shift that day. Move that shift to someone else.
    for (const employeeIndex of candidatePeople) {
      const otherSlotIndex = slotByEmployeeAndDay[employeeIndex][slotDay];
      if (
        otherSlotIndex < 0 ||
        hoursByEmployee[employeeIndex] -
          shiftSlots[otherSlotIndex].len +
          slotLength >
          maxHours[employeeIndex] + HOURS_TOLERANCE
      )
        continue;
      unassignSlot(otherSlotIndex);
      assignSlot(slotIndex, employeeIndex);
      peopleUsedInThisChain.add(employeeIndex);
      const otherShiftPlaced = tryFillSlot(
        otherSlotIndex,
        depthLeft - 1,
        peopleUsedInThisChain,
      );
      peopleUsedInThisChain.delete(employeeIndex);
      if (otherShiftPlaced) return true;
      unassignSlot(slotIndex);
      assignSlot(otherSlotIndex, employeeIndex);
    }

    // Third choice: someone free that day but at their max hours. Give up one of their other shifts.
    for (const employeeIndex of candidatePeople) {
      if (slotByEmployeeAndDay[employeeIndex][slotDay] >= 0) continue;
      for (let otherDay = 1; otherDay <= 7; otherDay++) {
        const otherSlotIndex = slotByEmployeeAndDay[employeeIndex][otherDay];
        if (
          otherSlotIndex < 0 ||
          hoursByEmployee[employeeIndex] -
            shiftSlots[otherSlotIndex].len +
            slotLength >
            maxHours[employeeIndex] + HOURS_TOLERANCE
        )
          continue;
        unassignSlot(otherSlotIndex);
        assignSlot(slotIndex, employeeIndex);
        peopleUsedInThisChain.add(employeeIndex);
        const otherShiftPlaced = tryFillSlot(
          otherSlotIndex,
          depthLeft - 1,
          peopleUsedInThisChain,
        );
        peopleUsedInThisChain.delete(employeeIndex);
        if (otherShiftPlaced) return true;
        unassignSlot(slotIndex);
        assignSlot(otherSlotIndex, employeeIndex);
      }
    }
    return false;
  };

  // Try each open shift, starting with short chains and going deeper only when needed.
  for (const openSlotIndex of openSlotIndexes) {
    if (shiftSlots[openSlotIndex].len > extraHoursRoom + HOURS_TOLERANCE)
      continue;
    for (let chainDepth = 0; chainDepth <= maxDepth; chainDepth++) {
      stepCount = 0;
      if (tryFillSlot(openSlotIndex, chainDepth, new Set())) {
        extraHoursRoom -= shiftSlots[openSlotIndex].len;
        break;
      }
    }
  }
}

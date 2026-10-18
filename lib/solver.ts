// One shift that needs filling: the day it is on (1 = Monday) and how many hours it lasts.
export interface Slot {
  day: number;
  len: number;
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

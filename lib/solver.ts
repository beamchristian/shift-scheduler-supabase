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
// Respects the same hard rules: allowedMatrix, one shift per person per day, max hours, max days, and the hour budget.
// Replaces assignedEmployeeBySlot in place only when the search covers more shifts. Returns true when it did.
//
// shiftSlots: every shift that needs filling.
// maxHours: the most hours each person may work, by person index.
// maxDays: the most days each person may work, by person index (Infinity for no limit).
// allowedMatrix[person][slot]: true when that person may work that shift.
// assignedEmployeeBySlot[slot]: the current assignment, or -1. Updated in place on success.
// hourBudget: the most hours the whole assignment may use (Infinity for none).
// preferences: who to try first, so the result starts close to minimums and closing limits.
// stepLimit and timeLimitMs: when to stop looking, so a hard or very large week can't stall the request.
export function searchFullCover(
  shiftSlots: Slot[],
  maxHours: number[],
  maxDays: number[],
  allowedMatrix: boolean[][],
  assignedEmployeeBySlot: number[],
  hourBudget: number,
  preferences: SearchPreferences,
  stepLimit = 400000,
  timeLimitMs = 1500,
): boolean {
  const currentlyCovered = assignedEmployeeBySlot.filter(
    (holderIndex) => holderIndex >= 0,
  ).length;
  if (currentlyCovered === shiftSlots.length) return false;
  return searchAssignment(
    shiftSlots,
    maxHours,
    maxDays,
    allowedMatrix,
    assignedEmployeeBySlot,
    hourBudget,
    preferences,
    { closingLimitsAreHard: false, coverageToBeat: currentlyCovered },
    stepLimit,
    timeLimitMs,
  );
}

// Searches for an assignment that covers at least as many shifts as the current one while keeping
// everyone within their closing limit. The one-move-at-a-time cleanup in generate.ts gets stuck when
// taking a close off someone needs several people's weeks reshuffled at once, for example when the
// person over their limit is too close to their max hours to trade a closing shift for a longer opener.
// Same hard rules and arguments as searchFullCover. Replaces assignedEmployeeBySlot in place only when
// it finds such an assignment. Returns true when it did.
export function searchWithinClosingLimits(
  shiftSlots: Slot[],
  maxHours: number[],
  maxDays: number[],
  allowedMatrix: boolean[][],
  assignedEmployeeBySlot: number[],
  hourBudget: number,
  preferences: SearchPreferences,
  stepLimit = 400000,
  timeLimitMs = 1500,
): boolean {
  const currentlyCovered = assignedEmployeeBySlot.filter(
    (holderIndex) => holderIndex >= 0,
  ).length;
  return searchAssignment(
    shiftSlots,
    maxHours,
    maxDays,
    allowedMatrix,
    assignedEmployeeBySlot,
    hourBudget,
    preferences,
    { closingLimitsAreHard: true, coverageToBeat: currentlyCovered - 1 },
    stepLimit,
    timeLimitMs,
  );
}

// A pool of people and the shifts only they can work. No one outside a pool can work its shifts,
// and no one in it can work shifts outside it, so each pool can be searched on its own.
interface StaffingPool {
  people: number[];
  slots: number[];
}

// Splits the week into pools: people are joined whenever they can work the same shift, and each pool holds
// every shift its people can work. A department with separate counters (deli, sub shop, production) usually
// splits into a few pools. Shifts nobody can work are left out, since they can never be covered.
// Returns the pools.
function splitIntoPools(slotCount: number, allowedMatrix: boolean[][]): StaffingPool[] {
  const employeeCount = allowedMatrix.length;
  // Union-find over people: each person points toward their pool's representative.
  const parentOf = Array.from({ length: employeeCount }, (_, employeeIndex) => employeeIndex);
  const findRoot = (employeeIndex: number): number => {
    while (parentOf[employeeIndex] !== employeeIndex) {
      parentOf[employeeIndex] = parentOf[parentOf[employeeIndex]];
      employeeIndex = parentOf[employeeIndex];
    }
    return employeeIndex;
  };
  const firstAllowedBySlot = new Array(slotCount).fill(-1);
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++)
    for (let employeeIndex = 0; employeeIndex < employeeCount; employeeIndex++) {
      if (!allowedMatrix[employeeIndex][slotIndex]) continue;
      if (firstAllowedBySlot[slotIndex] < 0) firstAllowedBySlot[slotIndex] = employeeIndex;
      else parentOf[findRoot(employeeIndex)] = findRoot(firstAllowedBySlot[slotIndex]);
    }

  const poolByRoot = new Map<number, StaffingPool>();
  const poolOf = (employeeIndex: number): StaffingPool => {
    const root = findRoot(employeeIndex);
    if (!poolByRoot.has(root)) poolByRoot.set(root, { people: [], slots: [] });
    return poolByRoot.get(root)!;
  };
  for (let employeeIndex = 0; employeeIndex < employeeCount; employeeIndex++)
    poolOf(employeeIndex).people.push(employeeIndex);
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++)
    if (firstAllowedBySlot[slotIndex] >= 0) poolOf(firstAllowedBySlot[slotIndex]).slots.push(slotIndex);
  return [...poolByRoot.values()].filter((pool) => pool.slots.length > 0);
}

// The shared search behind searchFullCover and searchWithinClosingLimits.
// closingLimitsAreHard: when true, nobody may be given a close past their limit.
// coverageToBeat: a result must cover more shifts than this to replace the current assignment.
// The week is searched one pool at a time (see splitIntoPools), so a dead end at one counter isn't retried
// against every arrangement of the others. Each pool is held to the same rule as the whole week: it must
// cover more than it does now (searchFullCover), or at least as many (searchWithinClosingLimits).
// Returns true when assignedEmployeeBySlot was changed.
function searchAssignment(
  shiftSlots: Slot[],
  maxHours: number[],
  maxDays: number[],
  allowedMatrix: boolean[][],
  assignedEmployeeBySlot: number[],
  hourBudget: number,
  preferences: SearchPreferences,
  searchRules: { closingLimitsAreHard: boolean; coverageToBeat: number },
  stepLimit: number,
  timeLimitMs: number,
): boolean {
  const stopAt = Date.now() + timeLimitMs;
  const currentlyCovered = assignedEmployeeBySlot.filter((holderIndex) => holderIndex >= 0).length;
  // How far each pool's result may sit from its current coverage: 0 means it must cover more,
  // -1 means it must cover at least as many.
  const coverageAllowance = searchRules.coverageToBeat - currentlyCovered;
  let stepsLeft = stepLimit;
  let didChange = false;

  for (const pool of splitIntoPools(shiftSlots.length, allowedMatrix)) {
    const poolCovered = pool.slots.filter((slotIndex) => assignedEmployeeBySlot[slotIndex] >= 0).length;
    if (!poolNeedsSearch(pool, poolCovered, shiftSlots, assignedEmployeeBySlot, preferences, searchRules))
      continue;
    // The pool may only use the hours the rest of the week leaves in the budget.
    const hoursOutsidePool = shiftSlots.reduce(
      (total, slot, slotIndex) =>
        assignedEmployeeBySlot[slotIndex] >= 0 && !pool.slots.includes(slotIndex) ? total + slot.len : total,
      0,
    );
    const poolResult = searchPool(
      shiftSlots,
      maxHours,
      maxDays,
      allowedMatrix,
      pool,
      hourBudget - hoursOutsidePool,
      preferences,
      { closingLimitsAreHard: searchRules.closingLimitsAreHard, coverageToBeat: poolCovered + coverageAllowance },
      stepsLeft,
      stopAt,
    );
    stepsLeft -= poolResult.stepsUsed;
    if (poolResult.assignment) {
      for (const slotIndex of pool.slots) assignedEmployeeBySlot[slotIndex] = poolResult.assignment[slotIndex];
      didChange = true;
    }
    if (stepsLeft <= 0 || Date.now() > stopAt) break;
  }
  return didChange;
}

// Whether a pool is worth searching. When looking for more coverage, a pool with every shift covered can't
// do better. When enforcing closing limits, a pool where nobody is over their limit is already fine.
// Returns true when the pool should be searched.
function poolNeedsSearch(
  pool: StaffingPool,
  poolCovered: number,
  shiftSlots: Slot[],
  assignedEmployeeBySlot: number[],
  preferences: SearchPreferences,
  searchRules: { closingLimitsAreHard: boolean },
): boolean {
  if (!searchRules.closingLimitsAreHard) return poolCovered < pool.slots.length;
  const closesByEmployee = new Map<number, number>();
  for (const slotIndex of pool.slots) {
    const holderIndex = assignedEmployeeBySlot[slotIndex];
    if (holderIndex >= 0 && preferences.isClosingSlot[slotIndex])
      closesByEmployee.set(holderIndex, (closesByEmployee.get(holderIndex) ?? 0) + 1);
  }
  return [...closesByEmployee].some(([employeeIndex, closes]) => closes > preferences.closingLimits[employeeIndex]);
}

// A set of people and the shifts that only those people can work.
interface PeopleGroup {
  people: number[];
  // Shift indexes, shortest shift first, so the hours bound can count the cheapest shifts first.
  slots: number[];
}

// Builds one group for each distinct set of people allowed on some of the pool's shifts. A group's shifts are
// every pool shift whose allowed people all belong to that group, for example the closes only four Sub Shop
// people can work. Returns the groups.
function buildPeopleGroups(
  shiftSlots: Slot[],
  allowedMatrix: boolean[][],
  pool: StaffingPool,
): PeopleGroup[] {
  const allowedPeopleBySlot = new Map<number, number[]>();
  for (const slotIndex of pool.slots)
    allowedPeopleBySlot.set(
      slotIndex,
      pool.people.filter((employeeIndex) => allowedMatrix[employeeIndex][slotIndex]),
    );
  const distinctPeopleSets = new Map<string, number[]>();
  allowedPeopleBySlot.forEach((allowedPeople) => distinctPeopleSets.set(allowedPeople.join(","), allowedPeople));

  return [...distinctPeopleSets.values()].map((groupPeople) => {
    const isInGroup = new Set(groupPeople);
    const groupSlots = pool.slots
      .filter((slotIndex) => allowedPeopleBySlot.get(slotIndex)!.every((employeeIndex) => isInGroup.has(employeeIndex)))
      .sort((first, second) => shiftSlots[first].len - shiftSlots[second].len);
    return { people: groupPeople, slots: groupSlots };
  });
}

// Searches one pool for an assignment of its shifts that covers more than coverageToBeat.
// Everyone in the pool starts the search with no shifts, which is right because they can't work outside it.
// Returns the best assignment found (only the pool's slots matter), or null, and how many steps it used.
function searchPool(
  shiftSlots: Slot[],
  maxHours: number[],
  maxDays: number[],
  allowedMatrix: boolean[][],
  pool: StaffingPool,
  hourBudget: number,
  preferences: SearchPreferences,
  searchRules: { closingLimitsAreHard: boolean; coverageToBeat: number },
  stepLimit: number,
  stopAt: number,
): { assignment: number[] | null; stepsUsed: number } {
  let isOutOfTime = false;
  const HOURS_TOLERANCE = 1e-9;
  const employeeCount = maxHours.length;
  const slotCount = shiftSlots.length;
  const poolSlotCount = pool.slots.length;

  // Running state for the search: each person's hours, closes and days, and the hours used overall.
  const hoursByEmployee = new Array(employeeCount).fill(0);
  const closesByEmployee = new Array(employeeCount).fill(0);
  const daysByEmployee = Array.from(
    { length: employeeCount },
    () => new Set<number>(),
  );
  const trialAssignment = new Array(slotCount).fill(-1);
  let hoursUsed = 0;
  let bestCovered = searchRules.coverageToBeat;
  let bestAssignment: number[] | null = null;
  let stepCount = 0;

  // True when the person may take the slot given everything assigned so far.
  const canTake = (slotIndex: number, employeeIndex: number) =>
    allowedMatrix[employeeIndex][slotIndex] &&
    !daysByEmployee[employeeIndex].has(shiftSlots[slotIndex].day) &&
    daysByEmployee[employeeIndex].size < maxDays[employeeIndex] &&
    hoursByEmployee[employeeIndex] + shiftSlots[slotIndex].len <=
      maxHours[employeeIndex] + HOURS_TOLERANCE &&
    hoursUsed + shiftSlots[slotIndex].len <= hourBudget + HOURS_TOLERANCE &&
    !(
      searchRules.closingLimitsAreHard &&
      preferences.isClosingSlot[slotIndex] &&
      closesByEmployee[employeeIndex] >=
        preferences.closingLimits[employeeIndex]
    );

  // Lower is tried first: people still under their minimum, then people with closes to spare, then the least busy.
  // Among those, people with the fewest other shifts they could still take go first: giving a morning-only
  // person the morning shift keeps the flexible people free for the closes only they can work.
  const tryOrderScore = (
    slotIndex: number,
    employeeIndex: number,
    remainingSlots: number[],
  ) => {
    const hoursShort = Math.max(
      0,
      preferences.minHours[employeeIndex] - hoursByEmployee[employeeIndex],
    );
    const overClosingLimit =
      preferences.isClosingSlot[slotIndex] &&
      closesByEmployee[employeeIndex] >=
        preferences.closingLimits[employeeIndex];
    const otherOptions = remainingSlots.filter(
      (otherSlotIndex) => otherSlotIndex !== slotIndex && canTake(otherSlotIndex, employeeIndex),
    ).length;
    return (
      (overClosingLimit ? 1000 : 0) +
      otherOptions -
      hoursShort / 100 +
      hoursByEmployee[employeeIndex] / 10000
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

  const peopleGroups = buildPeopleGroups(shiftSlots, allowedMatrix, pool);
  const isRemainingSlot = new Uint8Array(slotCount);

  // How many of a group's remaining shifts can't be covered, whatever happens next. Two limits apply:
  // each person works one shift a day, and the group's shifts must fit in the hours its people have left.
  // Returns the larger of the two shortfalls.
  const groupShortfall = (group: PeopleGroup): number => {
    const remainingByDay = new Map<number, number>();
    let remainingCount = 0;
    for (const slotIndex of group.slots) {
      if (!isRemainingSlot[slotIndex]) continue;
      remainingCount++;
      const day = shiftSlots[slotIndex].day;
      remainingByDay.set(day, (remainingByDay.get(day) ?? 0) + 1);
    }
    if (!remainingCount) return 0;

    let dayShortfall = 0;
    remainingByDay.forEach((shiftsThatDay, day) => {
      const peopleFreeThatDay = group.people.filter(
        (employeeIndex) =>
          !daysByEmployee[employeeIndex].has(day) &&
          daysByEmployee[employeeIndex].size < maxDays[employeeIndex],
      ).length;
      dayShortfall += Math.max(0, shiftsThatDay - peopleFreeThatDay);
    });

    // Hours left across the group, never more than the budget allows. Counting the shortest
    // shifts first gives the most shifts those hours could possibly cover.
    let hoursLeft = group.people.reduce(
      (total, employeeIndex) =>
        total + Math.max(0, maxHours[employeeIndex] - hoursByEmployee[employeeIndex]),
      0,
    );
    hoursLeft = Math.min(hoursLeft, hourBudget - hoursUsed);
    let coverableCount = 0;
    for (const slotIndex of group.slots) {
      if (!isRemainingSlot[slotIndex]) continue;
      hoursLeft -= shiftSlots[slotIndex].len;
      if (hoursLeft < -HOURS_TOLERANCE) break;
      coverableCount++;
    }
    return Math.max(dayShortfall, remainingCount - coverableCount);
  };

  // The most shifts this branch could still cover: everything covered so far and everything remaining,
  // less the largest shortfall of any one group. Groups overlap, so their shortfalls can't be added together.
  const coverageUpperBound = (remainingSlots: number[], coveredSoFar: number): number => {
    isRemainingSlot.fill(0);
    for (const slotIndex of remainingSlots) isRemainingSlot[slotIndex] = 1;
    let largestShortfall = 0;
    for (const group of peopleGroups)
      largestShortfall = Math.max(largestShortfall, groupShortfall(group));
    return coveredSoFar + remainingSlots.length - largestShortfall;
  };

  // Tries to cover the remaining slots. Always works on the slot with the fewest people able to take it,
  // and gives up on a branch as soon as it can no longer beat the best result so far. Tight weeks, where
  // a few people are close to their max hours, need the group bound to give up on dead ends early enough.
  const search = (remainingSlots: number[], coveredSoFar: number): void => {
    // Reading the clock every step is slow, so it is checked every thousand steps.
    if (++stepCount % 1000 === 0 && Date.now() > stopAt) isOutOfTime = true;
    if (isOutOfTime || stepCount > stepLimit || bestCovered === poolSlotCount)
      return;
    if (coveredSoFar > bestCovered) {
      bestCovered = coveredSoFar;
      bestAssignment = [...trialAssignment];
    }
    if (
      !remainingSlots.length ||
      coveredSoFar + remainingSlots.length <= bestCovered ||
      coverageUpperBound(remainingSlots, coveredSoFar) <= bestCovered
    )
      return;

    let chosenPosition = 0;
    let chosenCandidates: number[] = [];
    let fewestCandidates = Infinity;
    remainingSlots.forEach((slotIndex, position) => {
      const candidates = pool.people.filter((employeeIndex) => canTake(slotIndex, employeeIndex));
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

    const scoreByCandidate = new Map(
      chosenCandidates.map((employeeIndex) => [
        employeeIndex,
        tryOrderScore(slotIndex, employeeIndex, remainingSlots),
      ]),
    );
    chosenCandidates.sort(
      (first, second) => scoreByCandidate.get(first)! - scoreByCandidate.get(second)!,
    );
    for (const employeeIndex of chosenCandidates) {
      place(slotIndex, employeeIndex, 1);
      search(otherSlots, coveredSoFar + 1);
      place(slotIndex, employeeIndex, -1);
      if (bestCovered === poolSlotCount || stepCount > stepLimit || isOutOfTime)
        return;
    }
    // Leaving this slot open can still lead to a better result for the others.
    search(otherSlots, coveredSoFar);
  };

  search([...pool.slots], 0);
  return { assignment: bestAssignment, stepsUsed: stepCount };
}

// Fills open shifts that the first-pass assignment could not place, using "ejection chains".
// If nobody can simply take a shift, give it to someone who is blocked only by another shift
// (on the same day, or by their max-hours limit). Move that other shift to someone else.
// Repeat up to `maxDepth` moves deep.
//
// shiftSlots: every shift that needs filling.
// maxHours: the most hours each person may work, by person index.
// maxDays: the most days each person may work, by person index (Infinity for no limit).
// allowedMatrix[person][slot]: true when that person may work that shift.
// assignedEmployeeBySlot[slot]: the person working the shift, or -1. Updated in place.
// openSlotIndexes: the shifts still to fill.
// extraHoursRoom: extra hours that may still be added across the whole schedule.
// stepLimit: the most search steps to spend on one shift, so the search always ends.
export function repair(
  shiftSlots: Slot[],
  maxHours: number[],
  maxDays: number[],
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

  // How many days a person is working right now.
  const daysWorked = (employeeIndex: number) =>
    slotByEmployeeAndDay[employeeIndex].filter((slotIndex) => slotIndex >= 0).length;

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

    // First choice: someone free that day, with hours and days to spare.
    // The third choice below covers someone at their max days, by moving one of their other shifts away.
    for (const employeeIndex of candidatePeople) {
      if (
        slotByEmployeeAndDay[employeeIndex][slotDay] < 0 &&
        daysWorked(employeeIndex) < maxDays[employeeIndex] &&
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

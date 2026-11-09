"use client";
import { useEffect, useRef, useState } from "react";
import { clockHours } from "../../lib/hours";
import { shiftKindFinder, type ShiftKind } from "../../lib/rules";
import type { ShiftTemplate, Snapshot } from "../../lib/types";
import {
  DAY_FULL_NAMES,
  DAY_SHORT_LABELS,
  WORK_DAYS,
  asTableRows,
  formatTime12,
  minutesOfDay,
  roundTo2,
  shiftChipClasses,
  splitCommaList,
} from "../../lib/ui/format";
import { cardClass } from "../../lib/ui/styles";
import { EditableTable } from "../EditableTable/EditableTable";
import type { ColumnDefinition, TableRow } from "../types";
import { Heading } from "../ui/Heading";

// Which days the screen shows: one day, or every day in its own section.
type DayChoice = number | "all";

// Columns of the shift template table. The day column is a dropdown showing short day names,
// so a shift can still be moved to another day; it then shows up under that day.
// The required skill is a dropdown of the skills on the Team page; blank means anyone can work the shift.
const buildShiftColumns = (skillChoices: string[]): ColumnDefinition[] => [
  { key: "name", label: "Shift", cellClassName: "min-w-[10rem]" },
  {
    key: "day",
    label: "Day",
    options: WORK_DAYS,
    formatOption: (dayValue) => DAY_SHORT_LABELS[Number(dayValue)],
  },
  { key: "start", label: "Start", inputType: "time" },
  { key: "end", label: "End", inputType: "time" },
  { key: "needed", label: "People needed", inputType: "number" },
  {
    key: "skill",
    label: "Required skill",
    options: skillChoices,
    cellClassName: "min-w-[8rem]",
    formatOption: (skillValue) =>
      skillValue === "" ? "None" : String(skillValue),
  },
  {
    key: "only_for",
    label: "Only for (blank = anyone)",
    cellClassName: "min-w-[9rem]",
  },
];

// Words shown inside the time chip, so openers and closers can be told apart without relying on color.
const KIND_LABELS: Record<ShiftKind, string> = {
  open: "Open",
  close: "Close",
  other: "",
};

// Returns one day's templates, ordered by start time, then end time, then name.
function templatesForDay(
  shiftTemplates: ShiftTemplate[],
  dayNumber: number,
): ShiftTemplate[] {
  return shiftTemplates
    .filter((shiftTemplate) => Number(shiftTemplate.day) === dayNumber)
    .sort(
      (firstTemplate, secondTemplate) =>
        minutesOfDay(firstTemplate.start) - minutesOfDay(secondTemplate.start) ||
        minutesOfDay(firstTemplate.end) - minutesOfDay(secondTemplate.end) ||
        firstTemplate.name.localeCompare(secondTemplate.name),
    );
}

// Adds up how many people a list of templates needs. Returns the total.
function totalPeopleNeeded(shiftTemplates: ShiftTemplate[]): number {
  return shiftTemplates.reduce(
    (runningTotal, shiftTemplate) => runningTotal + (Number(shiftTemplate.needed) || 0),
    0,
  );
}

// The colored time chip at the start of each row: "6:00 AM – 2:00 PM", with the shift length under it.
// Amber is an opener, indigo a closer, green anything else, matching the schedule.
function ShiftTimeSummary({
  shiftRow,
  shiftKind,
}: {
  shiftRow: TableRow;
  shiftKind: ShiftKind;
}) {
  const startTime = String(shiftRow.start ?? "");
  const endTime = String(shiftRow.end ?? "");
  if (!startTime || !endTime) return null;
  const kindLabel = KIND_LABELS[shiftKind];
  return (
    <div className='flex flex-col items-start gap-0.5'>
      <span
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${shiftChipClasses(shiftKind)}`}
      >
        {kindLabel && (
          <span className='font-semibold uppercase tracking-wide'>{kindLabel}</span>
        )}
        {formatTime12(startTime)} – {formatTime12(endTime)}
      </span>
      <span className='text-xs tabular-nums text-slate-500'>
        {roundTo2(clockHours(startTime, endTime))} h
      </span>
    </div>
  );
}

// The row of day buttons at the top: one per day with its shift count, plus "All days".
function DayPicker({
  shiftTemplates,
  chosenDay,
  onChooseDay,
}: {
  shiftTemplates: ShiftTemplate[];
  chosenDay: DayChoice;
  onChooseDay: (dayChoice: DayChoice) => void;
}) {
  const choices: DayChoice[] = [...WORK_DAYS, "all"];
  return (
    <div className='mb-4 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap' role='tablist'>
      {choices.map((dayChoice) => {
        const isChosen = dayChoice === chosenDay;
        const templateCount =
          dayChoice === "all"
            ? shiftTemplates.length
            : templatesForDay(shiftTemplates, dayChoice).length;
        return (
          <button
            key={dayChoice}
            role='tab'
            aria-selected={isChosen}
            onClick={() => onChooseDay(dayChoice)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${isChosen ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {dayChoice === "all" ? "All" : DAY_SHORT_LABELS[dayChoice]}
            <span className={`ml-1.5 text-xs font-medium ${isChosen ? "text-indigo-100" : "text-slate-400"}`}>
              {templateCount}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// A small key explaining the chip colors.
function ShiftColorKey() {
  const keyEntries: { shiftKind: ShiftKind; label: string }[] = [
    { shiftKind: "open", label: "Opening" },
    { shiftKind: "other", label: "Mid / other" },
    { shiftKind: "close", label: "Closing" },
  ];
  return (
    <div className='mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500'>
      {keyEntries.map((keyEntry) => (
        <span
          key={keyEntry.shiftKind}
          className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${shiftChipClasses(keyEntry.shiftKind)}`}
        >
          {keyEntry.label}
        </span>
      ))}
      <span>Closing means it ends at or after the closing time in Settings.</span>
    </div>
  );
}

// The Shifts screen: the shift templates, one day at a time (or all days in sections), sorted by start time.
// Each row starts with a colored 12-hour time chip so openers and closers stand out.
// Editing, duplicating, adding and removing work the same as before; each day has its own Add button.
export function ShiftsScreen({
  weekStart,
  shiftTemplates,
  employees,
  closingTime,
  onDataChange,
  highlightedId,
  onRowAdded,
}: {
  // The week on screen, as its Monday. Saves reply with that week's data.
  weekStart: string;
  shiftTemplates: Snapshot["shift_templates"];
  employees: Snapshot["employees"];
  // The department's closing time from Settings, used to tell which shifts are closers.
  closingTime: string | null | undefined;
  onDataChange: (newSnapshot: Snapshot) => void;
  highlightedId: number | null;
  onRowAdded: (newRowId: number) => void;
}) {
  const [chosenDay, setChosenDay] = useState<DayChoice>(1);

  // The highlighted row already handled, so picking another day afterwards isn't undone.
  const handledHighlightId = useRef<number | null>(null);

  // When a new or duplicated row is on a day that isn't shown, switch to that day once so it can be seen.
  useEffect(() => {
    if (!highlightedId || handledHighlightId.current === highlightedId) return;
    const highlightedTemplate = shiftTemplates.find(
      (shiftTemplate) => shiftTemplate.id === highlightedId,
    );
    if (!highlightedTemplate) return;
    handledHighlightId.current = highlightedId;
    setChosenDay((currentChoice) =>
      currentChoice === "all" ? currentChoice : Number(highlightedTemplate.day),
    );
  }, [highlightedId, shiftTemplates]);

  // The skill choices are the skills people are tagged with on the Team page, with a blank choice first.
  const teamSkillChoices = [
    "",
    ...Array.from(
      new Set(employees.flatMap((employee) => splitCommaList(employee.skills))),
    ).sort(),
  ];
  const shiftColumns = buildShiftColumns(teamSkillChoices);
  const shiftKindOf = shiftKindFinder(shiftTemplates, closingTime);
  const daysToShow = chosenDay === "all" ? WORK_DAYS : [chosenDay];

  // Shows the colored time chip for one row. Rows come from the templates, so they have every field.
  const renderTimeSummary = (shiftRow: TableRow) => (
    <ShiftTimeSummary
      shiftRow={shiftRow}
      shiftKind={shiftKindOf({
        day: Number(shiftRow.day),
        start: String(shiftRow.start ?? "00:00"),
        end: String(shiftRow.end ?? "00:00"),
        name: String(shiftRow.name ?? ""),
      })}
    />
  );

  return (
    <>
      <Heading title='Shift templates'>
        One row per shift type per day. Pick a day to see its shifts in start
        time order, or All days to see the whole week. Use the copy icon (or
        Duplicate on a phone) to clone a shift, then change its day or times;
        changing the day moves it under that day. The required skill can only
        be a skill from the Key skills on the Team page. To make a shift only
        for certain people, enter their names in the last column, separated by
        commas.
      </Heading>
      <DayPicker
        shiftTemplates={shiftTemplates}
        chosenDay={chosenDay}
        onChooseDay={setChosenDay}
      />
      <ShiftColorKey />
      <div className='space-y-6'>
        {daysToShow.map((dayNumber) => {
          const dayTemplates = templatesForDay(shiftTemplates, dayNumber);
          return (
            <section key={dayNumber}>
              <div className={`${cardClass} mb-2 flex items-baseline justify-between gap-3 bg-slate-50 px-4 py-2.5`}>
                <h2 className='text-base font-semibold text-slate-900'>
                  {DAY_FULL_NAMES[dayNumber]}
                </h2>
                <span className='text-xs text-slate-500'>
                  {dayTemplates.length} shift{dayTemplates.length === 1 ? "" : "s"}
                  {" · "}
                  {totalPeopleNeeded(dayTemplates)} people needed
                </span>
              </div>
              <EditableTable
                weekStart={weekStart}
                table='shift_templates'
                columns={shiftColumns}
                rows={asTableRows<TableRow>(dayTemplates)}
                onDataChange={onDataChange}
                addLabel={`Add ${DAY_SHORT_LABELS[dayNumber]} shift`}
                canDuplicate
                highlightedId={highlightedId}
                onRowAdded={onRowAdded}
                renderRowSummary={renderTimeSummary}
                summaryLabel='Time'
                defaultRow={{
                  name: "New shift",
                  day: dayNumber,
                  start: "06:00",
                  end: "16:00",
                  needed: 1,
                  skill: "",
                  only_for: "",
                }}
              />
            </section>
          );
        })}
      </div>
    </>
  );
}

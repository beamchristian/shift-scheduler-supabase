import type { Snapshot } from "../../lib/types";
import {
  DAY_SHORT_LABELS,
  WORK_DAYS,
  asTableRows,
  splitCommaList,
} from "../../lib/ui/format";
import { EditableTable } from "../EditableTable/EditableTable";
import type { ColumnDefinition, TableRow } from "../types";
import { Heading } from "../ui/Heading";

// Columns of the shift template table. The day column is a dropdown showing short day names.
// The required skill is a dropdown of the skills on the Team page; blank means anyone can work the shift.
const buildShiftColumns = (skillChoices: string[]): ColumnDefinition[] => [
  { key: "name", label: "Shift" },
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
    formatOption: (skillValue) =>
      skillValue === "" ? "None" : String(skillValue),
  },
  { key: "only_for", label: "Only these people (blank = anyone)" },
];

// The Shifts screen: the shift templates for each day, with duplicate support.
export function ShiftsScreen({
  shiftTemplates,
  employees,
  onDataChange,
  highlightedId,
  onRowAdded,
}: {
  shiftTemplates: Snapshot["shift_templates"];
  employees: Snapshot["employees"];
  onDataChange: (newSnapshot: Snapshot) => void;
  highlightedId: number | null;
  onRowAdded: (newRowId: number) => void;
}) {
  // The skill choices are the skills people are tagged with on the Team page, with a blank choice first.
  const teamSkillChoices = [
    "",
    ...Array.from(
      new Set(employees.flatMap((employee) => splitCommaList(employee.skills))),
    ).sort(),
  ];

  return (
    <>
      <Heading title='Shift templates'>
        One row per shift type per day. Use the copy icon (or Duplicate on a
        phone) to clone a shift, then change its day or times. New and
        duplicated shifts are highlighted and scrolled into view. Rows are
        sorted by day and start time. The required skill can only be a skill
        from the Key skills on the Team page. To make a shift only for certain
        people, enter their names in the last column, separated by commas.
      </Heading>
      <EditableTable
        table='shift_templates'
        columns={buildShiftColumns(teamSkillChoices)}
        rows={asTableRows<TableRow>(shiftTemplates)}
        onDataChange={onDataChange}
        addLabel='Add shift'
        canDuplicate
        highlightedId={highlightedId}
        onRowAdded={onRowAdded}
        defaultRow={{
          name: "New shift",
          day: 1,
          start: "06:00",
          end: "16:00",
          needed: 1,
          skill: "",
          only_for: "",
        }}
      />
    </>
  );
}

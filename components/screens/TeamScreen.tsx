import type { Snapshot } from "../../lib/types";
import { asTableRows, splitCommaList } from "../../lib/ui/format";
import { EditableTable } from "../EditableTable/EditableTable";
import type { ColumnDefinition, TableRow } from "../types";
import { Heading } from "../ui/Heading";

// Columns of the employee table. Each key is a column in the employees table.
// The skills column shows chips, and offers every skill already on the team or required by a shift.
const buildEmployeeColumns = (
  suggestedSkills: string[],
): ColumnDefinition[] => [
  { key: "name", label: "Name" },
  { key: "position", label: "Position" },
  { key: "type", label: "Type", options: ["FT", "PT"] },
  { key: "min_hours", label: "Min hrs", inputType: "number" },
  { key: "max_hours", label: "Max hrs", inputType: "number" },
  {
    key: "skills",
    label: "Key skills",
    inputType: "tags",
    placeholder: "Add a skill",
    suggestions: suggestedSkills,
  },
  { key: "shifts", label: "Only these shift types (blank = all)" },
  {
    key: "max_closes",
    label: "Max closes / wk (blank = default)",
    inputType: "number",
  },
];

// The Team screen: the employee list, with notes on skills and shift types.
export function TeamScreen({
  weekStart,
  employees,
  shiftTemplates,
  onDataChange,
  highlightedId,
  onRowAdded,
}: {
  // The week on screen, as its Monday. Saves reply with that week's data.
  weekStart: string;
  employees: Snapshot["employees"];
  shiftTemplates: Snapshot["shift_templates"];
  onDataChange: (newSnapshot: Snapshot) => void;
  highlightedId: number | null;
  onRowAdded: (newRowId: number) => void;
}) {
  // Every skill already on the team, plus every skill a shift requires, sorted for the suggestions.
  const suggestedSkills = Array.from(
    new Set([
      ...employees.flatMap((employee) => splitCommaList(employee.skills)),
      ...shiftTemplates.flatMap((shiftTemplate) =>
        splitCommaList(shiftTemplate.skill),
      ),
    ]),
  ).sort();

  return (
    <>
      <Heading title='Team'>
        Tag skills like subshop, service or production; a shift that requires a
        skill can only go to people tagged with it. To limit someone to certain
        shift types, enter names like Opener or Closer in the last column.
      </Heading>
      <EditableTable
        weekStart={weekStart}
        table='employees'
        columns={buildEmployeeColumns(suggestedSkills)}
        rows={asTableRows<TableRow>(employees)}
        onDataChange={onDataChange}
        addLabel='Add employee'
        highlightedId={highlightedId}
        onRowAdded={onRowAdded}
        defaultRow={{
          name: "New employee",
          position: "",
          type: "PT",
          min_hours: 10,
          max_hours: 25,
          skills: "",
          shifts: "",
          max_closes: "",
        }}
      />
    </>
  );
}

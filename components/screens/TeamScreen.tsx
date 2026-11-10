import { PAYROLL_TYPE_LABELS, type PayrollType } from "../../lib/payroll";
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
  { key: "name", label: "Name", cardSpan: 3 },
  { key: "position", label: "Position", cardSpan: 3 },
  { key: "type", label: "Type", options: ["FT", "PT"] },
  { key: "min_hours", label: "Min hrs", inputType: "number" },
  { key: "max_hours", label: "Max hrs", inputType: "number" },
  {
    key: "skills",
    label: "Key skills",
    inputType: "tags",
    placeholder: "Add a skill",
    suggestions: suggestedSkills,
    wide: true,
    cardSpan: 4,
  },
  {
    key: "shifts",
    label: "Only these shift types",
    placeholder: "All shift types",
    cardSpan: 4,
  },
  {
    key: "min_days",
    label: "Min days / wk",
    inputType: "number",
    // Blank means 5 for full-timers and none for part-timers.
    placeholder: "FT 5, PT none",
  },
  {
    key: "max_days",
    label: "Max days / wk",
    inputType: "number",
    placeholder: "No limit",
  },
  {
    key: "max_closes",
    label: "Max closes / wk",
    inputType: "number",
    placeholder: "Default",
  },
  {
    key: "payroll_type",
    label: "Payroll",
    options: Object.keys(PAYROLL_TYPE_LABELS),
    cellClassName: "min-w-[10rem]",
    cardSpan: 3,
    // Blank (older rows) counts as hourly.
    formatOption: (payrollValue) =>
      PAYROLL_TYPE_LABELS[(String(payrollValue) || "hourly") as PayrollType] ?? String(payrollValue),
  },
  {
    key: "salaried_hours",
    label: "Salaried hrs / wk",
    inputType: "number",
    placeholder: "40",
    // Only matters for salaried people, so it is shown only for them.
    showWhen: (employeeRow) => employeeRow.payroll_type === "salaried",
  },
  {
    key: "in_training",
    label: "In training",
    options: [0, 1],
    // Blank (older rows) means not in training.
    formatOption: (trainingValue) => (Number(trainingValue) === 1 ? "Yes" : "No"),
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
        shift types, enter names like Opener or Closer in that column. A blank
        max closes uses the default from Settings, and 0 means they never close. A
        blank min days means 5 for full-timers; set a lower number for anyone who
        asked for fewer days.
        Payroll
        sets how someone's hours count: Hourly counts the hours they're scheduled,
        Salaried always counts their weekly salaried hours, and Billed elsewhere
        schedules them here without counting any hours (for example a store
        manager). People in training are added on top of the schedule as extra
        hands and are never counted on to cover a shift.
      </Heading>
      <EditableTable
        weekStart={weekStart}
        table='employees'
        columns={buildEmployeeColumns(suggestedSkills)}
        rows={asTableRows<TableRow>(employees)}
        onDataChange={onDataChange}
        addLabel='Add employee'
        // Each person has many settings, so cards that wrap avoid scrolling sideways.
        layout='cards'
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
          payroll_type: "hourly",
          in_training: 0,
        }}
      />
    </>
  );
}

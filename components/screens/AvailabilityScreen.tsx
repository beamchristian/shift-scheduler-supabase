import type { Snapshot } from "../../lib/types";
import { DAY_FULL_NAMES, WORK_DAYS, asTableRows } from "../../lib/ui/format";
import { EditableTable } from "../EditableTable/EditableTable";
import type { ColumnDefinition, TableRow } from "../types";
import { Heading } from "../ui/Heading";

// Columns of the availability table: the employee's name, then one column per work day.
const AVAILABILITY_COLUMNS: ColumnDefinition[] = [
  { key: "name", label: "Employee", readOnly: true },
  ...WORK_DAYS.map((dayNumber) => ({
    key: "avail_" + dayNumber,
    label: DAY_FULL_NAMES[dayNumber],
    placeholder: "Any",
  })),
];

// The Availability screen: when each person can work, one column per day.
export function AvailabilityScreen({
  employees,
  onDataChange,
}: {
  employees: Snapshot["employees"];
  onDataChange: (newSnapshot: Snapshot) => void;
}) {
  return (
    <>
      <Heading title='Availability'>
        Leave a day blank if the person can work any time. Type off if they
        can't work that day, or a window such as 6am-2pm (the whole shift must
        fit inside it).
      </Heading>
      <EditableTable
        table='employees'
        hideActions
        columns={AVAILABILITY_COLUMNS}
        rows={asTableRows<TableRow>(employees)}
        onDataChange={onDataChange}
      />
    </>
  );
}

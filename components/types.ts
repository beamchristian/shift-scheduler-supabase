// Types shared by the screens and the main page.
import type { Snapshot } from "../lib/types";

// The screens in the app.
export type Tab =
  | "Schedule"
  | "Team"
  | "Availability"
  | "Shifts"
  | "Settings"
  | "Access";

// The screens in the order they appear in the navigation.
export const TAB_ORDER: Tab[] = [
  "Schedule",
  "Team",
  "Availability",
  "Shifts",
  "Settings",
  "Access",
];

// One row from an editable table, keyed by column name. The id is missing for a new row.
export type TableRow = { id?: number } & Record<string, string | number | null>;

// Describes one column of an editable table.
export type ColumnDefinition = {
  // Column name in the data (for example "name" or "avail_1").
  key: string;
  // Heading shown above the column.
  label: string;
  // Input type for the cell, such as "number" or "time". "tags" shows a row of removable chips
  // for a comma-separated list.
  inputType?: string;
  // True when the cell can be seen but not changed.
  readOnly?: boolean;
  // Placeholder text shown when the cell is empty.
  placeholder?: string;
  // Values offered as the person types in a "tags" cell.
  suggestions?: string[];
  // When set, the cell is a dropdown with these choices.
  options?: (string | number)[];
  // Turns a dropdown choice into the text shown to the person.
  formatOption?: (optionValue: string | number) => string;
};

// The result of generating a schedule: the new data, plus any warnings.
export type GenerateResult = Snapshot & { warnings?: string[] };

// The result of saving one row: the new data, plus the id of a newly added row.
export type SaveResult = Snapshot & { newId?: number };

// The result of the dry-run staffing check.
export type StaffingCheck = {
  unfilled: string[];
  underMin: string[];
  capacity: number;
  needed: number;
  config: string[];
  suggestions: { title: string; detail: string }[];
};

// One person on the access list.
export type AccessMember = { id: number; email: string; role: string };

// Who is signed in, the department they are working in, and every department they can switch to.
export type CurrentUser = {
  email: string;
  departmentId: number;
  departmentName: string;
  storeId: number;
  storeName: string;
  isCompanyAdmin: boolean;
  canSeeStoreManagers: boolean;
  canManageAccess: boolean;
  role: string;
  memberships: {
    departmentId: number;
    departmentName: string;
    storeId: number;
    storeName: string;
    role: string;
  }[];
};

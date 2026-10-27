import type { TableName } from "./types";

// Pure helpers that turn a saved row into a line for the audit log, such as
// "Changed employee · Maria: Max hrs 32 → 40". They use the same names the screens show.

// A row as read from the database or sent by the page.
type LooseRow = Record<string, unknown>;

// One line for the audit log: what kind of change it was, and the details.
export interface AuditLine {
  action: string;
  detail: string;
}

// Day numbers as the screens show them.
const DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// The name each field has on its screen. A field not listed here is not described.
const FIELD_LABELS: Record<TableName, Record<string, string>> = {
  settings: {
    weekly_sales: "Default weekly sales",
    payroll_pct: "Target payroll %",
    rate_override: "Average hourly rate",
    fill_extra: "Fill extra shifts",
    max_closes: "Default max closes",
    break_minutes: "Lunch break minutes",
    break_after: "Lunch applies after (hours)",
    breaks_unpaid: "Lunch unpaid",
    count_paid_hours: "Use paid hours",
    schedule_title: "Schedule title",
    earliest_start: "Earliest shift start",
    latest_start: "Latest shift start",
  },
  store_hours: {
    sales_pct: "Day weight",
  },
  employees: {
    name: "Name",
    position: "Position",
    type: "Type",
    min_hours: "Min hrs",
    max_hours: "Max hrs",
    skills: "Skills",
    shifts: "Shift types",
    max_closes: "Max closes",
    avail_1: "Monday availability",
    avail_2: "Tuesday availability",
    avail_3: "Wednesday availability",
    avail_4: "Thursday availability",
    avail_5: "Friday availability",
    avail_6: "Saturday availability",
  },
  shift_templates: {
    name: "Shift",
    day: "Day",
    start: "Start",
    end: "End",
    needed: "People needed",
    skill: "Required skill",
    only_for: "Only for",
  },
};

// The word for one row of each table, used in "Added …", "Changed …" and "Removed …".
const ROW_NOUNS: Record<TableName, string> = {
  settings: "settings",
  store_hours: "day weight",
  employees: "employee",
  shift_templates: "shift template",
};

// True when a value counts as blank: missing, null, or only spaces.
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

// True when two saved values are the same, so "40" and 40, or null and "", don't count as a change.
function sameValue(firstValue: unknown, secondValue: unknown): boolean {
  if (isBlank(firstValue) || isBlank(secondValue))
    return isBlank(firstValue) && isBlank(secondValue);
  const firstNumber = Number(firstValue);
  const secondNumber = Number(secondValue);
  if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber))
    return firstNumber === secondNumber;
  return String(firstValue).trim() === String(secondValue).trim();
}

// Shows one value the way a person reads it: "blank", "any time" for empty availability, or a day's name.
function readableValue(columnName: string, value: unknown): string {
  if (isBlank(value))
    return columnName.startsWith("avail_") ? "any time" : "blank";
  if (columnName === "day") return DAY_NAMES[Number(value)] ?? String(value);
  return String(value).trim();
}

// The name a row goes by in the log: the person's or shift's name, with the shift's day and times,
// or the day for a day weight. Settings have no name, so this returns an empty string for them.
function rowName(tableName: TableName, row: LooseRow): string {
  if (tableName === "employees") return readableValue("name", row.name);
  if (tableName === "store_hours") return readableValue("day", row.day);
  if (tableName === "shift_templates")
    return `${readableValue("name", row.name)}, ${readableValue("day", row.day)} ${readableValue("start", row.start)}–${readableValue("end", row.end)}`;
  return "";
}

// Lists each field that differs between the old and new row, for example "Max hrs 32 → 40".
// Returns an empty list when nothing the screens show has changed.
export function changedFields(
  tableName: TableName,
  oldRow: LooseRow,
  newRow: LooseRow,
): string[] {
  return Object.entries(FIELD_LABELS[tableName])
    .filter(
      ([columnName]) =>
        columnName in newRow &&
        !sameValue(oldRow[columnName], newRow[columnName]),
    )
    .map(
      ([columnName, label]) =>
        `${label} ${readableValue(columnName, oldRow[columnName])} → ${readableValue(columnName, newRow[columnName])}`,
    );
}

// Describes a row that was added, for example "Added employee · Maria".
export function describeAddedRow(
  tableName: TableName,
  newRow: LooseRow,
): AuditLine {
  return {
    action: `Added ${ROW_NOUNS[tableName]}`,
    detail: rowName(tableName, newRow),
  };
}

// Describes a row that was removed, for example "Removed shift template · Open, Monday 06:00–14:00".
export function describeRemovedRow(
  tableName: TableName,
  oldRow: LooseRow,
): AuditLine {
  return {
    action: `Removed ${ROW_NOUNS[tableName]}`,
    detail: rowName(tableName, oldRow),
  };
}

// Describes a row that was changed, for example "Changed employee · Maria: Max hrs 32 → 40; Min hrs 20 → 24".
// Returns null when nothing changed, so saving a row without changes leaves no line in the log.
export function describeChangedRow(
  tableName: TableName,
  oldRow: LooseRow,
  newRow: LooseRow,
): AuditLine | null {
  const changes = changedFields(tableName, oldRow, newRow);
  if (!changes.length) return null;
  // A rename shows the old name, so the line still makes sense after the change.
  const name = rowName(tableName, oldRow);
  return {
    action: `Changed ${ROW_NOUNS[tableName]}`,
    detail: name ? `${name}: ${changes.join("; ")}` : changes.join("; "),
  };
}

// Shows a dollar amount for a log line, for example "$41,000", or "blank" for none.
export function moneyText(amount: number | null | undefined): string {
  return amount === null || amount === undefined
    ? "blank"
    : `$${Math.round(Number(amount)).toLocaleString("en-US")}`;
}

// Shows a percent for a log line, for example "12.5%", or "blank" for none.
export function percentText(percent: number | null | undefined): string {
  return percent === null || percent === undefined
    ? "blank"
    : `${Number(percent)}%`;
}

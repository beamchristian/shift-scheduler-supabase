import postgres from "postgres";
import type { Snapshot, TableName } from "./types";

// Minimal view of the postgres.js client. Keeping it narrow means the rest of the app never touches its types.
interface PostgresClient {
  unsafe(sqlText: string, parameterValues?: unknown[]): Promise<unknown[]>;
  begin<TransactionResult>(
    runInTransaction: (transactionClient: PostgresClient) => Promise<TransactionResult>,
  ): Promise<TransactionResult>;
}

// One shared connection pool for the whole server. It is kept on globalThis so hot reloads do not open new pools.
const globalState = globalThis as unknown as {
  _pg?: PostgresClient;
  _seededDepartments?: Map<number, Promise<void>>;
};
const databaseUrl = process.env.DATABASE_URL;
if (!globalState._pg) {
  globalState._pg = postgres(
    databaseUrl || "postgres://missing:missing@localhost:5432/missing",
    {
      prepare: false, // required for Supabase's transaction pooler
      max: 3, // a few connections so one slow request does not block the rest
      idle_timeout: 20,
      connect_timeout: 15,
      ssl:
        databaseUrl && !/localhost|127\.0\.0\.1/.test(databaseUrl)
          ? "require"
          : false,
    },
  ) as unknown as PostgresClient;
}
const pool = globalState._pg as PostgresClient;

// One row of a query result, keyed by column name.
export type Row = Record<string, unknown>;

// A function that runs one SQL statement with its values and returns the rows.
export type RunQuery = <ResultRow = Row>(
  sqlText: string,
  parameterValues?: (string | number | null)[],
) => Promise<ResultRow[]>;

// Builds a RunQuery that uses the given connection or transaction.
const makeRunQuery =
  (connection: PostgresClient): RunQuery =>
  async <ResultRow = Row>(
    sqlText: string,
    parameterValues: (string | number | null)[] = [],
  ) =>
    (await connection.unsafe(sqlText, parameterValues)) as ResultRow[];

// Runs one SQL statement on the shared pool.
export const runQuery: RunQuery = makeRunQuery(pool);

// Runs several statements together. If one fails, all of them are rolled back.
// The callback receives a RunQuery that uses the transaction.
export const transaction = <TransactionResult>(
  runInTransaction: (transactionQuery: RunQuery) => Promise<TransactionResult>,
): Promise<TransactionResult> =>
  pool.begin((transactionClient) =>
    runInTransaction(makeRunQuery(transactionClient)),
  );

// Turns any thrown value into a readable message.
export const errMsg = (thrownValue: unknown) =>
  thrownValue instanceof Error ? thrownValue.message : String(thrownValue);

// The columns the page can edit for each table. Anything else sent by the page is ignored.
export const COLS: Record<TableName, string[]> = {
  settings: [
    "weekly_sales",
    "payroll_pct",
    "rate_override",
    "fill_extra",
    "max_closes",
    "break_minutes",
    "break_after",
    "breaks_unpaid",
    "count_paid_hours",
    "schedule_title",
    "earliest_start",
    "latest_start",
  ],
  store_hours: ["day", "open", "close", "sales_pct"],
  employees: [
    "name",
    "position",
    "type",
    "min_hours",
    "max_hours",
    "skills",
    "shifts",
    "max_closes",
    "avail_1",
    "avail_2",
    "avail_3",
    "avail_4",
    "avail_5",
    "avail_6",
  ],
  shift_templates: [
    "name",
    "day",
    "start",
    "end",
    "needed",
    "skill",
    "only_for",
  ],
};

// Columns that hold whole numbers, and columns that hold decimal numbers.
const WHOLE_NUMBER_COLUMNS = new Set([
  "day",
  "needed",
  "template_id",
  "employee_id",
]);
const DECIMAL_NUMBER_COLUMNS = new Set([
  "weekly_sales",
  "payroll_pct",
  "rate_override",
  "fill_extra",
  "max_closes",
  "sales_pct",
  "min_hours",
  "max_hours",
  "break_minutes",
  "break_after",
  "breaks_unpaid",
  "count_paid_hours",
]);

// Converts one value from the page into the type the column expects.
// Numeric columns arrive as text, and an empty box means "no value" (null).
export function coerce(columnName: string, rawValue: unknown): string | number | null {
  if (rawValue === undefined || rawValue === null) return null;
  const isNumberColumn =
    WHOLE_NUMBER_COLUMNS.has(columnName) || DECIMAL_NUMBER_COLUMNS.has(columnName);
  if (isNumberColumn) {
    if (String(rawValue).trim() === "") return null;
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue))
      throw new Error(`"${columnName}" must be a number.`);
    return WHOLE_NUMBER_COLUMNS.has(columnName)
      ? Math.round(numericValue)
      : numericValue;
  }
  return String(rawValue);
}

// Creates a department's settings row and its six store-hours rows if they are missing.
// Migration 007 does this for the existing departments. This covers any department added later.
async function seedDepartment(departmentId: number): Promise<void> {
  const existingSettingsCount = await runQuery<{ count: number }>(
    "select count(*)::int as count from settings where department_id = $1",
    [departmentId],
  );
  if (!existingSettingsCount[0].count)
    await runQuery(
      "insert into settings (department_id, schedule_title) values ($1, 'Weekly Schedule')",
      [departmentId],
    );

  const existingHoursCount = await runQuery<{ count: number }>(
    "select count(*)::int as count from store_hours where department_id = $1",
    [departmentId],
  );
  if (!existingHoursCount[0].count)
    await runQuery(
      `insert into store_hours (department_id, day, "open", "close", sales_pct) values
        ($1,1,'06:00','20:00',19),($1,2,'06:00','20:00',15.5),($1,3,'06:00','20:00',14),
        ($1,4,'06:00','20:00',15),($1,5,'06:00','20:00',17),($1,6,'06:00','20:00',19.5)`,
      [departmentId],
    );
}

// Makes sure a department has its settings and store hours. Runs once per department per server instance.
export function ensureDepartmentSeeded(departmentId: number): Promise<void> {
  if (!globalState._seededDepartments) globalState._seededDepartments = new Map();
  const existingSeed = globalState._seededDepartments.get(departmentId);
  if (existingSeed) return existingSeed;

  const newSeed = seedDepartment(departmentId).catch((thrownError) => {
    // Allow another try on the next request if this one failed.
    globalState._seededDepartments?.delete(departmentId);
    throw thrownError;
  });
  globalState._seededDepartments.set(departmentId, newSeed);
  return newSeed;
}

// Loads everything the app needs for one department, in one database round trip.
// Only rows that belong to that department are returned.
export async function snapshot(departmentId: number): Promise<Snapshot> {
  await ensureDepartmentSeeded(departmentId);
  const [snapshotRow] = await runQuery<Snapshot>(
    `select
      (select to_jsonb(settingsRow) from settings settingsRow where settingsRow.department_id = $1 limit 1) as settings,
      (select coalesce(jsonb_agg(to_jsonb(hourRow) order by hourRow.day), '[]'::jsonb) from store_hours hourRow where hourRow.department_id = $1) as store_hours,
      (select coalesce(jsonb_agg(to_jsonb(employeeRow) order by employeeRow.id), '[]'::jsonb) from employees employeeRow where employeeRow.department_id = $1) as employees,
      (select coalesce(jsonb_agg(to_jsonb(templateRow) order by templateRow.day, templateRow."start", templateRow.name, templateRow.id), '[]'::jsonb) from shift_templates templateRow where templateRow.department_id = $1) as shift_templates,
      (select coalesce(jsonb_agg(to_jsonb(scheduleRow) order by scheduleRow.id), '[]'::jsonb) from schedule scheduleRow where scheduleRow.department_id = $1) as schedule`,
    [departmentId],
  );
  return snapshotRow;
}

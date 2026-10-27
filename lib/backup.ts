import {
  COLS,
  coerce,
  ensureDepartmentSeeded,
  errMsg,
  runQuery,
  RunQuery,
  snapshot,
  transaction,
} from "./db";
import { isWeekStart, upcomingWeekStart } from "./weeks";

// A record read from an export file, with values of unknown type.
type LooseRecord = Record<string, unknown>;

// Columns saved for each schedule row in an export file.
const SCHEDULE_COLUMNS = [
  "day",
  "template_id",
  "employee_id",
  "name",
  "start",
  "end",
];

// Tables that hold a department's data. Listed in the order they must be cleared (weeks and shifts first).
const DEPARTMENT_DATA_TABLES = [
  "schedule",
  "schedule_weeks",
  "shift_templates",
  "employees",
  "store_hours",
];

// The columns of a saved week that go into an export file, apart from its id and its shifts.
const WEEK_COLUMNS = [
  "status",
  "weekly_sales",
  "payroll_pct",
  "rate_override",
  "day_weights",
  "generated_by",
  "generated_at",
  "published_by",
  "published_at",
];

// The export file format. Version 1 held one week's schedule; version 2 holds every saved week.
const EXPORT_VERSION = 2;

// Loads every saved week of a department, oldest first, each with its shifts.
async function loadAllWeeks(departmentId: number): Promise<LooseRecord[]> {
  return runQuery<LooseRecord>(
    `select to_char(week.week_start, 'YYYY-MM-DD') as week_start,
            ${WEEK_COLUMNS.map((columnName) => `week.${columnName}`).join(", ")},
            (select coalesce(jsonb_agg(to_jsonb(shift) - 'week_id' - 'department_id' order by shift.id), '[]'::jsonb)
               from schedule shift where shift.week_id = week.id) as schedule
     from schedule_weeks week
     where week.department_id = $1
     order by week.week_start`,
    [departmentId],
  );
}

// Builds the export file for one department: the team, shifts, settings, day weights, and every saved week
// with its status, numbers and shifts, as one JSON-ready object.
export async function exportAll(departmentId: number) {
  // Any week will do here: only the department-wide parts of the snapshot are kept.
  const { settings, store_hours, employees, shift_templates } = await snapshot(
    departmentId,
    upcomingWeekStart(),
  );
  return {
    app: "shift-scheduler",
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      settings,
      store_hours,
      employees,
      shift_templates,
      weeks: await loadAllWeeks(departmentId),
    },
  };
}

// Quotes a list of column names for SQL, for example "day","open".
const quoteColumnNames = (columnNames: string[]) =>
  columnNames.map((columnName) => `"${columnName}"`).join(",");

// Inserts rows into one table for one department, giving each row a new id.
// Returns a map from each row's id in the file to its new id, so schedule rows can point at the right people and shifts.
async function insertRowsWithNewIds(
  runStatement: RunQuery,
  tableName: string,
  columnNames: string[],
  rowsToInsert: LooseRecord[],
  departmentId: number,
): Promise<Map<number, number>> {
  const newIdByFileId = new Map<number, number>();
  if (!rowsToInsert.length) return newIdByFileId;

  // New ids count up from the highest id already in the table, so they never clash with another department's rows.
  const [highestIdRow] = await runStatement<{ highest: number }>(
    `select coalesce(max(id), 0)::int as highest from ${tableName}`,
  );
  let nextNewId = highestIdRow.highest + 1;

  const allInsertColumns = ["id", ...columnNames, "department_id"];
  const parameterValues: (string | number | null)[] = [];
  const valueGroups = rowsToInsert.map((rowToInsert, rowIndex) => {
    const newId = nextNewId++;
    const idInFile = Number(rowToInsert.id);
    if (Number.isInteger(idInFile)) newIdByFileId.set(idInFile, newId);

    parameterValues.push(
      newId,
      ...columnNames.map((columnName) =>
        coerce(columnName, rowToInsert[columnName]),
      ),
      departmentId,
    );
    const placeholders = allInsertColumns.map(
      (_, columnIndex) =>
        `$${rowIndex * allInsertColumns.length + columnIndex + 1}`,
    );
    return `(${placeholders.join(",")})`;
  });

  await runStatement(
    `insert into ${tableName} (${quoteColumnNames(allInsertColumns)}) values ${valueGroups.join(",")}`,
    parameterValues,
  );
  // Move the table's id counter past the ids just used, so later inserts from the app do not clash.
  await runStatement(
    `select setval(pg_get_serial_sequence('${tableName}', 'id'), (select max(id) from ${tableName}))`,
  );
  return newIdByFileId;
}

// Checks the weeks in a version 2 file. Returns an error message, or null when every week is usable.
function weekListProblem(weekRows: LooseRecord[]): string | null {
  const seenWeeks = new Set<string>();
  for (const weekRow of weekRows) {
    const weekStart = String(weekRow.week_start ?? "");
    if (!isWeekStart(weekStart))
      return `A saved week has an invalid date (${weekStart}). Weeks must start on a Monday.`;
    if (seenWeeks.has(weekStart))
      return `The week of ${weekStart} appears twice in the file.`;
    seenWeeks.add(weekStart);
    if (weekRow.status !== "draft" && weekRow.status !== "published")
      return `The week of ${weekStart} has an unknown status.`;
    if (
      !Array.isArray(weekRow.schedule) ||
      !weekRow.schedule.every((item) => item && typeof item === "object")
    )
      return `The week of ${weekStart} has no readable schedule.`;
  }
  return null;
}

// Reads a value from a file as a number, or null when it is blank or not a number.
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

// Reads a value from a file as text, or null when it is blank.
function textOrNull(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

// Saves one week from a file for a department, with its status and numbers. Returns the new week's id.
async function insertWeek(
  runStatement: RunQuery,
  departmentId: number,
  weekRow: LooseRecord,
): Promise<number> {
  const [insertedWeek] = await runStatement<{ id: number }>(
    `insert into schedule_weeks (department_id, week_start, status, weekly_sales, payroll_pct, rate_override,
                                 day_weights, generated_by, generated_at, published_by, published_at)
     values ($1, $2::date, $3, $4, $5, $6, $7::text::jsonb, $8, $9::timestamptz, $10, $11::timestamptz)
     returning id`,
    [
      departmentId,
      String(weekRow.week_start),
      String(weekRow.status),
      numberOrNull(weekRow.weekly_sales),
      numberOrNull(weekRow.payroll_pct),
      numberOrNull(weekRow.rate_override),
      // Sent as text and read as JSON by the database, so it is not encoded twice.
      weekRow.day_weights && typeof weekRow.day_weights === "object"
        ? JSON.stringify(weekRow.day_weights)
        : null,
      textOrNull(weekRow.generated_by),
      textOrNull(weekRow.generated_at),
      textOrNull(weekRow.published_by),
      textOrNull(weekRow.published_at),
    ],
  );
  return insertedWeek.id;
}

// Replaces one department's data with the contents of an export file. Every saved week is replaced.
// A version 2 file brings back every week it holds, each with its status, numbers and shifts.
// An older (version 1) file holds one schedule, which goes into the week given (weekStart, its Monday) as a draft.
// Other departments are not touched. Runs in one transaction, so a bad file changes nothing.
// Returns how many weeks were saved and how many shifts were skipped because their person or shift was missing.
export async function importAll(
  payload: unknown,
  departmentId: number,
  weekStart: string,
): Promise<
  | { ok: true; skippedScheduleRows: number; importedWeeks: number }
  | { ok: false; error: string }
> {
  // Check the file's shape before touching the database.
  const fileContent = payload as { app?: string; data?: LooseRecord } | null;
  const exportedData = fileContent?.data;
  if (
    !fileContent ||
    fileContent.app !== "shift-scheduler" ||
    !exportedData ||
    typeof exportedData !== "object"
  )
    return { ok: false, error: "This file is not a Shift Scheduler export." };

  // Returns a list of records for one key, or null if the key is missing or is not a list of objects.
  const readRecordList = (key: string): LooseRecord[] | null => {
    const value = exportedData[key];
    return Array.isArray(value) &&
      value.every((item) => item && typeof item === "object")
      ? (value as LooseRecord[])
      : null;
  };
  const employeeRows = readRecordList("employees");
  const templateRows = readRecordList("shift_templates");
  const storeHourRows = readRecordList("store_hours");
  // A version 2 file has a list of weeks. An older file has one schedule, which becomes one draft week.
  const hasWeekList = exportedData.weeks !== undefined;
  const weekRows: LooseRecord[] | null = hasWeekList
    ? readRecordList("weeks")
    : [
        {
          week_start: weekStart,
          status: "draft",
          weekly_sales: (exportedData.settings as LooseRecord | undefined)
            ?.weekly_sales,
          schedule:
            exportedData.schedule === undefined
              ? []
              : readRecordList("schedule"),
        },
      ];
  const settingsRow = exportedData.settings as LooseRecord | undefined;
  if (
    !employeeRows ||
    !templateRows ||
    !storeHourRows ||
    !settingsRow ||
    typeof settingsRow !== "object"
  )
    return {
      ok: false,
      error:
        "The file is missing employees, shift templates, day weights or settings.",
    };
  if (!weekRows)
    return { ok: false, error: "The file's list of weeks can't be read." };
  const weekProblem = weekListProblem(weekRows);
  if (weekProblem) return { ok: false, error: weekProblem };

  // Day numbers must be Monday (1) to Saturday (6).
  for (const dayRow of [...templateRows, ...storeHourRows]) {
    const dayNumber = Number(dayRow.day);
    if (!(dayNumber >= 1 && dayNumber <= 6))
      return {
        ok: false,
        error: `A row has an invalid day (${String(dayRow.day)}). Days must be 1 (Mon) to 6 (Sat).`,
      };
  }

  try {
    await ensureDepartmentSeeded(departmentId);
    let skippedScheduleRowCount = 0;

    await transaction(async (runStatement) => {
      // Clear this department's current rows only.
      for (const tableName of DEPARTMENT_DATA_TABLES)
        await runStatement(
          `delete from ${tableName} where department_id = $1`,
          [departmentId],
        );

      const newEmployeeIds = await insertRowsWithNewIds(
        runStatement,
        "employees",
        COLS.employees,
        employeeRows,
        departmentId,
      );
      const newTemplateIds = await insertRowsWithNewIds(
        runStatement,
        "shift_templates",
        COLS.shift_templates,
        templateRows,
        departmentId,
      );
      await insertRowsWithNewIds(
        runStatement,
        "store_hours",
        COLS.store_hours,
        storeHourRows,
        departmentId,
      );

      // Each week is saved with its status and numbers, then its shifts. Shifts point at employees and
      // shift templates by id, so those ids are translated to the new ones. A shift whose person or shift
      // template is not in the file is skipped and counted.
      for (const weekRow of weekRows) {
        const weekId = await insertWeek(runStatement, departmentId, weekRow);
        const translatedScheduleRows = (
          weekRow.schedule as LooseRecord[]
        ).flatMap((scheduleRow) => {
          const newEmployeeId = newEmployeeIds.get(
            Number(scheduleRow.employee_id),
          );
          const newTemplateId = newTemplateIds.get(
            Number(scheduleRow.template_id),
          );
          if (newEmployeeId === undefined || newTemplateId === undefined) {
            skippedScheduleRowCount++;
            return [];
          }
          return [
            {
              ...scheduleRow,
              employee_id: newEmployeeId,
              template_id: newTemplateId,
              week_id: weekId,
            },
          ];
        });
        await insertRowsWithNewIds(
          runStatement,
          "schedule",
          [...SCHEDULE_COLUMNS, "week_id"],
          translatedScheduleRows,
          departmentId,
        );
      }

      // Settings: keep the current value for anything the file does not include.
      const [currentSettingsRow] = await runStatement<LooseRecord>(
        "select * from settings where department_id = $1",
        [departmentId],
      );
      const settingsColumns = COLS.settings;
      const settingsValues = settingsColumns.map((columnName) =>
        coerce(
          columnName,
          settingsRow[columnName] !== undefined
            ? settingsRow[columnName]
            : currentSettingsRow?.[columnName],
        ),
      );
      await runStatement(
        `update settings set ${settingsColumns.map((columnName, valueIndex) => `"${columnName}"=$${valueIndex + 1}`).join(",")}
         where department_id = $${settingsColumns.length + 1}`,
        [...settingsValues, departmentId],
      );
    });
    return {
      ok: true,
      skippedScheduleRows: skippedScheduleRowCount,
      importedWeeks: weekRows.length,
    };
  } catch (thrownError) {
    return {
      ok: false,
      error: `Import failed and nothing was changed: ${errMsg(thrownError)}`,
    };
  }
}

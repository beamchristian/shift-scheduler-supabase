import {
  COLS,
  coerce,
  ensureDepartmentSeeded,
  errMsg,
  RunQuery,
  snapshot,
  transaction,
} from "./db";
import { ensureWeek } from "./scheduleWeeks";

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

// Builds the export file for one department and one week: the team, shifts, settings and that week's schedule,
// as one JSON-ready object. weekStart is the week's Monday.
export async function exportAll(departmentId: number, weekStart: string) {
  return {
    app: "shift-scheduler",
    version: 1,
    exported_at: new Date().toISOString(),
    data: await snapshot(departmentId, weekStart),
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

// Replaces one department's data with the contents of an export file. Every saved week is cleared, and the
// file's schedule goes into the week given (weekStart, its Monday) as a draft.
// Other departments are not touched. Runs in one transaction, so a bad file changes nothing.
export async function importAll(
  payload: unknown,
  departmentId: number,
  weekStart: string,
): Promise<
  { ok: true; skippedScheduleRows: number } | { ok: false; error: string }
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
  const scheduleRows =
    exportedData.schedule === undefined ? [] : readRecordList("schedule");
  const settingsRow = exportedData.settings as LooseRecord | undefined;
  if (
    !employeeRows ||
    !templateRows ||
    !storeHourRows ||
    !scheduleRows ||
    !settingsRow ||
    typeof settingsRow !== "object"
  )
    return {
      ok: false,
      error:
        "The file is missing employees, shift templates, day weights or settings.",
    };

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

      // Schedule rows point at employees and shift templates by id. Translate those ids to the new ones.
      // A row whose person or shift is not in the file is skipped and counted.
      const translatedScheduleRows = scheduleRows.flatMap((scheduleRow) => {
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
          },
        ];
      });
      // The schedule goes into the chosen week, as a draft that starts with the file's forecast.
      const week = await ensureWeek(departmentId, weekStart, runStatement);
      await runStatement(
        "update schedule_weeks set weekly_sales = $1 where id = $2",
        [coerce("weekly_sales", settingsRow.weekly_sales), week.id],
      );
      await insertRowsWithNewIds(
        runStatement,
        "schedule",
        [...SCHEDULE_COLUMNS, "week_id"],
        translatedScheduleRows.map((scheduleRow) => ({
          ...scheduleRow,
          week_id: week.id,
        })),
        departmentId,
      );

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
    return { ok: true, skippedScheduleRows: skippedScheduleRowCount };
  } catch (thrownError) {
    return {
      ok: false,
      error: `Import failed and nothing was changed: ${errMsg(thrownError)}`,
    };
  }
}

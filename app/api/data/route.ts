import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { describeAddedRow, describeChangedRow, describeRemovedRow, type AuditLine } from "../../../lib/auditChanges";
import { COLS, coerce, errMsg, runQuery, snapshot } from "../../../lib/db";
import { readWeekStart } from "../../../lib/scheduleWeeks";
import type { TableName } from "../../../lib/types";

export const dynamic = "force-dynamic";

// What the page sends when it saves or deletes one row.
interface SaveOrDeleteRequest {
  action: "save" | "delete";
  table: TableName;
  row: Record<string, string | number | null> & { id?: number };
  // The week the page is showing, as its Monday. The reply is that week's data.
  week?: string;
}

// Returns all of the active department's data for one week ("?week=YYYY-MM-DD", or the upcoming week).
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  const weekStart = readWeekStart(request);
  if (weekStart instanceof Response) return weekStart;
  try {
    return NextResponse.json(await snapshot(caller.departmentId, weekStart));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

// Reads one row of the active department as it is now, so a change can be described in the audit log.
// Settings are found by department, every other table by id. Returns null when there is no such row.
async function loadCurrentRow(
  table: TableName,
  rowId: number,
  departmentId: number,
): Promise<Record<string, unknown> | null> {
  const currentRows =
    table === "settings"
      ? await runQuery<Record<string, unknown>>("select * from settings where department_id = $1", [departmentId])
      : await runQuery<Record<string, unknown>>(`select * from ${table} where id = $1 and department_id = $2`, [
          rowId,
          departmentId,
        ]);
  return currentRows[0] ?? null;
}

// Saves (adds or updates) or deletes one row in the active department, then returns the week the page is showing.
// Every change is limited to rows that belong to that department, and each one that changes something is
// written to the audit log with what changed.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;

  const requestBody = (await request.json()) as SaveOrDeleteRequest;
  const { action, table, row } = requestBody;
  const weekStart = readWeekStart(request, requestBody);
  if (weekStart instanceof Response) return weekStart;
  // Only the tables and columns listed in COLS can be changed from the page.
  if (!Object.prototype.hasOwnProperty.call(COLS, table))
    return NextResponse.json({ error: "bad table" }, { status: 400 });

  const editableColumns = COLS[table];
  const departmentId = caller.departmentId;
  const isSettingsTable = table === "settings";
  let newRowId: number | undefined;
  let auditLine: AuditLine | null = null;

  try {
    if (action === "delete") {
      // Each department has exactly one settings row, so it cannot be deleted.
      if (isSettingsTable)
        return NextResponse.json({ error: "Settings cannot be deleted." }, { status: 400 });
      const removedRow = await loadCurrentRow(table, Number(row.id), departmentId);
      await runQuery(`delete from ${table} where id = $1 and department_id = $2`, [
        Number(row.id),
        departmentId,
      ]);
      if (removedRow) auditLine = describeRemovedRow(table, removedRow);
    } else if (isSettingsTable || row.id) {
      // Updating. Settings is always the department's own row, found by department_id, not by id.
      const newValues = editableColumns.map((columnName) => coerce(columnName, row[columnName]));
      const oldRow = await loadCurrentRow(table, Number(row.id), departmentId);
      const setClause = editableColumns
        .map((columnName, valueIndex) => `"${columnName}"=$${valueIndex + 1}`)
        .join(",");
      if (isSettingsTable) {
        await runQuery(
          `update settings set ${setClause} where department_id = $${editableColumns.length + 1}`,
          [...newValues, departmentId],
        );
      } else {
        await runQuery(
          `update ${table} set ${setClause} where id = $${editableColumns.length + 1} and department_id = $${editableColumns.length + 2}`,
          [...newValues, Number(row.id), departmentId],
        );
      }
      if (oldRow)
        auditLine = describeChangedRow(
          table,
          oldRow,
          Object.fromEntries(editableColumns.map((columnName, valueIndex) => [columnName, newValues[valueIndex]])),
        );
    } else {
      // Adding a new row. The department is stored with it.
      const insertColumns = [...editableColumns, "department_id"];
      const insertValues = [
        ...editableColumns.map((columnName) => coerce(columnName, row[columnName])),
        departmentId,
      ];
      const insertedRows = await runQuery<{ id: number }>(
        `insert into ${table} (${insertColumns.map((columnName) => `"${columnName}"`).join(",")})
         values (${insertColumns.map((_, valueIndex) => `$${valueIndex + 1}`).join(",")})
         returning id`,
        insertValues,
      );
      newRowId = insertedRows[0].id;
      auditLine = describeAddedRow(
        table,
        Object.fromEntries(insertColumns.map((columnName, valueIndex) => [columnName, insertValues[valueIndex]])),
      );
    }
    if (auditLine) await recordAuditEntry(departmentId, caller.email, auditLine.action, auditLine.detail);
    return NextResponse.json({ ...(await snapshot(departmentId, weekStart)), newId: newRowId });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 400 });
  }
}

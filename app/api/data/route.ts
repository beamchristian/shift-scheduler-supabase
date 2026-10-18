import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { COLS, coerce, errMsg, runQuery, snapshot } from "../../../lib/db";
import type { TableName } from "../../../lib/types";

export const dynamic = "force-dynamic";

// What the page sends when it saves or deletes one row.
interface SaveOrDeleteRequest {
  action: "save" | "delete";
  table: TableName;
  row: Record<string, string | number | null> & { id?: number };
}

// Returns all of the active department's data.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  try {
    return NextResponse.json(await snapshot(caller.departmentId));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

// Saves (adds or updates) or deletes one row in the active department.
// Every change is limited to rows that belong to that department.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;

  const { action, table, row } = (await request.json()) as SaveOrDeleteRequest;
  // Only the tables and columns listed in COLS can be changed from the page.
  if (!Object.prototype.hasOwnProperty.call(COLS, table))
    return NextResponse.json({ error: "bad table" }, { status: 400 });

  const editableColumns = COLS[table];
  const departmentId = caller.departmentId;
  const isSettingsTable = table === "settings";
  let newRowId: number | undefined;

  try {
    if (action === "delete") {
      // Each department has exactly one settings row, so it cannot be deleted.
      if (isSettingsTable)
        return NextResponse.json({ error: "Settings cannot be deleted." }, { status: 400 });
      await runQuery(`delete from ${table} where id = $1 and department_id = $2`, [
        Number(row.id),
        departmentId,
      ]);
    } else if (isSettingsTable || row.id) {
      // Updating. Settings is always the department's own row, found by department_id, not by id.
      const newValues = editableColumns.map((columnName) => coerce(columnName, row[columnName]));
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
    }
    return NextResponse.json({ ...(await snapshot(departmentId)), newId: newRowId });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 400 });
  }
}

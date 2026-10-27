import { NextResponse } from "next/server";
import { resolveCaller } from "../../../../lib/access";
import { recordAuditEntry } from "../../../../lib/audit";
import { errMsg, runQuery } from "../../../../lib/db";

export const dynamic = "force-dynamic";

// The longest department name allowed.
const MAX_NAME_LENGTH = 40;

// Renames the active department. Company admins and store managers may do this.
// Names must be unique within the store, ignoring capitals.
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { accessManagersOnly: true });
  if (caller instanceof Response) return caller;

  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  const newName = String(name ?? "").trim();
  if (!newName)
    return NextResponse.json({ error: "Enter a name for the department." }, { status: 400 });
  if (newName.length > MAX_NAME_LENGTH)
    return NextResponse.json(
      { error: `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );

  try {
    const [sameNameDepartment] = await runQuery(
      "select id from departments where store_id = $1 and lower(name) = lower($2) and id <> $3",
      [caller.storeId, newName, caller.departmentId],
    );
    if (sameNameDepartment)
      return NextResponse.json(
        { error: "A department with that name already exists in this store." },
        { status: 400 },
      );

    await runQuery("update departments set name = $1 where id = $2", [newName, caller.departmentId]);
    await recordAuditEntry(caller.departmentId, caller.email, "Renamed department", `${caller.departmentName} to ${newName}`);
    return NextResponse.json({ ok: true });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

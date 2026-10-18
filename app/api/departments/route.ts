import { NextResponse } from "next/server";
import { ACTIVE_DEPARTMENT_COOKIE, resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { ensureDepartmentSeeded, errMsg, runQuery } from "../../../lib/db";

export const dynamic = "force-dynamic";

// The longest department name allowed.
const MAX_NAME_LENGTH = 40;

// Creates a new department in the caller's store, then opens it.
// Only company admins and store managers may do this.
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { accessManagersOnly: true });
  if (caller instanceof Response) return caller;

  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  const departmentName = String(name ?? "").trim();
  if (!departmentName)
    return NextResponse.json({ error: "Enter a name for the new department." }, { status: 400 });
  if (departmentName.length > MAX_NAME_LENGTH)
    return NextResponse.json(
      { error: `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );

  try {
    // Department names must be unique within the store, ignoring capitals. Other stores may use the same name.
    const [existingDepartment] = await runQuery(
      "select id from departments where store_id = $1 and lower(name) = lower($2)",
      [caller.storeId, departmentName],
    );
    if (existingDepartment)
      return NextResponse.json(
        { error: "A department with that name already exists." },
        { status: 400 },
      );

    // Admins and store managers see every department in their store, so no access row is needed.
    const [createdRow] = await runQuery<{ id: number }>(
      "insert into departments (store_id, name) values ($1, $2) returning id",
      [caller.storeId, departmentName],
    );
    const newDepartmentId = createdRow.id;

    // Gives the new department its settings and store hours, so it opens with working defaults.
    await ensureDepartmentSeeded(newDepartmentId);
    await recordAuditEntry(newDepartmentId, caller.email, "Created department", departmentName);

    const response = NextResponse.json({ ok: true, departmentId: newDepartmentId });
    // Opens the new department, remembered for a year like the department switch.
    response.cookies.set(ACTIVE_DEPARTMENT_COOKIE, String(newDepartmentId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

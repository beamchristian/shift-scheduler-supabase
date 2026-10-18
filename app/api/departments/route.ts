import { NextResponse } from "next/server";
import { ACTIVE_DEPARTMENT_COOKIE, resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { ensureDepartmentSeeded, errMsg, runQuery, transaction } from "../../../lib/db";

export const dynamic = "force-dynamic";

// The longest department name allowed.
const MAX_NAME_LENGTH = 40;

// Creates a new department with the signed-in person as its owner, then opens it.
// Only owners may do this, checked for the department they are working in.
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { ownerOnly: true });
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
    // Department names must be unique, ignoring capitals.
    const [existingDepartment] = await runQuery(
      "select id from departments where lower(name) = lower($1)",
      [departmentName],
    );
    if (existingDepartment)
      return NextResponse.json(
        { error: "A department with that name already exists." },
        { status: 400 },
      );

    // The department and its first owner are created together, so neither is left on its own.
    const newDepartmentId = await transaction(async (transactionQuery) => {
      const [createdRow] = await transactionQuery<{ id: number }>(
        "insert into departments (name) values ($1) returning id",
        [departmentName],
      );
      await transactionQuery(
        "insert into department_members (department_id, email, role) values ($1, $2, 'owner')",
        [createdRow.id, caller.email],
      );
      return createdRow.id;
    });

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

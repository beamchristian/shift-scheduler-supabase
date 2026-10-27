import { NextResponse } from "next/server";
import { ACTIVE_DEPARTMENT_COOKIE, resolveCaller } from "../../../../lib/access";
import { errMsg, transaction } from "../../../../lib/db";

export const dynamic = "force-dynamic";

// Deletes the active department and everything in it. Only company admins and store managers may do this.
// The person must type the department's name to confirm, and must belong to another department,
// so they are not left with nowhere to go.
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { accessManagersOnly: true });
  if (caller instanceof Response) return caller;

  const { confirmName } = (await request.json().catch(() => ({}))) as { confirmName?: string };
  if (String(confirmName ?? "").trim().toLowerCase() !== caller.departmentName.trim().toLowerCase())
    return NextResponse.json(
      { error: "Type the department's name exactly to confirm." },
      { status: 400 },
    );

  // The other departments this person belongs to. The app opens one of them afterwards.
  const otherMemberships = caller.memberships.filter(
    (membership) => membership.departmentId !== caller.departmentId,
  );
  if (otherMemberships.length === 0)
    return NextResponse.json(
      { error: "Create or join another department before deleting this one." },
      { status: 400 },
    );

  try {
    // The rows that point at the department go first: its shifts, then its saved weeks, then the rest.
    // Its member list and audit log are removed by the database when the department row is deleted.
    await transaction(async (transactionQuery) => {
      const departmentId = caller.departmentId;
      await transactionQuery("delete from schedule where department_id = $1", [departmentId]);
      await transactionQuery("delete from schedule_weeks where department_id = $1", [departmentId]);
      await transactionQuery("delete from shift_templates where department_id = $1", [departmentId]);
      await transactionQuery("delete from employees where department_id = $1", [departmentId]);
      await transactionQuery("delete from store_hours where department_id = $1", [departmentId]);
      await transactionQuery("delete from settings where department_id = $1", [departmentId]);
      await transactionQuery("delete from departments where id = $1", [departmentId]);
    });

    // Opens the first other department, and remembers it like the department switch does.
    const nextDepartment = otherMemberships[0];
    const response = NextResponse.json({ ok: true, departmentId: nextDepartment.departmentId });
    response.cookies.set(ACTIVE_DEPARTMENT_COOKIE, String(nextDepartment.departmentId), {
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

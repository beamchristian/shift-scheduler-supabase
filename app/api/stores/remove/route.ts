import { NextResponse } from "next/server";
import { ACTIVE_DEPARTMENT_COOKIE, isCompanyAdmin, listMemberships, resolveCaller } from "../../../../lib/access";
import { errMsg, runQuery, transaction } from "../../../../lib/db";

export const dynamic = "force-dynamic";

// Permanently deletes the active store with all of its departments, team, schedules, shift templates,
// settings, store hours, and history. Only company admins may do this.
// Safeguards, all checked here as well as on the page:
// 1. The person must be a company admin.
// 2. They must type the store's name exactly.
// 3. They must confirm they understand the deletion is permanent.
// 4. At least one other store must remain, so the app is never left with no stores.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await isCompanyAdmin(caller.email)))
    return NextResponse.json({ error: "Only company admins can delete a store." }, { status: 403 });

  const requestBody = (await request.json().catch(() => ({}))) as {
    confirmName?: string;
    acknowledged?: boolean;
  };
  if (String(requestBody.confirmName ?? "").trim().toLowerCase() !== caller.storeName.trim().toLowerCase())
    return NextResponse.json(
      { error: "Type the store's name exactly to confirm." },
      { status: 400 },
    );
  if (requestBody.acknowledged !== true)
    return NextResponse.json(
      { error: "Tick the box to confirm the store and everything in it will be permanently deleted." },
      { status: 400 },
    );

  try {
    const [otherStoreRow] = await runQuery<{ count: number }>(
      "select count(*)::int as count from stores where id <> $1",
      [caller.storeId],
    );
    if (otherStoreRow.count < 1)
      return NextResponse.json(
        { error: "Create another store before deleting this one." },
        { status: 400 },
      );

    // Everything that belongs to the store's departments goes first, then the departments,
    // the store managers, and the store. Department access lists and audit history are removed
    // by the database along with their department.
    await transaction(async (transactionQuery) => {
      const storeId = caller.storeId;
      const departmentIdsSql = "select id from departments where store_id = $1";
      await transactionQuery(`delete from schedule where department_id in (${departmentIdsSql})`, [storeId]);
      await transactionQuery(`delete from schedule_weeks where department_id in (${departmentIdsSql})`, [storeId]);
      await transactionQuery(`delete from shift_templates where department_id in (${departmentIdsSql})`, [storeId]);
      await transactionQuery(`delete from employees where department_id in (${departmentIdsSql})`, [storeId]);
      await transactionQuery(`delete from store_hours where department_id in (${departmentIdsSql})`, [storeId]);
      await transactionQuery(`delete from settings where department_id in (${departmentIdsSql})`, [storeId]);
      await transactionQuery("delete from departments where store_id = $1", [storeId]);
      await transactionQuery("delete from store_members where store_id = $1", [storeId]);
      await transactionQuery("delete from stores where id = $1", [storeId]);
    });

    // Opens the first department the person can still reach, remembered like the department switch.
    const remainingMemberships = await listMemberships(caller.email);
    const nextDepartment = remainingMemberships[0];
    const response = NextResponse.json({ ok: true, departmentId: nextDepartment?.departmentId ?? null });
    if (nextDepartment)
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

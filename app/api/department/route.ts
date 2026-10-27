import { NextResponse } from "next/server";
import { ACTIVE_DEPARTMENT_COOKIE, resolveCaller } from "../../../lib/access";

export const dynamic = "force-dynamic";

// Switches the department the person is working in. Only departments they belong to are allowed.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;

  const { departmentId } = (await request.json().catch(() => ({}))) as { departmentId?: number };
  const requestedMembership = caller.memberships.find(
    (membership) => membership.departmentId === Number(departmentId),
  );
  if (!requestedMembership)
    return NextResponse.json({ error: "You are not a member of that department." }, { status: 403 });

  const response = NextResponse.json({ ok: true, departmentId: requestedMembership.departmentId });
  // Remembered for a year, so the choice carries over between visits.
  response.cookies.set(ACTIVE_DEPARTMENT_COOKIE, String(requestedMembership.departmentId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

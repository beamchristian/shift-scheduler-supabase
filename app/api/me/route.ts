import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";

export const dynamic = "force-dynamic";

// Returns who is signed in, the department they are working in, and every department they belong to.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  return NextResponse.json({
    email: caller.email,
    departmentId: caller.departmentId,
    departmentName: caller.departmentName,
    role: caller.role,
    memberships: caller.memberships,
  });
}

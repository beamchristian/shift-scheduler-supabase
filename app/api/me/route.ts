import { NextResponse } from "next/server";
import { canManageStore, isCompanyAdmin, resolveCaller } from "../../../lib/access";

export const dynamic = "force-dynamic";

// Returns who is signed in, the department and store they are working in, their role there,
// and every department they can open.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  return NextResponse.json({
    email: caller.email,
    departmentId: caller.departmentId,
    departmentName: caller.departmentName,
    storeId: caller.storeId,
    storeName: caller.storeName,
    isCompanyAdmin: await isCompanyAdmin(caller.email),
    canSeeStoreManagers: await canManageStore(caller.email, caller.storeId),
    role: caller.role,
    canManageAccess: caller.canManageAccess,
    memberships: caller.memberships,
  });
}

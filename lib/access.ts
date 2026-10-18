import { NextResponse } from "next/server";
import { SESSION_COOKIE, authConfigured, emailForToken } from "./auth";
import { runQuery } from "./db";

// Cookie that remembers which department the person is working in right now.
export const ACTIVE_DEPARTMENT_COOKIE = "ss_department";

// The three roles, from widest to narrowest:
// - admin: a company admin. Can see and change everything, including stores and store managers.
// - store_manager: manages everything in their store. Only an admin can assign them.
// - department_manager: works in their assigned departments. Can't change who has access,
//   and can't create or delete departments.
export type AccessRole = "admin" | "store_manager" | "department_manager";

// One department the signed-in person can open, and their role in it.
export interface Membership {
  departmentId: number;
  departmentName: string;
  storeId: number;
  storeName: string;
  role: AccessRole;
}

// The person making a request, and the department the request is for.
export interface Caller {
  email: string;
  departmentId: number;
  departmentName: string;
  storeId: number;
  storeName: string;
  role: AccessRole;
  // True for admins and store managers, who can change who has access to the department.
  canManageAccess: boolean;
  memberships: Membership[];
}

// Options for checking a request.
export interface ResolveCallerOptions {
  // When true, only admins and store managers are allowed through.
  accessManagersOnly?: boolean;
}

// True for roles that can change who has access, and create or delete departments.
export function canManageAccessRole(role: AccessRole): boolean {
  return role !== "department_manager";
}

// Reads one cookie's value from a request. Returns undefined when it is not there.
export function readCookie(request: Request, cookieName: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") || "";
  const matchingPart = cookieHeader
    .split(";")
    .map((piece) => piece.trim())
    .find((piece) => piece.startsWith(cookieName + "="));
  return matchingPart
    ? decodeURIComponent(matchingPart.slice(cookieName.length + 1))
    : undefined;
}

// Lists every department a person can open, with their role in each one.
// Each department gets the widest role the person has in it: admin, then store manager, then department manager.
export async function listMemberships(email: string): Promise<Membership[]> {
  const rows = await runQuery<{
    department_id: number;
    department_name: string;
    store_id: number;
    store_name: string;
    role_rank: number;
  }>(
    `with access as (
       select membership.department_id, 'department_manager' as role
       from department_members membership
       where lower(membership.email) = $1
       union all
       select department.id, 'store_manager'
       from departments department
       join store_members store_member on store_member.store_id = department.store_id
       where lower(store_member.email) = $1
       union all
       select department.id, 'admin'
       from departments department
       where exists (select 1 from app_admins admin where lower(admin.email) = $1)
     ),
     ranked as (
       select department_id,
              max(case role when 'admin' then 3 when 'store_manager' then 2 else 1 end) as role_rank
       from access
       group by department_id
     )
     select department.id as department_id, department.name as department_name,
            store.id as store_id, store.name as store_name,
            ranked.role_rank
     from ranked
     join departments department on department.id = ranked.department_id
     join stores store on store.id = department.store_id
     order by store.id, department.id`,
    [email.toLowerCase()],
  );
  return rows.map((row) => ({
    departmentId: row.department_id,
    departmentName: row.department_name,
    storeId: row.store_id,
    storeName: row.store_name,
    role: row.role_rank === 3 ? "admin" : row.role_rank === 2 ? "store_manager" : "department_manager",
  }));
}

// True when the person is a company admin, who can see and create every store.
export async function isCompanyAdmin(email: string): Promise<boolean> {
  const rows = await runQuery(
    "select 1 from app_admins where lower(email) = $1",
    [email.toLowerCase()],
  );
  return rows.length > 0;
}

// True when the person may see and manage the store managers of one store: a company admin,
// or a store manager of that store.
export async function canManageStore(email: string, storeId: number): Promise<boolean> {
  if (await isCompanyAdmin(email)) return true;
  const rows = await runQuery(
    "select 1 from store_members where store_id = $1 and lower(email) = $2",
    [storeId, email.toLowerCase()],
  );
  return rows.length > 0;
}

// Works out who is calling and which department the request is for.
// Returns a Caller when the request may continue, or a Response to send back (sign-in or access error).
export async function resolveCaller(
  request: Request,
  options: ResolveCallerOptions = {},
): Promise<Caller | Response> {
  // Without sign-in set up, only local development is allowed through, as the Deli department.
  if (!authConfigured()) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json(
        { error: "Sign-in is not configured." },
        { status: 503 },
      );
    const localMembership: Membership = {
      departmentId: 1,
      departmentName: "Deli",
      storeId: 1,
      storeName: "Store 1",
      role: "admin",
    };
    return {
      email: "local",
      departmentId: 1,
      departmentName: "Deli",
      storeId: 1,
      storeName: "Store 1",
      role: "admin",
      canManageAccess: true,
      memberships: [localMembership],
    };
  }

  const signedInEmail = await emailForToken(readCookie(request, SESSION_COOKIE));
  if (!signedInEmail)
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const memberships = await listMemberships(signedInEmail);
  if (!memberships.length)
    return NextResponse.json(
      { error: "You do not have access to any department. Ask a store manager or company admin to add you." },
      { status: 403 },
    );

  // Use the department remembered in the cookie if the person is still on it. Otherwise use their first one.
  const rememberedDepartmentId = Number(readCookie(request, ACTIVE_DEPARTMENT_COOKIE));
  const activeMembership =
    memberships.find((membership) => membership.departmentId === rememberedDepartmentId) ??
    memberships[0];

  const canManageAccess = canManageAccessRole(activeMembership.role);
  if (options.accessManagersOnly && !canManageAccess)
    return NextResponse.json(
      { error: "Only company admins and store managers can do this." },
      { status: 403 },
    );

  return {
    email: signedInEmail,
    departmentId: activeMembership.departmentId,
    departmentName: activeMembership.departmentName,
    storeId: activeMembership.storeId,
    storeName: activeMembership.storeName,
    role: activeMembership.role,
    canManageAccess,
    memberships,
  };
}

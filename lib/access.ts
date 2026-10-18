import { NextResponse } from "next/server";
import { SESSION_COOKIE, authConfigured, emailForToken } from "./auth";
import { runQuery } from "./db";

// Cookie that remembers which department the person is working in right now.
export const ACTIVE_DEPARTMENT_COOKIE = "ss_department";

// The roles a person can have in a department.
export type DepartmentRole = "owner" | "manager";

// One department the signed-in person belongs to, and their role in it.
export interface Membership {
  departmentId: number;
  departmentName: string;
  role: DepartmentRole;
}

// The person making a request, and the department the request is for.
export interface Caller {
  email: string;
  departmentId: number;
  departmentName: string;
  role: DepartmentRole;
  memberships: Membership[];
}

// Options for checking a request.
export interface ResolveCallerOptions {
  // When true, only owners of the active department are allowed through.
  ownerOnly?: boolean;
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

// Lists every department a person is on, with their role in each one.
export async function listMemberships(email: string): Promise<Membership[]> {
  const rows = await runQuery<{
    department_id: number;
    department_name: string;
    role: DepartmentRole;
  }>(
    `select membership.department_id, department.name as department_name, membership.role
     from department_members membership
     join departments department on department.id = membership.department_id
     where lower(membership.email) = $1
     order by department.id`,
    [email.toLowerCase()],
  );
  return rows.map((row) => ({
    departmentId: row.department_id,
    departmentName: row.department_name,
    role: row.role,
  }));
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
    return {
      email: "local",
      departmentId: 1,
      departmentName: "Deli",
      role: "owner",
      memberships: [{ departmentId: 1, departmentName: "Deli", role: "owner" }],
    };
  }

  const signedInEmail = await emailForToken(readCookie(request, SESSION_COOKIE));
  if (!signedInEmail)
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const memberships = await listMemberships(signedInEmail);
  if (!memberships.length)
    return NextResponse.json(
      { error: "You do not have access to any department. Ask an owner to add you on the Access tab." },
      { status: 403 },
    );

  // Use the department remembered in the cookie if the person is still on it. Otherwise use their first one.
  const rememberedDepartmentId = Number(readCookie(request, ACTIVE_DEPARTMENT_COOKIE));
  const activeMembership =
    memberships.find((membership) => membership.departmentId === rememberedDepartmentId) ??
    memberships[0];

  if (options.ownerOnly && activeMembership.role !== "owner")
    return NextResponse.json(
      { error: "Only owners of this department can do this." },
      { status: 403 },
    );

  return {
    email: signedInEmail,
    departmentId: activeMembership.departmentId,
    departmentName: activeMembership.departmentName,
    role: activeMembership.role,
    memberships,
  };
}

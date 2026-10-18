import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, runQuery } from "../../../lib/db";

export const dynamic = "force-dynamic";

// One person on the active department's access list.
interface Member {
  id: number;
  email: string;
  role: string;
}

// Lists everyone who can sign in to one department, owners first.
async function listMembers(departmentId: number): Promise<Member[]> {
  return runQuery<Member>(
    "select id, email, role from department_members where department_id = $1 order by role, email",
    [departmentId],
  );
}

// Counts the owners of one department. Used so the last owner cannot be removed or demoted.
async function countOwners(departmentId: number): Promise<number> {
  const [ownerCountRow] = await runQuery<{ count: number }>(
    "select count(*)::int as count from department_members where department_id = $1 and role = 'owner'",
    [departmentId],
  );
  return ownerCountRow.count;
}

// Looks up one access-list entry, but only if it belongs to the given department.
async function findMember(memberId: number, departmentId: number): Promise<Member | undefined> {
  const [memberRow] = await runQuery<Member>(
    "select id, email, role from department_members where id = $1 and department_id = $2",
    [memberId, departmentId],
  );
  return memberRow;
}

// Returns the access list for the active department, and whether the caller may change it.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  return NextResponse.json({
    members: await listMembers(caller.departmentId),
    canManage: caller.role === "owner",
  });
}

// Changes the access list for the active department. Only owners may do this.
// Actions: "add" (email and role), "role" (member id and new role), "remove" (member id).
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { ownerOnly: true });
  if (caller instanceof Response) return caller;

  const departmentId = caller.departmentId;
  const requestBody = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    email?: string;
    role?: string;
  };
  const requestedRole =
    requestBody.role === "owner" || requestBody.role === "manager" ? requestBody.role : null;
  const requestedMemberId = Number(requestBody.id);

  try {
    if (requestBody.action === "add") {
      const newMemberEmail = String(requestBody.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMemberEmail))
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      if (!requestedRole)
        return NextResponse.json({ error: "Choose owner or manager." }, { status: 400 });
      // If the person is already listed, this only changes their role.
      await runQuery(
        `insert into department_members (department_id, email, role) values ($1, $2, $3)
         on conflict (department_id, email) do update set role = excluded.role`,
        [departmentId, newMemberEmail, requestedRole],
      );
      await recordAuditEntry(departmentId, caller.email, "access_added", `${newMemberEmail} as ${requestedRole}`);
    } else if (requestBody.action === "role") {
      if (!requestedRole)
        return NextResponse.json({ error: "Choose owner or manager." }, { status: 400 });
      const memberToChange = await findMember(requestedMemberId, departmentId);
      if (!memberToChange)
        return NextResponse.json({ error: "That person was not found." }, { status: 404 });
      const isDemotingLastOwner =
        memberToChange.role === "owner" &&
        requestedRole !== "owner" &&
        (await countOwners(departmentId)) <= 1;
      if (isDemotingLastOwner)
        return NextResponse.json({ error: "Keep at least one owner." }, { status: 400 });
      await runQuery("update department_members set role = $1 where id = $2", [requestedRole, memberToChange.id]);
      await recordAuditEntry(departmentId, caller.email, "access_role_changed", `${memberToChange.email} to ${requestedRole}`);
    } else if (requestBody.action === "remove") {
      const memberToRemove = await findMember(requestedMemberId, departmentId);
      if (!memberToRemove)
        return NextResponse.json({ error: "That person was not found." }, { status: 404 });
      const isRemovingLastOwner =
        memberToRemove.role === "owner" && (await countOwners(departmentId)) <= 1;
      if (isRemovingLastOwner)
        return NextResponse.json({ error: "Keep at least one owner." }, { status: 400 });
      await runQuery("delete from department_members where id = $1", [memberToRemove.id]);
      await recordAuditEntry(departmentId, caller.email, "access_removed", memberToRemove.email);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ members: await listMembers(departmentId), canManage: true });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

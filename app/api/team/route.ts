import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, runQuery } from "../../../lib/db";

export const dynamic = "force-dynamic";

// One person on the active department's access list. Everyone on the list is a department manager.
interface Member {
  id: number;
  email: string;
  role: string;
}

// Lists everyone who can work in one department.
async function listMembers(departmentId: number): Promise<Member[]> {
  return runQuery<Member>(
    "select id, email, role from department_members where department_id = $1 order by email",
    [departmentId],
  );
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
    canManage: caller.canManageAccess,
  });
}

// Adds or removes a department manager. Only company admins and store managers may do this.
// Actions: "add" (email) and "remove" (member id).
export async function POST(request: Request) {
  const caller = await resolveCaller(request, { accessManagersOnly: true });
  if (caller instanceof Response) return caller;

  const departmentId = caller.departmentId;
  const requestBody = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    email?: string;
  };
  const requestedMemberId = Number(requestBody.id);

  try {
    if (requestBody.action === "add") {
      const newMemberEmail = String(requestBody.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMemberEmail))
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      // Adding someone who is already listed does nothing.
      await runQuery(
        `insert into department_members (department_id, email, role) values ($1, $2, 'manager')
         on conflict (department_id, email) do nothing`,
        [departmentId, newMemberEmail],
      );
      await recordAuditEntry(departmentId, caller.email, "access_added", newMemberEmail);
    } else if (requestBody.action === "update") {
      const memberToEdit = await findMember(requestedMemberId, departmentId);
      if (!memberToEdit)
        return NextResponse.json({ error: "That person was not found." }, { status: 404 });
      const changedEmail = String(requestBody.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changedEmail))
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      const [alreadyListed] = await runQuery(
        "select id from department_members where department_id = $1 and lower(email) = $2 and id <> $3",
        [departmentId, changedEmail, memberToEdit.id],
      );
      if (alreadyListed)
        return NextResponse.json({ error: "That person is already on this department." }, { status: 400 });
      await runQuery("update department_members set email = $1 where id = $2", [changedEmail, memberToEdit.id]);
      await recordAuditEntry(departmentId, caller.email, "access_changed", `${memberToEdit.email} to ${changedEmail}`);
    } else if (requestBody.action === "remove") {
      const memberToRemove = await findMember(requestedMemberId, departmentId);
      if (!memberToRemove)
        return NextResponse.json({ error: "That person was not found." }, { status: 404 });
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

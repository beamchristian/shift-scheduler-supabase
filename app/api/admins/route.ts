import { NextResponse } from "next/server";
import { isCompanyAdmin, resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, runQuery, transaction } from "../../../lib/db";

export const dynamic = "force-dynamic";

// One company admin.
interface CompanyAdmin {
  email: string;
}

// Lists every company admin, in email order.
async function listCompanyAdmins(): Promise<CompanyAdmin[]> {
  return runQuery<CompanyAdmin>("select email from app_admins order by email");
}

// Returns the company admins. Only company admins may see this list.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await isCompanyAdmin(caller.email)))
    return NextResponse.json({ error: "Only company admins can see this list." }, { status: 403 });
  return NextResponse.json({ admins: await listCompanyAdmins() });
}

// Adds or removes a company admin. Only company admins may do this.
// Actions: "add" (email) and "remove" (email). The last admin cannot be removed.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await isCompanyAdmin(caller.email)))
    return NextResponse.json({ error: "Only company admins can change this list." }, { status: 403 });

  const requestBody = (await request.json().catch(() => ({}))) as {
    action?: string;
    email?: string;
    newEmail?: string;
  };
  const adminEmail = String(requestBody.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  try {
    if (requestBody.action === "add") {
      await runQuery(
        "insert into app_admins (email) values ($1) on conflict do nothing",
        [adminEmail],
      );
      await recordAuditEntry(caller.departmentId, caller.email, "Added company admin", adminEmail);
    } else if (requestBody.action === "update") {
      if (adminEmail === caller.email.toLowerCase())
        return NextResponse.json({ error: "You can't change your own admin email. Another admin can do it." }, { status: 400 });
      const changedEmail = String(requestBody.newEmail || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changedEmail))
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      const [alreadyAdmin] = await runQuery(
        "select email from app_admins where lower(email) = $1",
        [changedEmail],
      );
      if (alreadyAdmin)
        return NextResponse.json({ error: "That person is already a company admin." }, { status: 400 });
      await runQuery("update app_admins set email = $1 where lower(email) = $2", [changedEmail, adminEmail]);
      await recordAuditEntry(caller.departmentId, caller.email, "Changed company admin", `${adminEmail} to ${changedEmail}`);
    } else if (requestBody.action === "remove") {
      // The count and the delete run together, and lock the table, so two admins removing each other
      // at the same moment can't leave no admins at all.
      const removedAdmin = await transaction(async (transactionQuery) => {
        await transactionQuery("lock table app_admins in share row exclusive mode");
        const [adminCountRow] = await transactionQuery<{ count: number }>(
          "select count(*)::int as count from app_admins",
        );
        if (adminCountRow.count <= 1) return "last-admin" as const;
        await transactionQuery("delete from app_admins where lower(email) = $1", [adminEmail]);
        return "removed" as const;
      });
      if (removedAdmin === "last-admin")
        return NextResponse.json(
          { error: "Keep at least one company admin. Add another admin before removing this one." },
          { status: 400 },
        );
      await recordAuditEntry(caller.departmentId, caller.email, "Removed company admin", adminEmail);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ admins: await listCompanyAdmins() });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

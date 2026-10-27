import { NextResponse } from "next/server";
import { canManageStore, isCompanyAdmin, resolveCaller } from "../../../lib/access";
import { recordAuditEntry } from "../../../lib/audit";
import { errMsg, runQuery } from "../../../lib/db";

export const dynamic = "force-dynamic";

// One store manager of the active store.
interface StoreManager {
  id: number;
  email: string;
}

// Lists the store managers of the store the active department is in.
async function listStoreManagers(storeId: number): Promise<StoreManager[]> {
  return runQuery<StoreManager>(
    "select id, email from store_members where store_id = $1 order by email",
    [storeId],
  );
}

// Returns the store name and its store managers. Store managers and admins can see the list.
// Only company admins can change it, so canManage is true for admins alone.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  const canSee = await canManageStore(caller.email, caller.storeId);
  return NextResponse.json({
    storeName: caller.storeName,
    storeManagers: canSee ? await listStoreManagers(caller.storeId) : [],
    canManage: await isCompanyAdmin(caller.email),
  });
}

// Adds or removes a store manager of the active store. Only company admins may do this.
// Actions: "add" (email) and "remove" (store manager id).
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await isCompanyAdmin(caller.email)))
    return NextResponse.json(
      { error: "Only company admins can add or remove store managers." },
      { status: 403 },
    );

  const requestBody = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    email?: string;
  };

  try {
    if (requestBody.action === "add") {
      const managerEmail = String(requestBody.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail))
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      await runQuery(
        "insert into store_members (store_id, email) values ($1, $2) on conflict do nothing",
        [caller.storeId, managerEmail],
      );
      await recordAuditEntry(caller.departmentId, caller.email, "Added store manager", managerEmail);
      return NextResponse.json({ ok: true });
    }

    if (requestBody.action === "update") {
      const changedEmail = String(requestBody.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changedEmail))
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      const memberId = Number(requestBody.id);
      const [alreadyManager] = await runQuery(
        "select id from store_members where store_id = $1 and lower(email) = $2 and id <> $3",
        [caller.storeId, changedEmail, memberId],
      );
      if (alreadyManager)
        return NextResponse.json({ error: "That person is already a store manager." }, { status: 400 });
      const [changedRow] = await runQuery<{ email: string }>(
        "update store_members set email = $1 where id = $2 and store_id = $3 returning email",
        [changedEmail, memberId, caller.storeId],
      );
      if (!changedRow)
        return NextResponse.json({ error: "That store manager was not found." }, { status: 404 });
      await recordAuditEntry(caller.departmentId, caller.email, "Changed store manager", `to ${changedEmail}`);
      return NextResponse.json({ ok: true });
    }

    if (requestBody.action === "remove") {
      const memberId = Number(requestBody.id);
      // Only remove a manager of this store, so a request cannot change another store's list.
      const [removedManager] = await runQuery<{ email: string }>(
        "delete from store_members where id = $1 and store_id = $2 returning email",
        [memberId, caller.storeId],
      );
      if (!removedManager)
        return NextResponse.json({ error: "That store manager was not found." }, { status: 404 });
      await recordAuditEntry(caller.departmentId, caller.email, "Removed store manager", removedManager.email);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isCompanyAdmin, resolveCaller } from "../../../../lib/access";
import { recordAuditEntry } from "../../../../lib/audit";
import { errMsg, runQuery } from "../../../../lib/db";

export const dynamic = "force-dynamic";

// The longest store name allowed.
const MAX_NAME_LENGTH = 40;

// Renames the active store. Only company admins may do this. Store names must be unique, ignoring capitals.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await isCompanyAdmin(caller.email)))
    return NextResponse.json({ error: "Only company admins can rename a store." }, { status: 403 });

  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  const newName = String(name ?? "").trim();
  if (!newName)
    return NextResponse.json({ error: "Enter a name for the store." }, { status: 400 });
  if (newName.length > MAX_NAME_LENGTH)
    return NextResponse.json(
      { error: `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );

  try {
    const [sameNameStore] = await runQuery(
      "select id from stores where lower(name) = lower($1) and id <> $2",
      [newName, caller.storeId],
    );
    if (sameNameStore)
      return NextResponse.json({ error: "A store with that name already exists." }, { status: 400 });

    await runQuery("update stores set name = $1 where id = $2", [newName, caller.storeId]);
    await recordAuditEntry(caller.departmentId, caller.email, "Renamed store", `${caller.storeName} to ${newName}`);
    return NextResponse.json({ ok: true });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

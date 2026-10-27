import { NextResponse } from "next/server";
import { canManageStore, resolveCaller } from "../../../lib/access";
import { errMsg } from "../../../lib/db";
import { loadStoreOverview } from "../../../lib/storeOverviewData";

export const dynamic = "force-dynamic";

// Returns the labor matrix for the whole store: every department in the caller's store, added together by day.
// Only company admins and store managers of that store can open it.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await canManageStore(caller.email, caller.storeId)))
    return NextResponse.json(
      { error: "Only company admins and store managers can see the store overview." },
      { status: 403 },
    );
  try {
    return NextResponse.json(await loadStoreOverview(caller.storeId, caller.storeName));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { canManageStore, resolveCaller } from "../../../lib/access";
import { errMsg } from "../../../lib/db";
import { readWeekStart } from "../../../lib/scheduleWeeks";
import { loadStoreOverview } from "../../../lib/storeOverviewData";

export const dynamic = "force-dynamic";

// Returns the labor matrix for the whole store for one week ("?week=YYYY-MM-DD", or the upcoming week):
// every department in the caller's store, added together by day.
// Only company admins and store managers of that store can open it.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  const weekStart = readWeekStart(request);
  if (weekStart instanceof Response) return weekStart;
  if (!(await canManageStore(caller.email, caller.storeId)))
    return NextResponse.json(
      { error: "Only company admins and store managers can see the store overview." },
      { status: 403 },
    );
  try {
    return NextResponse.json(await loadStoreOverview(caller.storeId, caller.storeName, weekStart));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

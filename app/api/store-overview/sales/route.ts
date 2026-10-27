import { NextResponse } from "next/server";
import { canManageStore, resolveCaller } from "../../../../lib/access";
import { errMsg, runQuery } from "../../../../lib/db";
import { loadStoreOverview } from "../../../../lib/storeOverviewData";

export const dynamic = "force-dynamic";

// What the store overview sends when someone changes a department's weekly projected sales.
interface SaveWeeklySalesRequest {
  departmentId: number;
  weeklySales: number | string;
}

// Saves a department's weekly projected sales. The day split keeps the day weights already set in Settings,
// so only the weekly total changes. Returns the updated store overview. Only company admins and store managers of the same store may change it.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await canManageStore(caller.email, caller.storeId)))
    return NextResponse.json(
      { error: "Only company admins and store managers can change projected sales." },
      { status: 403 },
    );

  const { departmentId, weeklySales } = (await request.json()) as SaveWeeklySalesRequest;
  const weeklySalesNumber = Number(weeklySales);
  if (!Number.isInteger(Number(departmentId)) || !Number.isFinite(weeklySalesNumber) || weeklySalesNumber < 0)
    return NextResponse.json({ error: "Enter a weekly sales amount of zero or more." }, { status: 400 });

  try {
    // The department must belong to the caller's store.
    const ownershipRows = await runQuery(
      "select 1 from departments where id = $1 and store_id = $2",
      [Number(departmentId), caller.storeId],
    );
    if (!ownershipRows.length)
      return NextResponse.json({ error: "That department is not in your store." }, { status: 403 });

    await runQuery("update settings set weekly_sales = $1 where department_id = $2", [
      weeklySalesNumber,
      Number(departmentId),
    ]);
    return NextResponse.json(await loadStoreOverview(caller.storeId, caller.storeName));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

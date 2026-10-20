import { NextResponse } from "next/server";
import { canManageStore, resolveCaller } from "../../../../lib/access";
import { errMsg, runQuery, transaction } from "../../../../lib/db";
import { weightsFromDailySales } from "../../../../lib/storeOverview";

export const dynamic = "force-dynamic";

// What the store overview sends when someone types in a department's projected sales.
// dailySales maps each day number (1 = Monday) to the dollars projected for that day.
interface SaveDailySalesRequest {
  departmentId: number;
  dailySales: Record<string, number | string>;
}

// Saves the projected sales typed on the store overview for one department.
// Only company admins and store managers of the same store may change them.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  if (!(await canManageStore(caller.email, caller.storeId)))
    return NextResponse.json(
      {
        error:
          "Only company admins and store managers can change projected sales.",
      },
      { status: 403 },
    );

  const { departmentId, dailySales } =
    (await request.json()) as SaveDailySalesRequest;
  const dayEntries = Object.entries(dailySales ?? {}).map(
    ([dayText, dollarsValue]) =>
      [Number(dayText), Number(dollarsValue)] as const,
  );
  const hasBadEntry = dayEntries.some(
    ([dayNumber, dollars]) =>
      !Number.isInteger(dayNumber) ||
      dayNumber < 1 ||
      dayNumber > 6 ||
      !Number.isFinite(dollars) ||
      dollars < 0,
  );
  if (!Number.isInteger(Number(departmentId)) || hasBadEntry)
    return NextResponse.json(
      { error: "Enter a dollar amount of zero or more for each day." },
      { status: 400 },
    );

  try {
    // The department must belong to the caller's store.
    const ownershipRows = await runQuery(
      "select 1 from departments where id = $1 and store_id = $2",
      [Number(departmentId), caller.storeId],
    );
    if (!ownershipRows.length)
      return NextResponse.json(
        { error: "That department is not in your store." },
        { status: 403 },
      );

    const { weeklySales, dayWeights } = weightsFromDailySales(
      Object.fromEntries(
        dayEntries.map(([dayNumber, dollars]) => [dayNumber, dollars]),
      ),
    );
    // Both changes happen together, so the week forecast and the day weights never disagree.
    await transaction(async (transactionQuery) => {
      await transactionQuery(
        "update settings set weekly_sales = $1 where department_id = $2",
        [weeklySales, Number(departmentId)],
      );
      for (const [dayNumber, dayWeight] of Object.entries(dayWeights))
        await transactionQuery(
          "update store_hours set sales_pct = $1 where department_id = $2 and day = $3",
          [dayWeight, Number(departmentId), Number(dayNumber)],
        );
    });
    return NextResponse.json({ ok: true });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { errMsg, snapshot } from "../../../lib/db";
import { swapClosers } from "../../../lib/swap";

export const dynamic = "force-dynamic";

// Swaps the closer on one day (Monday to Saturday) in the active department's schedule.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;

  const { day } = (await request.json()) as { day: number };
  if (!(day >= 1 && day <= 6))
    return NextResponse.json({ error: "Pick a day from Monday to Saturday." }, { status: 400 });
  try {
    const swapResult = await swapClosers(day, caller.departmentId);
    return NextResponse.json({ ...(await snapshot(caller.departmentId)), ...swapResult });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

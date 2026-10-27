import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { errMsg } from "../../../lib/db";
import { preview } from "../../../lib/generate";

export const dynamic = "force-dynamic";

// Checks whether the active department's team can cover every required shift. Saves nothing.
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  try {
    return NextResponse.json(await preview(caller.departmentId));
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

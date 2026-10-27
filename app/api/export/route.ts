import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { errMsg } from "../../../lib/db";
import { exportAll } from "../../../lib/backup";

export const dynamic = "force-dynamic";

// Downloads the active department's data as a JSON file.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  try {
    const todayDate = new Date().toISOString().slice(0, 10);
    const exportFileText = JSON.stringify(await exportAll(caller.departmentId), null, 2);
    return new Response(exportFileText, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="shift-scheduler-${caller.departmentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${todayDate}.json"`,
      },
    });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

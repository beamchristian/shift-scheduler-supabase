import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { errMsg, snapshot } from "../../../lib/db";
import { buildPdf } from "../../../lib/pdf";
import { readWeekStart } from "../../../lib/scheduleWeeks";

export const dynamic = "force-dynamic";

// Builds the printable schedule (with the labor matrix and payroll) for one week of the active department
// ("?week=YYYY-MM-DD", or the upcoming week).
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  const weekStart = readWeekStart(request);
  if (weekStart instanceof Response) return weekStart;
  try {
    const departmentSnapshot = await snapshot(caller.departmentId, weekStart);
    const pdfBytes = await buildPdf(departmentSnapshot);
    // File name comes from the schedule title and the week, for example "deli-schedule-2026-11-02.pdf".
    const titleSlug =
      (departmentSnapshot.settings.schedule_title || "schedule")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "schedule";
    const fileNameSlug = `${titleSlug}-${weekStart}`;
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileNameSlug}.pdf"`,
      },
    });
  } catch (thrownError) {
    return NextResponse.json({ error: errMsg(thrownError) }, { status: 500 });
  }
}

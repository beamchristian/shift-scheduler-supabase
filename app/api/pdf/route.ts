import { NextResponse } from "next/server";
import { resolveCaller } from "../../../lib/access";
import { errMsg, snapshot } from "../../../lib/db";
import { buildPdf } from "../../../lib/pdf";

export const dynamic = "force-dynamic";

// Builds the printable schedule (with the labor matrix and payroll) for the active department.
export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (caller instanceof Response) return caller;
  try {
    const departmentSnapshot = await snapshot(caller.departmentId);
    const pdfBytes = await buildPdf(departmentSnapshot);
    // File name comes from the schedule title, for example "weekly-schedule.pdf".
    const fileNameSlug =
      (departmentSnapshot.settings.schedule_title || "schedule")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "schedule";
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

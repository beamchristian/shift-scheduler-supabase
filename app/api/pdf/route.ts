import { NextResponse } from "next/server";
import { errMsg, snapshot } from "../../../lib/db";
import { buildPdf } from "../../../lib/pdf";
import { whoAmI } from "../../../lib/access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await whoAmI(req);
  if (me instanceof Response) return me;
  try {
    const snap = await snapshot();
    const bytes = await buildPdf(snap);
    const slug =
      (snap.settings.schedule_title || "schedule")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "schedule";
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${slug}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

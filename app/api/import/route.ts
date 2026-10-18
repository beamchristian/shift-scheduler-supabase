import { NextResponse } from "next/server";
import { snapshot } from "../../../lib/db";
import { importAll } from "../../../lib/backup";
import { whoAmI } from "../../../lib/access";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await whoAmI(req, { ownerOnly: true });
  if (me instanceof Response) return me;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "That file is not valid JSON." },
      { status: 400 },
    );
  }
  const r = await importAll(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(await snapshot());
}

import { NextResponse } from 'next/server';
import { errMsg, snapshot } from '../../../lib/db';
import { generate } from '../../../lib/generate';
import { whoAmI } from '../../../lib/access';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await whoAmI(req);
  if (me instanceof Response) return me;
  try {
    const warnings = await generate();
    return NextResponse.json({ ...(await snapshot()), warnings });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { errMsg } from '../../../lib/db';
import { preview } from '../../../lib/generate';
import { whoAmI } from '../../../lib/access';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await whoAmI(req);
  if (me instanceof Response) return me;
  try { return NextResponse.json(await preview()); } catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}

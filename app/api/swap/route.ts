import { NextResponse } from 'next/server';
import { errMsg, snapshot } from '../../../lib/db';
import { swapClosers } from '../../../lib/swap';
import { whoAmI } from '../../../lib/access';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await whoAmI(req);
  if (me instanceof Response) return me;
  const { day } = (await req.json()) as { day: number };
  if (!(day >= 1 && day <= 6)) return NextResponse.json({ error: 'Pick a day from Monday to Saturday.' }, { status: 400 });
  try {
    const r = await swapClosers(day);
    return NextResponse.json({ ...(await snapshot()), ...r });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

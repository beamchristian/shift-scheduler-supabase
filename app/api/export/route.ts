import { NextResponse } from 'next/server';
import { errMsg } from '../../../lib/db';
import { whoAmI } from '../../../lib/access';
import { exportAll } from '../../../lib/backup';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const me = await whoAmI(req);
  if (me instanceof Response) return me;
  try {
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(await exportAll(), null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="shift-scheduler-${date}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

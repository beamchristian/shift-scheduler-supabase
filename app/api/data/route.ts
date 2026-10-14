import { NextResponse } from 'next/server';
import { COLS, coerce, errMsg, q, snapshot } from '../../../lib/db';
import type { TableName } from '../../../lib/types';

export const dynamic = 'force-dynamic';

type Body = { action: 'save' | 'delete'; table: TableName; row: Record<string, string | number | null> & { id?: number } };

export async function GET() {
  try { return NextResponse.json(await snapshot()); } catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}

// Whitelisted generic save/delete so each table editor shares one endpoint.
export async function POST(req: Request) {
  const { action, table, row } = (await req.json()) as Body;
  if (!Object.prototype.hasOwnProperty.call(COLS, table)) return NextResponse.json({ error: 'bad table' }, { status: 400 });
  const cols = COLS[table];
  let newId: number | undefined;
  try {
    if (action === 'delete') {
      await q(`delete from ${table} where id=$1`, [Number(row.id)]);
    } else {
      const vals = cols.map((c) => coerce(c, row[c]));
      if (row.id) {
        await q(`update ${table} set ${cols.map((c, i) => `"${c}"=$${i + 1}`).join(',')} where id=$${cols.length + 1}`, [...vals, Number(row.id)]);
      } else {
        const r = await q<{ id: number }>(`insert into ${table} (${cols.map((c) => `"${c}"`).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, vals);
        newId = r[0].id;
      }
    }
    return NextResponse.json({ ...(await snapshot()), newId });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 400 });
  }
}

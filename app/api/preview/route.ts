import { NextResponse } from 'next/server';
import { errMsg } from '../../../lib/db';
import { preview } from '../../../lib/generate';

export const dynamic = 'force-dynamic';

export async function POST() {
  try { return NextResponse.json(await preview()); } catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}

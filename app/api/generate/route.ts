import { NextResponse } from 'next/server';
import { errMsg, snapshot } from '../../../lib/db';
import { generate } from '../../../lib/generate';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const warnings = await generate();
    return NextResponse.json({ ...(await snapshot()), warnings });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

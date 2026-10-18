import { NextResponse } from 'next/server';
import { COOKIE, signIn } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  const r = await signIn(body.email, body.password);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, r.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: r.maxAge,
  });
  return res;
}

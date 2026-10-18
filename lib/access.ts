import { NextResponse } from 'next/server';
import { COOKIE, authConfigured, emailForToken } from './auth';
import { q } from './db';

// Until department switching is added, every request is checked against Deli (department 1).
export const DEPT = 1;

export type Who = { email: string; role: 'owner' | 'manager' };

export function tokenFrom(req: Request): string | undefined {
  const cookie = req.headers.get('cookie') || '';
  const part = cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : undefined;
}

// Returns who is calling if they are on the department list. Otherwise returns a response to send back.
export async function whoAmI(req: Request, opts: { ownerOnly?: boolean } = {}): Promise<Who | Response> {
  if (!authConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Sign-in is not configured.' }, { status: 503 });
    }
    return { email: 'local', role: 'owner' };
  }
  const email = await emailForToken(tokenFrom(req));
  if (!email) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const rows = await q<{ role: string }>(
    'select role from department_members where department_id = $1 and lower(email) = $2',
    [DEPT, email],
  );
  const role = rows[0]?.role;
  if (role !== 'owner' && role !== 'manager') {
    return NextResponse.json({ error: 'You do not have access to this department. Ask an owner to add you.' }, { status: 403 });
  }
  if (opts.ownerOnly && role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can do this.' }, { status: 403 });
  }
  return { email, role };
}

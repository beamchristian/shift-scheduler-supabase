import { NextResponse } from 'next/server';
import { DEPT, whoAmI } from '../../../lib/access';
import { errMsg, q } from '../../../lib/db';

export const dynamic = 'force-dynamic';

type Member = { id: number; email: string; role: string };

async function list(): Promise<Member[]> {
  return q<Member>('select id, email, role from department_members where department_id = $1 order by role, email', [DEPT]);
}

async function ownerCount(): Promise<number> {
  const r = await q<{ n: number }>("select count(*)::int as n from department_members where department_id = $1 and role = 'owner'", [DEPT]);
  return r[0].n;
}

async function audit(email: string, action: string, detail: string) {
  await q('insert into audit_log (department_id, email, action, detail) values ($1, $2, $3, $4)', [DEPT, email, action, detail]);
}

export async function GET(req: Request) {
  try {
    const me = await whoAmI(req);
    if (me instanceof Response) return me;
    return NextResponse.json({ members: await list(), canManage: me.role === 'owner' });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

// Actions: add (email, role), role (id, role), remove (id). Only owners may change access.
export async function POST(req: Request) {
  try {
    const me = await whoAmI(req, { ownerOnly: true });
    if (me instanceof Response) return me;

    const body = (await req.json().catch(() => ({}))) as { action?: string; id?: number; email?: string; role?: string };
    const role = body.role === 'owner' || body.role === 'manager' ? body.role : null;

    if (body.action === 'add') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      if (!role) return NextResponse.json({ error: 'Choose owner or manager.' }, { status: 400 });
      await q(
        'insert into department_members (department_id, email, role) values ($1, $2, $3) on conflict (department_id, email) do update set role = excluded.role',
        [DEPT, email, role],
      );
      await audit(me.email, 'access_added', `${email} as ${role}`);
    } else if (body.action === 'role') {
      if (!role) return NextResponse.json({ error: 'Choose owner or manager.' }, { status: 400 });
      const target = (await q<Member>('select id, email, role from department_members where id = $1 and department_id = $2', [Number(body.id), DEPT]))[0];
      if (!target) return NextResponse.json({ error: 'That person was not found.' }, { status: 404 });
      if (target.role === 'owner' && role !== 'owner' && (await ownerCount()) <= 1)
        return NextResponse.json({ error: 'Keep at least one owner.' }, { status: 400 });
      await q('update department_members set role = $1 where id = $2', [role, target.id]);
      await audit(me.email, 'access_role_changed', `${target.email} to ${role}`);
    } else if (body.action === 'remove') {
      const target = (await q<Member>('select id, email, role from department_members where id = $1 and department_id = $2', [Number(body.id), DEPT]))[0];
      if (!target) return NextResponse.json({ error: 'That person was not found.' }, { status: 404 });
      if (target.role === 'owner' && (await ownerCount()) <= 1)
        return NextResponse.json({ error: 'Keep at least one owner.' }, { status: 400 });
      await q('delete from department_members where id = $1', [target.id]);
      await audit(me.email, 'access_removed', target.email);
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    return NextResponse.json({ members: await list(), canManage: true });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';

// Password gate for the whole site (pages and API), using HTTP Basic auth.
// Set APP_PASSWORD (and optionally APP_USER) in your environment. In production the app refuses to run without it,
// because it holds employee pay data.
export function middleware(req: NextRequest) {
  const pass = process.env.APP_PASSWORD;
  if (!pass) {
    if (process.env.NODE_ENV === 'production') return new NextResponse('Set the APP_PASSWORD environment variable to use this app.', { status: 503 });
    return NextResponse.next();
  }
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(':');
    const user = decoded.slice(0, i);
    const given = decoded.slice(i + 1);
    const wantUser = process.env.APP_USER;
    if (given === pass && (!wantUser || user === wantUser)) return NextResponse.next();
  }
  return new NextResponse('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Shift Scheduler"' } });
}

export const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)' };

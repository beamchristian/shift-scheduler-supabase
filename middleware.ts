import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, authConfigured, emailForToken } from './lib/auth';

// Every page and API route needs a signed-in user, except the sign-in page and its API.
const PUBLIC = new Set(['/login', '/api/login']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.has(pathname)) return NextResponse.next();

  if (!authConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Set SUPABASE_URL and SUPABASE_ANON_KEY to use this app.', { status: 503 });
    }
    return NextResponse.next();
  }

  const email = await emailForToken(req.cookies.get(COOKIE)?.value);
  if (email) return NextResponse.next();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)' };

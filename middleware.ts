import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authConfigured, emailForToken } from "./lib/auth";

// Pages that anyone may open without signing in: the sign-in page and its API.
const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

// Runs before every request. Sends people who are not signed in to the sign-in page,
// or returns a "please sign in" error for API calls. Department access is checked inside each API route.
export async function middleware(incomingRequest: NextRequest) {
  const requestedPath = incomingRequest.nextUrl.pathname;
  if (PUBLIC_PATHS.has(requestedPath)) return NextResponse.next();

  // Without sign-in set up, production is blocked and local development is let through.
  if (!authConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Set SUPABASE_URL and SUPABASE_ANON_KEY to use this app.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const signedInEmail = await emailForToken(
    incomingRequest.cookies.get(COOKIE)?.value,
  );
  if (signedInEmail) return NextResponse.next();

  if (requestedPath.startsWith("/api/"))
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const loginPageUrl = incomingRequest.nextUrl.clone();
  loginPageUrl.pathname = "/login";
  loginPageUrl.search = "";
  return NextResponse.redirect(loginPageUrl);
}

// Which paths the middleware runs on: everything except Next.js static files and the favicon.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};

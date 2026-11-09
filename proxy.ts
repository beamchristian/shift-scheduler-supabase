import { NextResponse, type NextRequest } from "next/server";
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  authConfigured,
  emailForToken,
  refreshSession,
  writeSessionCookies,
} from "./lib/auth";

// Pages that anyone may open without signing in: the sign-in page and its API.
const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

// Runs before every request. Sends people who are not signed in to the sign-in page,
// or returns a "please sign in" error for API calls. Department access is checked inside each API route.
export async function proxy(incomingRequest: NextRequest) {
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
    incomingRequest.cookies.get(SESSION_COOKIE)?.value,
  );
  if (signedInEmail) return NextResponse.next();

  // The access token ran out (it lasts about an hour). Try the refresh token before asking to sign in again.
  const refreshedResponse = await continueWithRefreshedSession(incomingRequest);
  if (refreshedResponse) return refreshedResponse;

  if (requestedPath.startsWith("/api/"))
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const loginPageUrl = incomingRequest.nextUrl.clone();
  loginPageUrl.pathname = "/login";
  loginPageUrl.search = "";
  return NextResponse.redirect(loginPageUrl);
}

// Gets a new access token from the refresh cookie and lets the request through with it.
// The new token is put on the request too, so the API route behind this sees it straight away.
// Returns the response to send, or null when the refresh token is missing or no longer valid.
async function continueWithRefreshedSession(
  incomingRequest: NextRequest,
): Promise<NextResponse | null> {
  const refreshedSession = await refreshSession(
    incomingRequest.cookies.get(REFRESH_COOKIE)?.value,
  );
  if (!refreshedSession) return null;

  incomingRequest.cookies.set(SESSION_COOKIE, refreshedSession.token);
  incomingRequest.cookies.set(REFRESH_COOKIE, refreshedSession.refreshToken);
  const response = NextResponse.next({
    request: { headers: incomingRequest.headers },
  });
  writeSessionCookies(response, refreshedSession);
  return response;
}

// Which paths the proxy runs on: everything except Next.js static files and the files that make the app
// installable (manifest, service worker, offline page, icons). Browsers fetch the manifest without the
// sign-in cookie, and the offline page must load with no session, so these stay public. None hold data.
export const config = {
  matcher:
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/).*)",
};

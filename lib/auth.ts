// Sign-in with Supabase Auth (email and password). Uses the public anon key and plain HTTP calls, so no extra packages.
// Sign-up must be turned off in Supabase, so accounts are created by an owner.

import type { NextResponse } from "next/server";

// Name of the cookie that holds the signed-in person's access token.
export const SESSION_COOKIE = "ss_access";

// Name of the cookie that holds the Supabase refresh token. It lets the app get a new access token
// when the short-lived one (about an hour) runs out, so managers stay signed in while they work.
export const REFRESH_COOKIE = "ss_refresh";

// How long a person stays signed in without using the app: 14 days.
// The refresh cookie is written again on every token refresh, so this window slides forward with activity.
export const SESSION_IDLE_LIFETIME_SECONDS = 14 * 24 * 60 * 60;

// A signed-in session: the access token, the refresh token, and how long the access token lasts in seconds.
export interface SessionTokens {
  token: string;
  refreshToken: string;
  maxAge: number;
}

// True when both Supabase settings are present. Without them, sign-in cannot work.
export function authConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// The Supabase project address, without a trailing slash.
const supabaseProjectUrl = () =>
  String(process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
// The public anon key that Supabase requires on every auth call.
const supabaseAnonKey = () => String(process.env.SUPABASE_ANON_KEY ?? "");

// Settings shared by both session cookies. httpOnly keeps the tokens away from page scripts.
// Returns the cookie options for a cookie that lasts the given number of seconds.
function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// Writes the access and refresh cookies for a session onto a response. Returns nothing.
export function writeSessionCookies(
  response: NextResponse,
  session: SessionTokens,
): void {
  response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.maxAge));
  response.cookies.set(
    REFRESH_COOKIE,
    session.refreshToken,
    sessionCookieOptions(SESSION_IDLE_LIFETIME_SECONDS),
  );
}

// Removes both session cookies from the browser, which signs the person out. Returns nothing.
export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", sessionCookieOptions(0));
}

// Reads a Supabase token response.
// Returns the session tokens, or null when Supabase did not send both tokens.
async function readTokenResponse(
  supabaseResponse: Response,
): Promise<SessionTokens | null> {
  const responseBody = (await supabaseResponse.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!supabaseResponse.ok || !responseBody.access_token || !responseBody.refresh_token)
    return null;
  return {
    token: responseBody.access_token,
    refreshToken: responseBody.refresh_token,
    maxAge: Number(responseBody.expires_in) || 3600,
  };
}

// Checks an email and password with Supabase.
// On success returns the session tokens. On failure returns a message to show.
export async function signIn(
  email: string,
  password: string,
): Promise<({ ok: true } & SessionTokens) | { ok: false; error: string }> {
  if (!authConfigured())
    return {
      ok: false,
      error:
        "Sign-in is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    };

  let supabaseResponse: Response;
  try {
    supabaseResponse = await fetch(
      `${supabaseProjectUrl()}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim(), password }),
        cache: "no-store",
      },
    );
  } catch {
    return {
      ok: false,
      error: "Could not reach the sign-in service. Try again.",
    };
  }

  const session = await readTokenResponse(supabaseResponse);
  if (!session) return { ok: false, error: "Email or password is not correct." };
  return { ok: true, ...session };
}

// Trades a refresh token for a new access token with Supabase.
// Supabase also hands back a new refresh token, which replaces the old one.
// Returns the new session tokens, or null when the refresh token is missing, used up or revoked.
export async function refreshSession(
  refreshToken: string | undefined,
): Promise<SessionTokens | null> {
  if (!refreshToken || !authConfigured()) return null;
  try {
    const supabaseResponse = await fetch(
      `${supabaseProjectUrl()}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      },
    );
    return await readTokenResponse(supabaseResponse);
  } catch {
    return null;
  }
}

// Returns the signed-in email for an access token, in lower case.
// Returns null when the token is missing, expired or invalid.
export async function emailForToken(
  accessToken: string | undefined,
): Promise<string | null> {
  if (!accessToken || !authConfigured()) return null;
  try {
    const supabaseResponse = await fetch(
      `${supabaseProjectUrl()}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseAnonKey(),
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );
    if (!supabaseResponse.ok) return null;
    const userDetails = (await supabaseResponse.json()) as { email?: string };
    return userDetails.email ? userDetails.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Sign-in with Supabase Auth (email and password). Uses the public anon key and plain HTTP calls, so no extra packages.
// Sign-up must be turned off in Supabase, so accounts are created by an owner.

// Name of the cookie that holds the signed-in person's access token.
export const SESSION_COOKIE = "ss_access";

// True when both Supabase settings are present. Without them, sign-in cannot work.
export function authConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// The Supabase project address, without a trailing slash.
const supabaseProjectUrl = () =>
  String(process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
// The public anon key that Supabase requires on every auth call.
const supabaseAnonKey = () => String(process.env.SUPABASE_ANON_KEY ?? "");

// Checks an email and password with Supabase.
// On success returns the access token and how long it lasts in seconds. On failure returns a message to show.
export async function signIn(
  email: string,
  password: string,
): Promise<
  { ok: true; token: string; maxAge: number } | { ok: false; error: string }
> {
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

  const responseBody = (await supabaseResponse.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!supabaseResponse.ok || !responseBody.access_token)
    return { ok: false, error: "Email or password is not correct." };
  return {
    ok: true,
    token: responseBody.access_token,
    maxAge: Number(responseBody.expires_in) || 3600,
  };
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

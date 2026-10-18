// Sign-in with Supabase Auth (email and password). Uses the public anon key and plain HTTP calls, so no extra packages.
// Sign-up must be turned off in Supabase, so accounts are created by an owner.

export const COOKIE = 'ss_access';

export function authConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

const base = () => String(process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const anon = () => String(process.env.SUPABASE_ANON_KEY ?? '');

export async function signIn(email: string, password: string): Promise<{ ok: true; token: string; maxAge: number } | { ok: false; error: string }> {
  if (!authConfigured()) return { ok: false, error: 'Sign-in is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.' };
  let r: Response;
  try {
    r = await fetch(`${base()}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, error: 'Could not reach the sign-in service. Try again.' };
  }
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) return { ok: false, error: 'Email or password is not correct.' };
  return { ok: true, token: j.access_token, maxAge: Number(j.expires_in) || 3600 };
}

// Returns the signed-in email for a token, or null if the token is missing, expired or invalid.
export async function emailForToken(token: string | undefined): Promise<string | null> {
  if (!token || !authConfigured()) return null;
  try {
    const r = await fetch(`${base()}/auth/v1/user`, {
      headers: { apikey: anon(), Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { email?: string };
    return j.email ? j.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

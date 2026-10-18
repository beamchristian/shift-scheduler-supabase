import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Signs the person out by clearing the access-token cookie.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

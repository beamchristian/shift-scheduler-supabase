import { NextResponse } from "next/server";
import { clearSessionCookies } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Signs the person out by clearing the access and refresh cookies.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}

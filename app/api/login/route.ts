import { NextResponse } from "next/server";
import { signIn, writeSessionCookies } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Signs a person in with their email and password, and stores the session tokens in httpOnly cookies.
export async function POST(request: Request) {
  const requestBody = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  if (!requestBody.email || !requestBody.password)
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );

  const signInResult = await signIn(requestBody.email, requestBody.password);
  if (!signInResult.ok)
    return NextResponse.json({ error: signInResult.error }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  // The access token lasts about an hour; the refresh cookie keeps the person signed in after that.
  writeSessionCookies(response, signInResult);
  return response;
}

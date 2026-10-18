import { NextResponse } from "next/server";
import { SESSION_COOKIE, signIn } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Signs a person in with their email and password, and stores the access token in a cookie.
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
  // httpOnly keeps the token away from page scripts. It expires when Supabase's token does.
  response.cookies.set(SESSION_COOKIE, signInResult.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: signInResult.maxAge,
  });
  return response;
}

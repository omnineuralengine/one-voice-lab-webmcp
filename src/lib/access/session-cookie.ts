import type { NextRequest, NextResponse } from "next/server";

export const ONE_LAB_SESSION_COOKIE = "one_lab_session";
export const ONE_LAB_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const SESSION_ID_PATTERN = /^[a-f0-9]{32}$/;

export function hasValidOneLabSession(request: NextRequest): boolean {
  return SESSION_ID_PATTERN.test(request.cookies.get(ONE_LAB_SESSION_COOKIE)?.value ?? "");
}

export function ensureOneLabSessionCookie(request: NextRequest, response: NextResponse): void {
  if (hasValidOneLabSession(request)) return;
  const value = crypto.randomUUID().replaceAll("-", "");
  // The proxy forwards this mutated request cookie to the first downstream
  // route, avoiding one shared "missing session" quota bucket for new users.
  request.cookies.set(ONE_LAB_SESSION_COOKIE, value);
  response.cookies.set({
    name: ONE_LAB_SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: ONE_LAB_SESSION_MAX_AGE_SECONDS,
    priority: "medium",
  });
}

export function isValidOneLabSessionId(value: string | null | undefined): value is string {
  return SESSION_ID_PATTERN.test(value ?? "");
}

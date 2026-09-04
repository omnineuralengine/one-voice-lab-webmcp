import { expect, test } from "@playwright/test";
import { NextRequest, NextResponse } from "next/server";

import {
  ensureOneLabSessionCookie,
  hasValidOneLabSession,
  isValidOneLabSessionId,
  ONE_LAB_SESSION_COOKIE,
} from "@/lib/access/session-cookie";

test("issues one opaque, HttpOnly Lab session cookie without treating it as identity", () => {
  const request = new NextRequest("https://one-voice-lab.vercel.app/evaluate");
  const response = NextResponse.next({ request });

  ensureOneLabSessionCookie(request, response);

  const issued = response.cookies.get(ONE_LAB_SESSION_COOKIE);
  expect(isValidOneLabSessionId(issued?.value)).toBe(true);
  expect(request.cookies.get(ONE_LAB_SESSION_COOKIE)?.value).toBe(issued?.value);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  expect(response.headers.get("set-cookie")).toContain("Secure");
});

test("preserves a valid session and replaces malformed caller-controlled values", () => {
  const validId = "a".repeat(32);
  const validRequest = new NextRequest("https://one-voice-lab.vercel.app/", {
    headers: { cookie: `${ONE_LAB_SESSION_COOKIE}=${validId}` },
  });
  const validResponse = NextResponse.next({ request: validRequest });
  expect(hasValidOneLabSession(validRequest)).toBe(true);
  ensureOneLabSessionCookie(validRequest, validResponse);
  expect(validResponse.cookies.get(ONE_LAB_SESSION_COOKIE)).toBeUndefined();

  const malformedRequest = new NextRequest("https://one-voice-lab.vercel.app/", {
    headers: { cookie: `${ONE_LAB_SESSION_COOKIE}=caller-chosen` },
  });
  const replacement = NextResponse.next({ request: malformedRequest });
  expect(hasValidOneLabSession(malformedRequest)).toBe(false);
  ensureOneLabSessionCookie(malformedRequest, replacement);
  expect(isValidOneLabSessionId(replacement.cookies.get(ONE_LAB_SESSION_COOKIE)?.value)).toBe(true);
});

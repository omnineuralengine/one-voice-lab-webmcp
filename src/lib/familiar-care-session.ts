import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { shouldUseHostedReviewMode } from "@/lib/open-lab";

const COOKIE_NAME = "familiar_care_review";
const SESSION_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 15 * 1000;
const PREVIEW_QUOTA = 3;

type ReviewerSession = {
  expiresAt: number;
  previewCount: number;
  lastPreviewAt?: number;
  nonce: string;
};

export type FamiliarCareSessionDecision =
  | { ok: true; mode: "local" | "hosted"; remaining: number | null; setCookie?: string }
  | { ok: false; status: number; message: string };

export function createFamiliarCareReviewerSession(input: { hosted: boolean; enabled: boolean; secret?: string; now?: number }) {
  if (!input.hosted) return { ok: true as const, mode: "local" as const, token: null, expiresIn: null };
  if (!input.enabled) return { ok: false as const, status: 503, message: "Familiar Care live preview is disabled by the hosted kill switch." };
  if (!input.secret || input.secret.length < 32) return { ok: false as const, status: 503, message: "Familiar Care reviewer session signing is not configured." };

  const now = input.now ?? Date.now();
  const token = signSession({ expiresAt: now + SESSION_TTL_MS, previewCount: 0, nonce: randomUUID() }, input.secret);
  return { ok: true as const, mode: "hosted" as const, token, expiresIn: SESSION_TTL_MS / 1000 };
}

export function authorizeFamiliarCarePreview(input: {
  hosted: boolean;
  enabled: boolean;
  cookieHeader: string | null;
  secret?: string;
  now?: number;
}): FamiliarCareSessionDecision {
  if (!input.hosted) return { ok: true, mode: "local", remaining: null };
  if (!input.enabled) return { ok: false, status: 503, message: "Familiar Care live preview is disabled by the hosted kill switch." };
  if (!input.secret || input.secret.length < 32) return { ok: false, status: 503, message: "Familiar Care reviewer session signing is not configured." };

  const now = input.now ?? Date.now();
  const value = readCookie(input.cookieHeader, COOKIE_NAME);
  const session = value ? verifySession(value, input.secret) : null;
  if (!session || session.expiresAt <= now) {
    return { ok: false, status: 423, message: "Unlock the protected reviewer session before generating a Familiar Care preview." };
  }
  if (session.previewCount >= PREVIEW_QUOTA) return { ok: false, status: 429, message: "This reviewer session has reached its three-preview quota." };
  if (session.lastPreviewAt && now - session.lastPreviewAt < COOLDOWN_MS) {
    return { ok: false, status: 429, message: "Wait for the preview cooldown before generating again." };
  }

  const updated = { ...session, previewCount: session.previewCount + 1, lastPreviewAt: now };
  return {
    ok: true,
    mode: "hosted",
    remaining: PREVIEW_QUOTA - updated.previewCount,
    setCookie: familiarCareSessionCookie(signSession(updated, input.secret), true, Math.max(1, Math.ceil((session.expiresAt - now) / 1000))),
  };
}

export function familiarCareSessionCookie(token: string, secure: boolean, maxAge = SESSION_TTL_MS / 1000) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/deepgram; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearFamiliarCareSession() {
  return familiarCareSessionCookie("", isHostedReviewMode(), 0);
}

export function isHostedReviewMode() {
  return shouldUseHostedReviewMode();
}

export function familiarCarePreviewEnabled() {
  return !isHostedReviewMode() || process.env.FAMILIAR_CARE_LIVE_PREVIEW_ENABLED === "1";
}

export function familiarCareSessionSecret() {
  return process.env.FAMILIAR_CARE_SESSION_SECRET?.trim() || undefined;
}

function signSession(session: ReviewerSession, secret: string) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(value: string, secret: string): ReviewerSession | null {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ReviewerSession>;
    if (!Number.isFinite(parsed.expiresAt) || !Number.isInteger(parsed.previewCount) || typeof parsed.nonce !== "string") return null;
    return parsed as ReviewerSession;
  } catch {
    return null;
  }
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

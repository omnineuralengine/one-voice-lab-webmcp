import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

import { isValidOneLabSessionId, ONE_LAB_SESSION_COOKIE } from "@/lib/access/session-cookie";

const PROCESS_SECRET = randomBytes(32).toString("hex");

export type ClientAddressSource = "vercel" | "trusted_proxy" | "development_proxy" | "unknown";

export type LabClientIdentity = {
  clientHash: string;
  sessionHash: string;
  addressSource: ClientAddressSource;
  sessionPresent: boolean;
};

export function deriveLabClientIdentity(request: Request, secret = labIdentitySecret()): LabClientIdentity {
  const address = readTrustedClientAddress(request);
  const session = readOpaqueSessionCookie(request);
  return {
    clientHash: keyedHash(secret, `client:${address.value}`),
    sessionHash: keyedHash(secret, `session:${session ?? "missing"}`),
    addressSource: address.source,
    sessionPresent: session !== null,
  };
}

export function readOpaqueSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    if (name !== ONE_LAB_SESSION_COOKIE) continue;
    const value = segment.slice(separator + 1).trim();
    return isValidOneLabSessionId(value) ? value : null;
  }
  return null;
}

export function readTrustedClientAddress(request: Request): { value: string; source: ClientAddressSource } {
  if (process.env.VERCEL === "1") {
    const value = firstValidIp(request.headers.get("x-vercel-forwarded-for"));
    return value ? { value, source: "vercel" } : { value: "unknown", source: "unknown" };
  }

  if (process.env.ONE_TRUST_PROXY_HEADERS === "true") {
    const value = firstValidIp(request.headers.get("x-forwarded-for"))
      ?? firstValidIp(request.headers.get("x-real-ip"));
    return value ? { value, source: "trusted_proxy" } : { value: "unknown", source: "unknown" };
  }

  if (process.env.NODE_ENV !== "production") {
    const value = firstValidIp(request.headers.get("x-forwarded-for"))
      ?? firstValidIp(request.headers.get("x-real-ip"));
    return value ? { value, source: "development_proxy" } : { value: "local", source: "development_proxy" };
  }

  return { value: "unknown", source: "unknown" };
}

export function hasDurableIdentitySecret(): boolean {
  return typeof process.env.LAB_USAGE_GUARD_TOKEN === "string"
    && process.env.LAB_USAGE_GUARD_TOKEN.trim().length >= 32;
}

function labIdentitySecret(): string {
  const configured = process.env.LAB_USAGE_GUARD_TOKEN?.trim();
  return configured && configured.length >= 32 ? configured : PROCESS_SECRET;
}

function keyedHash(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function firstValidIp(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const candidate = normalizeIp(part.trim());
    if (candidate) return candidate;
  }
  return null;
}

function normalizeIp(value: string): string | null {
  if (isIP(value)) return value.toLowerCase();
  const bracketed = /^\[([^\]]+)](?::\d+)?$/.exec(value)?.[1];
  if (bracketed && isIP(bracketed)) return bracketed.toLowerCase();
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value)?.[1];
  return ipv4WithPort && isIP(ipv4WithPort) ? ipv4WithPort : null;
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { DELETE as deleteAccount } from "@/app/api/account/delete/route";
import { POST as claimGuest } from "@/app/api/account/claim-guest/route";
import { GET as exportAccount } from "@/app/api/account/export/route";
import { POST as migrateGuest } from "@/app/api/account/migrate-guest/route";
import { POST as requestPasswordless } from "@/app/api/auth/passwordless/route";
import { clearAccountOutcomeParams, readAccountOutcomeMessage, setAuthOutcomeParam } from "@/lib/auth/account-outcome";
import { endBrowserAuthSession } from "@/lib/auth/browser-session";
import { humanAuthMessage, normalizedAuthErrorCode } from "@/lib/auth/errors";
import {
  GUEST_LAB_PREFERENCES_KEY,
  GUEST_NOTIFICATION_PREFERENCES_KEY,
  GUEST_NOTIFICATION_STATE_KEY,
  GUEST_PROVIDER_PREFERENCES_KEY,
  clearMigratedGuestState,
  collectGuestMigrationSnapshot,
  guestMigrationSnapshotSchema,
  guestSnapshotHasState,
} from "@/lib/auth/guest-state";
import { hashGuestSessionId } from "@/lib/auth/guest-migration";
import {
  hasRecentAuthentication,
  resolveHumanIdentity,
  type HumanIdentityAuthClient,
  type HumanPrincipal,
} from "@/lib/auth/human-identity";
import { ONE_GUEST_THEME_STORAGE_KEY } from "@/lib/one/theme";
import { DEFAULT_PROVIDER_PREFERENCES } from "@/lib/providers/preference-schema";

const USER_A = "10000000-0000-4000-8000-000000000001";
test.describe("canonical human identity", () => {
  test("maps a verified auth subject to a distinct application principal vocabulary", async () => {
    const result = await resolveHumanIdentity(fakeAuthClient({
      id: USER_A,
    }, { sub: USER_A, aal: "aal2", session_id: "session-a", amr: [{ method: "otp", timestamp: Date.parse("2026-08-29T20:00:00.000Z") / 1_000 }] }));
    expect(result).toEqual({
      kind: "human",
      humanId: USER_A,
      authSubjectId: USER_A,
      assuranceLevel: "aal2",
      authenticatedAt: "2026-08-29T20:00:00.000Z",
      sessionId: "session-a",
    });
  });

  test("distinguishes guest, malformed, stale, and unavailable identity states", async () => {
    expect(await resolveHumanIdentity(fakeAuthClient(null))).toEqual({ kind: "guest" });
    expect(await resolveHumanIdentity(fakeAuthClient({ id: "browser-supplied" }))).toEqual({ kind: "invalid-session" });
    expect(await resolveHumanIdentity(null)).toEqual({ kind: "unavailable" });
    expect(await resolveHumanIdentity({ auth: {
      getUser: async () => ({ data: { user: null }, error: { code: "refresh_token_not_found" } }),
    } })).toEqual({ kind: "invalid-session" });
    expect(await resolveHumanIdentity(fakeAuthClient({ id: USER_A, is_anonymous: true }))).toEqual({ kind: "invalid-session" });
  });

  test("requires a bounded recent sign-in for destructive actions", () => {
    const principal: HumanPrincipal = {
      kind: "human",
      humanId: USER_A,
      authSubjectId: USER_A,
      assuranceLevel: "aal1",
      authenticatedAt: "2026-08-29T20:00:00.000Z",
      sessionId: "session-a",
    };
    expect(hasRecentAuthentication(principal, Date.parse("2026-08-29T20:09:59.000Z"))).toBe(true);
    expect(hasRecentAuthentication(principal, Date.parse("2026-08-29T20:10:01.000Z"))).toBe(false);
    expect(hasRecentAuthentication({ ...principal, authenticatedAt: null })).toBe(false);
  });

  test("binds recent authentication to the current verified session claims", async () => {
    const oldSession = await resolveHumanIdentity(fakeAuthClient(
      { id: USER_A, last_sign_in_at: "2026-08-29T20:09:59.000Z" },
      { sub: USER_A, aal: "aal1", session_id: "old-session", amr: [{ method: "password", timestamp: Date.parse("2026-08-29T19:00:00.000Z") / 1_000 }, { method: "token_refresh", timestamp: Date.parse("2026-08-29T20:19:59.000Z") / 1_000 }] },
    ));
    expect(oldSession.kind).toBe("human");
    expect(oldSession.kind === "human" && hasRecentAuthentication(oldSession, Date.parse("2026-08-29T20:20:01.000Z"))).toBe(false);

    const mismatched = await resolveHumanIdentity(fakeAuthClient(
      { id: USER_A },
      { sub: "20000000-0000-4000-8000-000000000002", aal: "aal2", session_id: "other-session", amr: [{ method: "otp", timestamp: Date.parse("2026-08-29T20:20:00.000Z") / 1_000 }] },
    ));
    expect(mismatched).toMatchObject({ kind: "human", assuranceLevel: "unknown", authenticatedAt: null, sessionId: null });
  });
});

test.describe("guest-to-account boundary", () => {
  test("collects only an allowlisted bounded migration snapshot", () => {
    const storage = memoryStorage({
      [ONE_GUEST_THEME_STORAGE_KEY]: JSON.stringify({ primaryHex: "#2255AA", secondaryHex: "#11AA77", appearance: "dark", reducedMotion: true }),
      [GUEST_LAB_PREFERENCES_KEY]: JSON.stringify({ defaultModule: "/learn", injected: "discard" }),
      [GUEST_NOTIFICATION_PREFERENCES_KEY]: JSON.stringify({ inAppEnabled: true, emailEnabled: false, newLabs: true, providerUpdates: false, simulationUpdates: true, securityUpdates: true }),
      [GUEST_NOTIFICATION_STATE_KEY]: JSON.stringify(["020f1f1e-14c8-4f1b-a9e1-0cdcd7a11501", "not-a-uuid"]),
      [GUEST_PROVIDER_PREFERENCES_KEY]: JSON.stringify(DEFAULT_PROVIDER_PREFERENCES),
      unrelated_private_transcript: "must-remain-outside-the-snapshot",
    });
    const snapshot = collectGuestMigrationSnapshot(storage, ONE_GUEST_THEME_STORAGE_KEY);
    expect(guestMigrationSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.labPreferences).toBeNull();
    expect(snapshot.readUpdateIds).toEqual(["020f1f1e-14c8-4f1b-a9e1-0cdcd7a11501"]);
    expect(JSON.stringify(snapshot)).not.toContain("private_transcript");
    expect(guestSnapshotHasState(snapshot)).toBe(true);
  });

  test("clears only migration-eligible guest keys after server acknowledgement", () => {
    const storage = memoryStorage({
      [ONE_GUEST_THEME_STORAGE_KEY]: "{}",
      [GUEST_LAB_PREFERENCES_KEY]: "{}",
      [GUEST_NOTIFICATION_PREFERENCES_KEY]: "{}",
      [GUEST_NOTIFICATION_STATE_KEY]: "[]",
      [GUEST_PROVIDER_PREFERENCES_KEY]: "{}",
      unrelated_device_state: "keep",
    });
    clearMigratedGuestState(storage, ONE_GUEST_THEME_STORAGE_KEY);
    expect(storage.getItem(ONE_GUEST_THEME_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(GUEST_LAB_PREFERENCES_KEY)).toBeNull();
    expect(storage.getItem("unrelated_device_state")).toBe("keep");
  });

  test("derives a stable opaque receipt key and rejects caller-shaped IDs", () => {
    const session = "0123456789abcdef0123456789abcdef";
    expect(hashGuestSessionId(session)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestSessionId(session)).toBe(hashGuestSessionId(session));
    expect(hashGuestSessionId("user-a")).toBeNull();
  });
});

test.describe("auth route safety", () => {
  test("renders only allowlisted account outcomes and removes their query controls", () => {
    expect(readAccountOutcomeMessage(new URLSearchParams("auth=success"))).toContain("Signed in");
    expect(readAccountOutcomeMessage(new URLSearchParams("auth=%3Cscript%3E"))).toBeNull();
    expect(readAccountOutcomeMessage(new URLSearchParams("migration=complete"))).toContain("imported once");
    expect(readAccountOutcomeMessage(new URLSearchParams("auth=success&migration=available"))).toContain("review and import");
    expect(readAccountOutcomeMessage(new URLSearchParams("auth=signed-out"))).toContain("Guest Mode");
    expect(readAccountOutcomeMessage(new URLSearchParams("auth=logout-failed"))).toContain("remains active");
    expect(clearAccountOutcomeParams(new URL("https://one.test/settings?auth=success&keep=yes#identity")))
      .toBe("/settings?keep=yes#identity");
    expect(setAuthOutcomeParam(new URL("https://one.test/settings?keep=yes#identity"), "claim-unavailable"))
      .toBe("/settings?keep=yes&auth=claim-unavailable#identity");
    expect(setAuthOutcomeParam(new URL("https://one.test/settings#identity"), "unavailable"))
      .toBe("/settings?auth=unavailable#identity");
  });

  test("does not claim logout until global or local session removal succeeds", async () => {
    const scopes: Array<string | undefined> = [];
    expect(await endBrowserAuthSession(async (options) => {
      scopes.push(options?.scope);
      return { error: options?.scope === "local" ? null : { code: "upstream_unavailable" } };
    })).toBe("signed-out");
    expect(scopes).toEqual([undefined, "local"]);

    expect(await endBrowserAuthSession(async () => ({ error: { code: "session_not_removed" } })))
      .toBe("unavailable");
  });

  test("rejects cross-origin and malformed passwordless requests before any auth call", async () => {
    const crossOrigin = await requestPasswordless(jsonRequest("https://one.test/api/auth/passwordless", {}, "https://attacker.invalid", "cross-site"));
    expect(crossOrigin.status).toBe(403);
    const malformed = await requestPasswordless(jsonRequest("https://one.test/api/auth/passwordless", { email: "not-an-email" }));
    expect(malformed.status).toBe(400);
  });

  test("rejects cross-origin account migration, export, and deletion", async () => {
    const claim = await claimGuest(new Request("https://one.test/api/account/claim-guest", { method: "POST", headers: { Origin: "https://attacker.invalid", "Sec-Fetch-Site": "cross-site" } }));
    expect(claim.status).toBe(403);
    const migrate = await migrateGuest(jsonRequest("https://one.test/api/account/migrate-guest", {}, "https://attacker.invalid", "cross-site"));
    expect(migrate.status).toBe(403);
    const exported = await exportAccount(new Request("https://one.test/api/account/export", { headers: { Origin: "https://attacker.invalid", "Sec-Fetch-Site": "cross-site" } }));
    expect(exported.status).toBe(403);
    const deleted = await deleteAccount(new Request("https://one.test/api/account/delete", { method: "DELETE", headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid", "Sec-Fetch-Site": "cross-site" }, body: "{}" }));
    expect(deleted.status).toBe(403);
  });

  test("owner exports require an explicit same-site browser signal", async () => {
    const response = await exportAccount(new Request("https://one.test/api/account/export"));
    expect(response.status).toBe(403);
  });

  test("normalizes provider errors without reflecting upstream payloads", () => {
    const raw = { status: 429, code: "rate_limit", message: "Account alice@example.test token=secret" };
    const message = humanAuthMessage(normalizedAuthErrorCode(raw));
    expect(message).toContain("Too many sign-in attempts");
    expect(message).not.toContain("alice@example.test");
    expect(message).not.toContain("secret");
  });

  test("owner-only routes have no browser-controlled target identity", () => {
    const migration = source("src/app/api/account/migrate-guest/route.ts");
    const exported = source("src/app/api/account/export/route.ts");
    const deleted = source("src/app/api/account/delete/route.ts");
    const principal = source("src/lib/auth/human-identity.ts");
    expect(`${migration}\n${exported}\n${deleted}`).toContain("resolveHumanIdentity");
    expect(exported).toContain("const humanId = identity.humanId");
    expect(deleted).toContain("deleteUser(identity.authSubjectId)");
    expect(`${migration}\n${exported}\n${deleted}`).not.toMatch(/searchParams\.get\(["'](?:user|owner|target)/i);
    expect(principal).toContain("authSubjectId: userResult.data.user.id");
    const callback = source("src/app/auth/callback/route.ts");
    expect(callback).toContain('client.auth.signOut({ scope: "local" })');
    expect(callback).toContain('claim.status === "migration-limit-reached"');
    expect(callback).toContain('auth=claim-unavailable');
  });

  test("manual identity linking is not exposed without recent-auth controls", () => {
    const settings = source("src/components/one/OneSettings.tsx");
    expect(settings).not.toContain("linkIdentity(");
    expect(settings).not.toContain("unlinkIdentity(");
    expect(settings).not.toContain("error.message");
  });

  test("keys account and provider presentation state to the current verified human", () => {
    const settings = source("src/components/one/OneSettings.tsx");
    const providerHub = source("src/components/providers/ProviderRolodex.tsx");
    expect(settings).toContain('key={one.user?.id ?? "guest"}');
    expect(settings).toContain('<OneSettingsForIdentity key={one.user?.id ?? "guest"}');
    expect(settings).toContain("if (!one.authReady)");
    expect(settings).toContain("readAccountOutcomeMessage");
    expect(providerHub).toContain('key={one.user?.id ?? "guest"}');
    expect(providerHub).toContain("ProviderRolodexForIdentity");
    const experience = source("src/components/one/OneExperienceProvider.tsx");
    expect(experience).toContain('fetch("/api/account/claim-guest"');
    expect(experience).toContain('client.auth.signOut({ scope: "local" })');
    expect(experience).toContain("clearMigratedGuestState");
    expect(experience).toContain("const verified = await client.auth.getUser()");
    expect(experience).toContain("client.auth.onAuthStateChange(() =>");
    expect(experience).not.toContain("session?.user");
    expect(experience).toContain("humanId === expectedHumanId");
    expect(experience).toContain('setAuthOutcomeParam(new URL(window.location.href), "claim-unavailable")');
    expect(experience).toContain('setAuthOutcomeParam(new URL(window.location.href), "signed-out")');
    expect(experience).toContain("verificationUnavailable = true");
  });

  test("all legacy member and durable access surfaces reject anonymous-auth principals", () => {
    const evaluation = source("src/lib/evaluation/security.ts");
    const durable = source("src/lib/access/durable-access.ts");
    const trust = source("src/lib/access/trust-state.ts");
    const bench = source("src/app/bench/page.tsx");
    expect(evaluation).toContain("isOneHumanAuthSubject");
    expect(durable).toContain("isOneHumanAuthSubject");
    expect(trust).toContain("isOneHumanAuthSubject");
    expect(bench).toContain("resolveHumanIdentity");
    expect(bench).not.toContain("client.auth.getUser()");
  });

  test("PWA navigation caching excludes auth and personalized surfaces", () => {
    const worker = source("public/pocket-deepgram-sw.js");
    expect(worker).toContain('url.pathname.startsWith("/auth/")');
    expect(worker).toContain('["/settings", "/bench", "/membership"]');
    expect(worker).toContain('["code", "token", "access_token", "refresh_token", "state"]');
    expect(worker).toContain("SHELL_URLS.includes(url.pathname)");
    expect(worker).toMatch(/no-store\|private/);
  });
});

function fakeAuthClient(
  user: { id: string; last_sign_in_at?: string | null; is_anonymous?: boolean } | null,
  claims: Record<string, unknown> = {},
): HumanIdentityAuthClient {
  return {
    auth: {
      getUser: async () => ({ data: { user } }),
      getClaims: async () => ({ data: { claims } }),
    },
  };
}

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

function jsonRequest(url: string, body: unknown, origin = "https://one.test", site = "same-origin") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": site },
    body: JSON.stringify(body),
  });
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

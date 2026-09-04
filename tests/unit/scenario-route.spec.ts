import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import type { LabAccessDecision } from "@/lib/access/lab-access";
import {
  SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  USER_SCENARIO_ID,
  USER_SCENARIO_VERSION,
  type ScenarioRunRequest,
} from "@/lib/scenarios/contracts";
import {
  MAX_SCENARIO_RUN_REQUEST_BYTES,
  createScenarioRunHandler,
} from "@/lib/scenarios/http";
import { runScenarioFixture } from "@/lib/scenarios/runner";

const VALID_REQUEST: ScenarioRunRequest = {
  schemaVersion: SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  scenarioId: USER_SCENARIO_ID,
  scenarioVersion: USER_SCENARIO_VERSION,
  executionMode: "synthetic_fixture",
  reviewGoal: "inspect-evidence",
  correlationToken: "scenario_route_unit_token_01",
};

const ALLOWED_ACCESS: LabAccessDecision = {
  allowed: true,
  tier: "guest",
  operation: "session_creation",
  used: 1,
  allowance: 4,
  remaining: 3,
  resetsAt: "2026-08-30T01:00:00.000Z",
};

test.describe("Scenario Studio guarded execution route", () => {
  test("returns a private no-store receipt through server-derived guest scope", async () => {
    const handler = createScenarioRunHandler({
      resolveActor: async () => ({ ok: true, actorScope: "guest-ephemeral" }),
      checkAccess: async () => ALLOWED_ACCESS,
      run: (input, options) => runScenarioFixture(input, {
        ...options,
        now: () => new Date("2026-08-30T00:00:02.000Z"),
        createRunId: () => "00000000-0000-4000-8000-000000000005",
      }),
    });

    const response = await handler(request(VALID_REQUEST));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("surrogate-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.json();
    expect(body.receipt.execution).toMatchObject({
      actorScope: "guest-ephemeral",
      providerCalls: 0,
      providerCredits: 0,
      retention: "ephemeral-no-store",
    });
    expect(JSON.stringify(body)).not.toContain(VALID_REQUEST.correlationToken);
  });

  test("derives authenticated receipt scope without serializing an identity", async () => {
    const handler = createScenarioRunHandler({
      resolveActor: async () => ({ ok: true, actorScope: "human-ephemeral" }),
      checkAccess: async () => ALLOWED_ACCESS,
      run: (input, options) => runScenarioFixture(input, {
        ...options,
        now: () => new Date("2026-08-30T00:00:03.000Z"),
        createRunId: () => "00000000-0000-4000-8000-000000000006",
      }),
    });
    const response = await handler(request(VALID_REQUEST));
    const serialized = await response.text();
    expect(response.status).toBe(200);
    expect(serialized).toContain('"actorScope":"human-ephemeral"');
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("authSubjectId");
    expect(serialized).not.toContain("sessionId");
  });

  test("rejects cross-site requests before reading, admission, or execution", async () => {
    let reads = 0;
    let admissions = 0;
    let runs = 0;
    const handler = createScenarioRunHandler({
      readJson: async () => { reads += 1; return VALID_REQUEST; },
      resolveActor: async () => ({ ok: true, actorScope: "guest-ephemeral" }),
      checkAccess: async () => { admissions += 1; return ALLOWED_ACCESS; },
      run: async () => { runs += 1; throw new Error("must not run"); },
    });
    const response = await handler(request(VALID_REQUEST, {
      Origin: "https://attacker.example",
      "Sec-Fetch-Site": "cross-site",
    }));
    expect(response.status).toBe(403);
    expect({ reads, admissions, runs }).toEqual({ reads: 0, admissions: 0, runs: 0 });
  });

  test("accepts an exact browser-visible Host behind an internal Next proxy URL", async () => {
    const handler = createScenarioRunHandler({
      resolveActor: async () => ({ ok: true, actorScope: "guest-ephemeral" }),
      checkAccess: async () => ALLOWED_ACCESS,
      run: (input, options) => runScenarioFixture(input, {
        ...options,
        now: () => new Date("2026-08-30T00:00:04.000Z"),
        createRunId: () => "00000000-0000-4000-8000-000000000007",
      }),
    });
    const response = await handler(new Request("http://localhost:3000/api/scenarios/run", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Host: "127.0.0.1:3117",
        Origin: "http://127.0.0.1:3117",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(VALID_REQUEST),
    }));
    expect(response.status).toBe(200);

    const forgedOrigin = await handler(new Request("http://localhost:3000/api/scenarios/run", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Host: "127.0.0.1:3117",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(VALID_REQUEST),
    }));
    expect(forgedOrigin.status).toBe(403);
  });

  test("rejects media, size, corruption, extra authority, and live-mode confusion before admission", async () => {
    let admissions = 0;
    const handler = createScenarioRunHandler({
      resolveActor: async () => ({ ok: true, actorScope: "guest-ephemeral" }),
      checkAccess: async () => { admissions += 1; return ALLOWED_ACCESS; },
    });

    const wrongMedia = await handler(request(VALID_REQUEST, { "Content-Type": "text/plain" }));
    expect(wrongMedia.status).toBe(415);

    const tooLarge = await handler(request(VALID_REQUEST, {
      "Content-Length": String(MAX_SCENARIO_RUN_REQUEST_BYTES + 1),
    }));
    expect(tooLarge.status).toBe(413);

    const malformed = await handler(rawRequest("{"));
    expect(malformed.status).toBe(400);

    const authority = await handler(request({
      ...VALID_REQUEST,
      providerId: "deepgram",
      actionId: "provider.tts",
      fixtureId: "caller-selected",
    }));
    expect(authority.status).toBe(400);

    const live = await handler(request({ ...VALID_REQUEST, executionMode: "live" }));
    expect(live.status).toBe(400);
    expect(admissions).toBe(0);
  });

  test("fails closed on identity or quota denial without executing", async () => {
    let runs = 0;
    const invalidIdentity = createScenarioRunHandler({
      resolveActor: async () => ({
        ok: false,
        status: 401,
        code: "invalid_session",
        message: "Invalid session.",
      }),
      checkAccess: async () => ALLOWED_ACCESS,
      run: async () => { runs += 1; throw new Error("must not run"); },
    });
    expect((await invalidIdentity(request(VALID_REQUEST))).status).toBe(401);

    const denied = createScenarioRunHandler({
      resolveActor: async () => ({ ok: true, actorScope: "guest-ephemeral" }),
      checkAccess: async () => ({
        allowed: false,
        tier: "guest",
        operation: "session_creation",
        used: 4,
        allowance: 4,
        remaining: 0,
        resetsAt: "2026-08-30T01:00:00.000Z",
        code: "guest_limit_reached",
      }),
      run: async () => { runs += 1; throw new Error("must not run"); },
    });
    const denial = await denied(request(VALID_REQUEST));
    expect(denial.status).toBe(429);
    expect(denial.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(runs).toBe(0);
  });

  test("keeps the route POST-only, uncached, unpersisted, and provider-free", async () => {
    const route = source("src/app/api/scenarios/run/route.ts");
    const handler = source("src/lib/scenarios/http.ts");
    const runner = source("src/lib/scenarios/runner.ts");
    const component = source("src/components/scenarios/ScenarioStudio.tsx");
    const serviceWorker = source("public/pocket-deepgram-sw.js");

    expect(route).toContain('export const POST = createScenarioRunHandler()');
    expect(route).not.toMatch(/export const (GET|PUT|PATCH|DELETE)/);
    expect(handler).toContain('"private, no-store, max-age=0"');
    expect(serviceWorker).not.toContain('"/scenario-studio"');
    expect(serviceWorker).toContain('pathname.startsWith("/api/")');
    for (const text of [handler, runner, component]) {
      expect(text).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|navigator\.serviceWorker|recordViewerEvent|saved_experiments/);
    }
    expect(runner).not.toMatch(/providers\/adapters|provider-client|DEEPGRAM_API_KEY|ELEVENLABS_API_KEY|FISH_AUDIO_API_KEY|CARTESIA_API_KEY|RESON8_API_KEY/);
  });
});

function request(body: unknown, overrides: Record<string, string> = {}) {
  return rawRequest(JSON.stringify(body), overrides);
}

function rawRequest(body: string, overrides: Record<string, string> = {}) {
  return new Request("https://one.example/api/scenarios/run", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://one.example",
      "Sec-Fetch-Site": "same-origin",
      ...overrides,
    },
    body,
  });
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

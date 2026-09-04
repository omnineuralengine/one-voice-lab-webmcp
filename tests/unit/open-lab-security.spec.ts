import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("all live server entry points enforce the private provider switch", () => {
  expect(read("src/lib/deepgram.ts")).toContain("assertOpenLabDeepgramEnabled()");
  expect(read("src/lib/deepgram-executor.ts")).toContain("assertOpenLabDeepgramEnabled()");
  expect(read("src/lib/deepgram-manage-readonly.ts")).toContain("assertOpenLabDeepgramEnabled()");
  expect(read("src/app/api/deepgram/flux-tts/route.ts")).toContain("assertOpenLabDeepgramEnabled()");
  expect(read("src/lib/applied-voice/labs.ts")).not.toContain("assertOpenLabDeepgramEnabled");
});

test("temporary JWTs stay in memory, are cleared after handshake or failure, and use no-store", () => {
  const mic = read("src/components/browser-mic-card.tsx");
  const tokenRoute = read("src/app/api/deepgram/token/route.ts");
  expect(mic).toContain("useRef<TemporaryToken | null>(null)");
  expect((mic.match(/temporaryTokenRef\.current = null/g) ?? []).length).toBeGreaterThanOrEqual(4);
  expect(mic).not.toMatch(/(?:localStorage|sessionStorage|indexedDB|document\.cookie)[\s\S]{0,120}access_token/i);
  expect(tokenRoute).toContain('"Cache-Control": "no-store"');
  expect(tokenRoute).not.toContain("console.log");
});

test("public builds cannot opt into provider key variables", () => {
  const source = [
    read("src/app/layout.tsx"),
    read("src/app/page.tsx"),
    read("src/components/deepgram-control-room.tsx"),
    read("src/components/flux-tts/FluxTtsStudio.tsx", true),
  ].join("\n");
  expect(source).not.toMatch(/NEXT_PUBLIC_(?:DEEPGRAM|DG)_?(?:API_?)?KEY/i);
  const audit = read("scripts/audit-deepgram-secrets.mjs");
  expect(audit).toContain('".next/static"');
  expect(audit).toContain('"RESON8_API_KEY"');
  expect(audit).toContain("NEXT_PUBLIC_RESON8_?(?:API_?)?KEY");
});

test("Open Lab blocks account data and retains the existing mutation lock", () => {
  expect(read("src/lib/deepgram-executor.ts")).toContain("open_lab_account_data_locked");
  expect(read("src/lib/deepgram-manage-readonly.ts")).toContain("open_lab_account_data_locked");
  const policy = read("src/lib/deepgram-request-policy.ts");
  expect(policy).toContain("mutation_locked");
  expect(policy).toContain("Host and URL overrides are not accepted");
});

function read(path: string, optional = false) {
  try {
    return readFileSync(resolve(process.cwd(), path), "utf8");
  } catch (error) {
    if (optional) return "";
    throw error;
  }
}

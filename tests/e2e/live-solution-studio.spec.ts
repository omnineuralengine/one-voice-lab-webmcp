import { expect, test } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.studio !== "live-solution", "Live Solution coverage uses its dedicated 1440px studio config.");
});
test.describe("Live Solution Studio", () => {
  test("runs the synthetic Case Graph, ledger, question, capture, persistence, and safe export workflow", async ({ page }) => {
    await page.goto("/live-solution-studio");
    await page.getByRole("button", { name: "Load fictional rehearsal" }).click();
    await expect(page.getByRole("heading", { name: /Northstar Appointments/ })).toBeVisible();
    await expect(page.getByText("Next-Best-Question Copilot", { exact: false })).toBeVisible();
    await expect(page.getByRole("article").getByText(/Confirm codec/i)).toBeVisible();
    await page.getByRole("button", { name: "Ask Later" }).click();
    await page.getByRole("button", { name: "Assumption" }).click();
    await page.getByLabel("Quick capture text").fill("Production concurrency remains unknown.");
    await page.getByRole("button", { name: "Save capture" }).click();
    await expect(page.getByText(/captured in the Evidence & Decision Ledger/i)).toBeVisible();
    await page.getByRole("button", { name: "Evidence & Decision Ledger" }).click();
    await expect(page.getByText("Production concurrency remains unknown.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Case Graph" }).click();
    await expect(page.getByRole("list", { name: "Semantic case relationships" })).toBeVisible();
    await page.getByRole("button", { name: "Claim Safety" }).click();
    await expect(page.getByText("Do not claim yet", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.locator("div").filter({ hasText: /^Excluded for safety\s*\d+$/ })).toBeVisible();
    const preview=page.locator("pre").filter({hasText:"Draft—review before sharing"}).last();
    await expect(preview).not.toContainText("FICTIONAL REHEARSAL ONLY");
    await expect(preview).not.toContainText("dg_");
    await page.reload();
    await expect(page.getByRole("heading", { name: /Northstar Appointments/ })).toBeVisible();
    await page.setViewportSize({ width:390, height:844 });
    await expect(page.locator("body")).toHaveCSS("overflow-x", /^(visible|auto|clip)$/);
    expect(page.url()).not.toMatch(/transcript|Northstar|codec/i);
  });
  test.beforeEach(async ({ page, context }) => { await context.grantPermissions(["clipboard-read", "clipboard-write"]); await page.goto("/live-solution-studio"); });
  test("extracts, corrects, solves, copies, queues, persists, and clears safely", async ({ page }) => {
    const transcript = "[00:01] Customer: Can this process uploaded recordings?\n[00:02] Mark: Yes.\n[00:03] Customer: How would a Python FastAPI service reconnect a realtime WebSocket for 100 concurrent calls?";
    await page.getByLabel("Problem inbox").fill(transcript); await page.getByRole("button", { name: "Extract latest problem" }).click();
    await expect(page.getByLabel("Exact text used by the solver")).toHaveValue(/How would/); expect(page.url()).not.toContain("Customer");
    await page.getByLabel("Exact text used by the solver").fill("How should our Python FastAPI service recover a realtime WebSocket connection?");
    await expect(page.locator('input[value="Python"]')).toBeVisible(); await page.getByRole("button", { name: "Generate local draft" }).click();
    await expect(page.getByText(/Say now/i).first()).toBeVisible(); await page.getByRole("button", { name: "Copy Say now" }).click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Deepgram");
    await page.getByRole("button", { name: "Mark answered" }).click(); await expect(page.getByText("answered", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start next problem" }).click(); await page.getByLabel("Problem inbox").fill("How do we transcribe a prerecorded file?"); await page.getByRole("button", { name: "Extract latest problem" }).click();
    await expect(page.getByText("Problem 2", { exact: true }).first()).toBeVisible(); await page.reload(); await expect(page.getByLabel("Exact text used by the solver")).toHaveValue(/prerecorded/);
    page.once("dialog", (d) => void d.accept()); await page.getByRole("button", { name: "Clear session" }).click(); await expect(page.getByText("Problem 1", { exact: true }).first()).toBeVisible();
  });
  test("remains usable on mobile and falls back locally", async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await page.getByLabel("Problem inbox").fill("How do I debug streaming audio?"); await page.getByRole("button", { name: "Extract latest problem" }).click(); await page.getByRole("button", { name: "Generate local draft" }).click(); await expect(page.getByText(/Local solver ready|Local brief generated/)).toBeVisible(); const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); expect(width[0]).toBeLessThanOrEqual(width[1] + 1); });
  test("grounds the fictional fixture, exports a safe field brief, prints, and labels fallback", async ({ page }) => {
    let posted = "";
    await page.route("**/api/deepgram-docs/search", async (route) => { posted = route.request().postData() ?? ""; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode:"live-docs",technicalQuery:"official streaming evidence",searchedAt:"2026-07-27T00:00:00.000Z",message:"Mocked official documentation for automated testing.",evidence:[{id:"live-stream",title:"Live streaming speech-to-text",officialUrl:"https://developers.deepgram.com/docs/live-streaming-audio",summary:"Streaming uses a realtime connection.",whyItMatters:"Supports the transport design.",supportedClaim:"Deepgram documents a live streaming speech-to-text connection.",queryUsed:"official streaming evidence",retrievedAt:"2026-07-27T00:00:00.000Z",sourceType:"deepgram-docs-mcp",verificationState:"live-retrieved"}] }) }); });
    await page.getByRole("button",{name:"Load fictional rehearsal"}).click(); await expect(page.getByLabel("Stack Framework")).toHaveValue("FastAPI"); await page.getByLabel("Stack Expected concurrency").fill("50 sessions"); await expect(page.getByLabel("Outgoing technical docs query")).toContainText("FastAPI"); await page.getByRole("button",{name:"Search official docs"}).click(); expect(posted).not.toContain("FICTIONAL REHEARSAL ONLY"); expect(posted).not.toContain("rawInput");
    await page.getByRole("button",{name:"Pin",exact:true}).click(); await page.getByRole("button",{name:"Generate from pinned evidence"}).click(); const preview=page.getByTestId("field-brief-preview"); await expect(preview).toContainText("Official Deepgram references"); await expect(preview).not.toContainText("FICTIONAL REHEARSAL ONLY");
    await page.getByRole("button",{name:"Copy Markdown"}).click(); expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain("Draft—review before sharing"); const downloadPromise=page.waitForEvent("download"); await page.getByRole("button",{name:"Download Markdown"}).click(); expect((await downloadPromise).suggestedFilename()).toMatch(/^deepgram-field-brief-.*\.md$/);
    await page.evaluate(()=>{(window as typeof window & {__printed?:boolean}).__printed=false;window.print=()=>{(window as typeof window & {__printed?:boolean}).__printed=true;};}); await page.getByRole("button",{name:"Print / Save as PDF"}).click(); expect(await page.evaluate(()=>(window as typeof window & {__printed?:boolean}).__printed)).toBe(true);
    await page.unroute("**/api/deepgram-docs/search"); await page.route("**/api/deepgram-docs/search",(route)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({mode:"curated-fallback",technicalQuery:"fallback",searchedAt:"2026-07-27T00:00:00.000Z",message:"Live Docs MCP was unavailable. These references are not a fresh search.",evidence:[]})})); await page.getByRole("button",{name:"Search official docs"}).click(); await expect(page.getByText("curated-fallback",{exact:true})).toBeVisible();
  });

  test("treats pasted code as redacted technical evidence, exports it, and prefills API Lab without execution", async ({ page }) => {
    const secret = "dg_abcdefghijklmnopqrstuvwxyz123456";
    const curl = [
      "curl --request POST \\",
      "  --url 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&diarize=true' \\",
      "  --header 'Authorization: Token " + secret + "' \\",
      "  --header 'Content-Type: application/json' \\",
      "  --data '{\"url\":\"https://audio.example.invalid/fixture.wav\"}'",
    ].join("\n");
    let docsPost = "";
    const forbiddenRouteCalls: string[] = [];
    await page.route(/\/api\/deepgram\/(?:execute|token|tts|transcribe-file|transcribe-url)(?:\?|$)/, async (route) => { forbiddenRouteCalls.push(route.request().url()); await route.abort(); });
    await page.route("**/api/deepgram-docs/search", async (route) => {
      docsPost = route.request().postData() ?? "";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        mode: "live-docs", technicalQuery: "prerecorded listen parameters", searchedAt: "2026-07-28T12:00:00.000Z", message: "Mocked official evidence.",
        evidence: [{ id: "listen-prerecorded", title: "Transcribe prerecorded audio", officialUrl: "https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded", summary: "Official request reference.", whyItMatters: "Validates the detected endpoint and query parameters.", supportedClaim: "The prerecorded Listen endpoint accepts documented transcription options.", queryUsed: "prerecorded listen parameters", retrievedAt: "2026-07-28T12:00:00.000Z", sourceType: "deepgram-docs-mcp", verificationState: "live-retrieved" }],
      }) });
    });

    await page.getByLabel("Problem inbox").fill("How should our TypeScript service validate and safely test this prerecorded Deepgram request?");
    await page.getByRole("button", { name: "Extract latest problem" }).click();
    await page.getByRole("button", { name: "Open workbench" }).click();
    const workbench = page.getByTestId("payload-code-workbench");
    await workbench.getByLabel("Technical artifact input").fill(curl);
    await expect(page.getByText(/Detected:\s*cURL/i)).toBeVisible();
    await expect(page.getByText(/Confidence:\s*High/i)).toBeVisible();
    await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Redacted", exact: true }).click();
    await expect(page.getByText("[REDACTED_BEARER_TOKEN]", { exact: false })).toBeVisible();
    await page.getByRole("tab", { name: "Documentation", exact: true }).click();
    await expect(page.getByLabel("Outgoing technical artifact docs query")).not.toContainText(secret);
    await workbench.getByRole("button", { name: "Search official docs" }).click();
    expect(docsPost).not.toContain(secret);
    expect(docsPost).not.toContain("audio.example.invalid");
    expect(docsPost).not.toContain("Authorization");
    await expect(page.getByRole("link", { name: /Transcribe prerecorded audio/ })).toHaveAttribute("href", "https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded");
    await page.getByLabel("Customer context — confirmed only").fill("PRIVATE SESSION CONTEXT MUST NOT EXPORT");
    await page.getByRole("button", { name: "Attach to session" }).click();
    await expect(page.getByLabel("Technical artifact input")).toHaveValue("");
    await expect(page.getByText(/1 attached/)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("deepgram-live-solution-studio:session:v1") ?? "")).not.toContain(secret);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("deepgram-live-solution-studio:session:v1") ?? "")).toContain("REDACTED_BEARER_TOKEN");

    await page.getByRole("button", { name: "Generate local draft" }).click();
    const fieldBrief = page.getByTestId("field-brief-preview");
    await expect(fieldBrief).toContainText("Technical Evidence");
    await expect(fieldBrief).toContainText("REDACTED_BEARER_TOKEN");
    await expect(fieldBrief).not.toContainText(secret);
    await expect(fieldBrief).not.toContainText("PRIVATE SESSION CONTEXT MUST NOT EXPORT");
    await page.getByRole("button", { name: "Copy Markdown" }).click();
    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    expect(markdown).toContain("## Technical Evidence");
    expect(markdown).not.toContain(secret);
    expect(markdown).not.toContain("PRIVATE SESSION CONTEXT MUST NOT EXPORT");

    await page.reload();
    await page.getByRole("button", { name: "Open workbench" }).click();
    await expect(page.getByText(/1 attached/)).toBeVisible();
    await page.getByRole("button", { name: "Open / edit" }).click();
    await page.getByRole("button", { name: "Send redacted request to API Lab" }).click();
    await expect(page).toHaveURL(/module=api-studio.*operation=stt-prerecorded.*source=payload-workbench/);
    await expect(page.getByTestId("api-studio-prefill-summary")).toContainText("No request ran");
    await expect(page.getByTestId("api-studio-prefill-summary")).toContainText("query.model");
    expect(forbiddenRouteCalls).toEqual([]);
    expect(page.url()).not.toContain(secret);
    expect(await page.evaluate(() => sessionStorage.getItem("deepgram-payload-code-workbench:api-lab-handoff:v1"))).toBeNull();
  });

  test("keeps deterministic artifact analysis available when official documentation is unavailable", async ({ page }) => {
    await page.route("**/api/deepgram-docs/search", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Official documentation source unavailable" }) }));
    await page.getByLabel("Problem inbox").fill("Why is this prerecorded request failing?");
    await page.getByRole("button", { name: "Extract latest problem" }).click();
    await page.getByRole("button", { name: "Open workbench" }).click();
    const workbench = page.getByTestId("payload-code-workbench");
    await workbench.getByLabel("Technical artifact input").fill("curl --request POST --url 'https://api.deepgram.com/v1/listen?model=nova-3'");
    await workbench.getByRole("tab", { name: "Documentation", exact: true }).click();
    await workbench.getByRole("button", { name: "Search official docs" }).click();
    await expect(workbench.getByText("unavailable", { exact: true })).toBeVisible();
    await expect(workbench).toContainText("Official documentation source unavailable");
    await workbench.getByRole("tab", { name: "Parsed", exact: true }).click();
    await expect(workbench).toContainText("Observed in artifact");
    await expect(workbench).toContainText("stt-prerecorded");
  });

  test("diagnoses a version mismatch, grounds the repair, and exports only redacted SDK evidence", async ({ page }) => {
    const secret = "dg_sdkdoctorabcdefghijklmnopqrstuvwxyz123456";
    const forbiddenRouteCalls: string[] = [];
    const docsPosts: string[] = [];
    await page.route(/\/api\/deepgram\/(?:execute|token|tts|transcribe-file|transcribe-url)(?:\?|$)/, async (route) => {
      forbiddenRouteCalls.push(route.request().url());
      await route.abort();
    });
    await page.route("**/api/deepgram-docs/search", async (route) => {
      docsPosts.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "live-docs",
          technicalQuery: "TypeScript SDK v5 migration and browser authentication",
          searchedAt: "2026-07-28T17:00:00.000Z",
          message: "Mocked current official SDK evidence.",
          evidence: [{
            id: "sdk-feature-matrix",
            title: "SDK Feature Matrix",
            officialUrl: "https://developers.deepgram.com/sdks/sdk-features",
            summary: "Current first-party SDK feature availability.",
            whyItMatters: "Separates API capability from SDK-native support.",
            supportedClaim: "SDK feature availability must be verified against the current first-party matrix.",
            queryUsed: "TypeScript SDK v5 migration and browser authentication",
            retrievedAt: "2026-07-28T17:00:00.000Z",
            sourceType: "deepgram-docs-mcp",
            verificationState: "live-retrieved",
          }],
        }),
      });
    });

    await page.getByLabel("Problem inbox").fill("Why does our TypeScript streaming client fail after an SDK upgrade in a Next.js client component?");
    await page.getByRole("button", { name: "Extract latest problem" }).click();
    await page.getByRole("button", { name: "SDK Doctor 🧪", exact: true }).click();
    const doctor = page.getByTestId("sdk-doctor");
    await doctor.getByLabel("Relevant code or API request").fill([
      '"use client";',
      'import { Deepgram } from "@deepgram/sdk";',
      `const client = new Deepgram("${secret}");`,
      'const socket = client.listen.live({ model: "nova-3" });',
      "socket.send(audio);",
    ].join("\n"));
    await doctor.getByLabel("Exact error").fill("TypeError: client.listen.live is not a function customer@example.com");
    await doctor.getByLabel("Dependency manifest").fill(JSON.stringify({ packageManager: "pnpm@10.0.0", scripts: { typecheck: "tsc --noEmit" }, dependencies: { "@deepgram/sdk": "^5.0.0" } }));
    await doctor.getByLabel("Lockfile excerpt").fill("lockfileVersion: '9.0'\npackages:\n  '@deepgram/sdk@5.1.0':\n    version: 5.1.0");
    await doctor.getByRole("tab", { name: "2. Environment" }).click();
    await doctor.getByLabel("SDK Doctor runtime").selectOption("nextjs-client");
    await doctor.getByLabel("SDK Doctor Deepgram product").selectOption("listen-v1-streaming");
    await doctor.getByLabel("SDK Doctor desired outcome").selectOption("minimal-patch");
    await doctor.getByRole("button", { name: "Diagnose redacted evidence" }).click();

    expect(docsPosts).toEqual([]);
    await expect(doctor.getByText("Code and installed SDK appear to use different interface generations")).toBeVisible();
    await expect(doctor).toContainText("5.1.0");
    await expect(doctor).toContainText("Lockfile");
    await expect(doctor).toContainText("Stale");

    await doctor.getByRole("tab", { name: "5. Sources" }).click();
    const outgoing = doctor.getByLabel("Outgoing SDK Doctor docs query");
    await expect(outgoing).not.toContainText(secret);
    await expect(outgoing).not.toContainText("customer@example.com");
    await expect(outgoing).not.toContainText("client.listen.live is not a function");
    await doctor.getByRole("button", { name: "Search official docs" }).click();
    expect(docsPosts).toHaveLength(1);
    expect(docsPosts[0]).not.toContain(secret);
    expect(docsPosts[0]).not.toContain("customer@example.com");
    expect(docsPosts[0]).not.toContain("new Deepgram");
    await expect(doctor.getByRole("link", { name: "SDK Feature Matrix" })).toHaveAttribute("href", "https://developers.deepgram.com/sdks/sdk-features");

    await doctor.getByRole("tab", { name: "4. Repair" }).click();
    await expect(doctor.getByText("Align the code with the resolved SDK interface")).toBeVisible();
    await expect(doctor.getByText("Focused diff · local validation required").first()).toBeVisible();
    await doctor.getByRole("tab", { name: "6. Validate" }).click();
    await expect(doctor).toContainText("Generated / not executed");
    await expect(doctor).toContainText("pnpm run typecheck");

    await doctor.getByRole("tab", { name: "7. Handoff" }).click();
    await doctor.getByLabel("SDK Doctor customer impact").fill("Customer email customer@example.com cannot validate the upgrade.");
    await doctor.getByRole("button", { name: "Preview Codex repair prompt" }).click();
    const prompt = doctor.getByLabel("Redacted Codex repair prompt");
    await expect(prompt).toContainText("Local validation required");
    await expect(prompt).not.toContainText(secret);
    await doctor.getByRole("button", { name: "Copy Redacted Codex Repair Prompt" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain(secret);
    await doctor.getByRole("button", { name: "Prepare Support Brief" }).click();
    const support = await page.evaluate(() => navigator.clipboard.readText());
    expect(support).toContain("Customer impact");
    expect(support).not.toContain("customer@example.com");
    expect(support).not.toContain(secret);
    await doctor.getByRole("button", { name: "Attach diagnosis to session" }).click();
    await expect(doctor).toContainText("1 diagnosis");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("deepgram-live-solution-studio:session:v1") ?? "")).not.toContain(secret);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("deepgram-live-solution-studio:session:v1") ?? "")).not.toContain("customer@example.com");

    await page.getByRole("button", { name: /Generate (?:local draft|from pinned evidence)/ }).click();
    await page.getByRole("button", { name: "Copy Markdown" }).click();
    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    expect(markdown).toContain("## SDK Diagnosis");
    expect(markdown).toContain("local validation pending");
    expect(markdown).not.toContain(secret);
    expect(markdown).not.toContain("customer@example.com");
    expect(markdown).not.toContain("const client = new Deepgram");
    expect(forbiddenRouteCalls).toEqual([]);

    await page.reload();
    await page.getByRole("button", { name: "SDK Doctor 🧪", exact: true }).click();
    await expect(page.getByTestId("sdk-doctor")).toContainText("1 diagnosis");
    await page.getByTestId("sdk-doctor").getByRole("button", { name: "Open diagnosis" }).click();
    await page.unroute("**/api/deepgram-docs/search");
    await page.route("**/api/deepgram-docs/search", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Official documentation source unavailable" }) }));
    await page.getByTestId("sdk-doctor").getByRole("tab", { name: "5. Sources" }).click();
    await page.getByTestId("sdk-doctor").getByRole("button", { name: "Search official docs" }).click();
    await expect(page.getByTestId("sdk-doctor")).toContainText("unavailable");
    await expect(page.getByTestId("sdk-doctor").getByRole("link", { name: "SDK Feature Matrix" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(width[0]).toBeLessThanOrEqual(width[1] + 1);
  });

});

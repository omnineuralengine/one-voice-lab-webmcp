# Questline → Code Lab Handoff Tests

This document covers the Applied Engineering Questline handoff, its local-draft boundary, browser-media cleanup, exports, and cross-module context. Automated tests run without a real Deepgram credential.

## Safety contract

- Playwright starts the existing Next.js development command on `http://127.0.0.1:3100` with `DEEPGRAM_API_KEY` explicitly empty.
- `reuseExistingServer` is disabled, so tests cannot silently attach to a server that may have a configured credential.
- The test server uses the isolated `.next-e2e` build directory, so it does not contend with a developer's normal `.next` process or lock.
- Do not put a credential in Playwright configuration, fixtures, storage state, traces, screenshots, downloads, or CI variables.
- Provider-facing routes stay mocked or uncalled in browser tests. Real-provider validation requires a separate, explicitly authorized profile.
- Authorization values, API keys, and temporary tokens must be redacted from browser surfaces, storage, launch context, and exports.
- Learner-authored code is edited and saved as text only. Neither Questline nor Code Lab executes it.

## Current runner

The Playwright projects use the locally installed Microsoft Edge channel at 1366 × 768, 1440 × 900, and 1920 × 1080. No Chromium download is required for the current configuration. Run `npx playwright install chromium` only if the configuration is deliberately changed back to Playwright's bundled Chromium.

```powershell
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:questline
npm run check
```

Current Questline specs cover handoff, progress, security, layout, microphone lifecycle, and exports:

- `questline-handoff.spec.ts`
- `questline-progress.spec.ts`
- `questline-security.spec.ts`
- `questline-layout.spec.ts`
- `questline-microphone.spec.ts`
- `questline-exports.spec.ts`

## Handoff behavior under test

Choose **Open this quest in Code Lab** to open a confirmation dialog. The dialog previews the sanitized language, runtime, workflow, generated files, Deepgram capabilities, audio-source label when available, and security warnings before changing modules.

The three confirmation modes are:

- **Open as a new temporary workspace** — the recommended and default mode. Generated files remain in memory until the learner explicitly chooses **Save as local draft**.
- **Merge generated files** — keeps the current view and places duplicate generated paths under deterministic import paths. It does not overwrite existing local work.
- **Replace workspace** — replaces only the current in-memory Code Lab view. Existing localStorage drafts remain untouched.

Important persistence rules:

- Editing a temporary file is not an autosave.
- Persistence occurs only when **Save as local draft** is selected.
- Draft keys isolate workflow, language, and path, so a saved TypeScript browser-mic draft must not be changed by a Python batch-STT launch.
- A temporary launch context expires on browser refresh. The generated temporary workspace is not silently restored; the UI explains that explicitly saved drafts remain and the quest must be launched again.
- Temporary launch metadata may use a short-lived session marker for refresh detection, but generated source and credentials are not persisted as a hidden workspace.

Semantic navigation is part of the handoff contract. The Code Lab project tree selects generated files, while the teaching panel's semantic regions—such as setup, authentication, request, audio send, event receive, parsing, errors, cleanup, and testing—select the relevant file and highlight its line range. Unsupported regions remain absent rather than being invented.

## Stable automated helper surface

Specs import `tests/e2e/helpers.ts` and prefer accessible roles and labels over styling selectors.

- Navigation: `openAppliedEngineeringQuestline`, `openCodeLab`, `openApiStudio`, `selectQuestlineWorkspace`, `selectQuestlineLanguage`
- Progress/storage: `clearLabStorage`, `readStorageSnapshot`, `readLocalStorageJson`, `expectLocalStorageValue`, `QUESTLINE_STORAGE_KEY`
- Downloads: `captureDownload`, `readDownloadText`, `expectSanitizedDownload`
- Secret checks: `findPotentialSecrets`, `expectNoPotentialSecrets`, `expectBrowserSurfaceSanitized`
- Layout: `TARGET_VIEWPORTS`, `useTargetViewport`, `expectNoPageLevelOverflow`, `expectLocatorWithinViewport`, `expectLocatorsNotToOverlap`, `expectInternalScrollRegion`
- Code Lab: `selectCodeLabWorkflow`, `CODE_LAB_DRAFT_PREFIX`

## Exact 16-step manual live checklist

1. Open Questline.
2. Select TypeScript browser-mic quest.
3. Launch into Code Lab.
4. Verify project tree and semantic regions.
5. Edit a file.
6. Save as local draft.
7. Return to Questline.
8. Open a Python batch-STT quest in a new temporary workspace.
9. Verify the TypeScript draft remains unchanged.
10. Open related API Studio operation.
11. Return to Code Lab.
12. Confirm context remains accurate.
13. Test a microphone lesson with real hardware.
14. Confirm tracks stop on exit.
15. Export a sanitized learning artifact.
16. Search the export for secret values.

## Detailed manual assertions

### Questline and Code Lab

- [ ] The Applied Engineering Questline shell, local-progress disclaimer, quest tree, and runtime panel render.
- [ ] TypeScript and Python quest selection changes the lesson, code example, runtime model, and related workflow.
- [ ] **Open this quest in Code Lab** opens the confirmation dialog rather than navigating immediately.
- [ ] The default selected choice is **Open as a new temporary workspace**.
- [ ] Cancel returns focus to the launch control and leaves the current workspace unchanged.
- [ ] Confirming temporary mode shows the correct workflow, language, generated project tree, status, teaching notes, and security boundary.
- [ ] Selecting a semantic region changes the active file when necessary and highlights the expected lines.
- [ ] Editing a generated file alone creates no local draft key.
- [ ] **Save as local draft** creates the expected local draft and shows saved status.
- [ ] Launching a different language/workflow in temporary mode leaves the earlier saved draft byte-for-byte unchanged.
- [ ] Merge mode preserves existing paths and uses deterministic import paths for collisions.
- [ ] Replace mode changes only the in-memory view and does not delete prior local drafts.
- [ ] Refreshing a temporary workspace shows the expiry notice, clears temporary context, and preserves explicitly saved drafts.

### API Studio round trip

- [ ] **Open related API** selects the expected API Studio operation or a clear safe fallback.
- [ ] Generated requests redact Authorization and use environment placeholders.
- [ ] Returning to Code Lab retains the matching Questline context only when the operation belongs to that handoff.
- [ ] Cross-linking to an unrelated operation does not claim stale Questline context.

### Progress and exports

- [ ] Quest status and notes persist only in localStorage under the documented Questline key.
- [ ] Export progress JSON and learning-notes Markdown.
- [ ] Export an incident report, audio diagnosis, capstone brief, polyglot comparison, and Client Stack Adapter JSON.
- [ ] Filenames match their artifact and format.
- [ ] Audio exports identify measured, simulated, or unavailable provenance.
- [ ] Polyglot implementations and stack recommendations retain their status metadata where the UI currently exposes it.
- [ ] Search every export for real-looking Authorization values, JWTs, temporary tokens, credential assignments, token query strings, raw audio, and the deterministic test sentinel.
- [ ] Safe placeholders such as `DEEPGRAM_API_KEY`, `$DEEPGRAM_API_KEY`, and `process.env.DEEPGRAM_API_KEY` remain readable.

Every Questline download receives generated/status/verification metadata before the central export sanitizer runs. Tests treat missing provenance as a defect rather than silently annotating it in fixtures.

## Remaining real-hardware and live checks

These checks cannot be proven by deterministic MediaDevices mocks alone:

- [ ] Grant and deny real browser microphone permission and confirm the user-facing recovery guidance.
- [ ] Select each physically connected microphone and confirm only its display label—not its device ID—appears in the Code Lab confirmation context.
- [ ] Confirm the browser-reported sample rate, sample size, channels, latency, echo cancellation, noise suppression, and automatic-gain settings are plausible for the selected device.
- [ ] Speak softly, normally, and near clipping; compare the audible result with waveform, RMS, peak, and clipping indicators.
- [ ] Confirm actual MediaRecorder MIME and chunk timing match the browser rather than an assumed codec/container.
- [ ] Use **Stop + release**, workspace navigation, rail navigation, and unmount/refresh paths; verify the operating-system/browser microphone indicator clears every time.
- [ ] With explicit authorization and a server-side key, obtain a temporary token through the local route and verify Live Mic transcription without exposing either credential.
- [ ] Exercise one STT URL request, one bounded file upload, and one TTS request through existing guarded server routes.
- [ ] Verify API Studio and Payload Inspector show sanitized request IDs/status/timing while never showing Authorization or temporary-token values.
- [ ] Repeat the highest-value live checks at 1366 × 768, 1440 × 900, and 1920 × 1080 and confirm panels scroll internally with no clipped controls.

External Deepgram traffic remains outside the default Playwright suite. Keep live validation intentional, bounded, and visibly distinct from simulated or local-only evidence.

# Live Observatory Lab — Implementation Contract

> **Historical implementation contract.** Live Observatory Lab is implemented with fixture-verified controls and manual live verification remaining. Use the application, root README, and `LIVE_OBSERVATORY_LAB.md` for current status; deferred items here are not completion claims.

## Summary

Implement a top-level **Live Observatory Lab** with two strictly separated modes:

- **Synthetic Preview:** deterministic Northstar fixtures, visibly synthetic, and technically incapable of contacting Deepgram.
- **Live Lab Mode:** manually activated, guarded, uses existing server-side credentials, and makes billable requests only after operation-specific confirmation.

Use `AVS.pdf` for product intent, the repository for implementation truth, and current official Deepgram documentation for API truth. Automated validation must use mocks and consume zero Deepgram credits. Real-account behavior remains **ready for manual verification** until the user performs the documented live checks.

## Milestones

### 1. Foundation, modes, and event model

- Add **Live Observatory Lab** to the existing left rail.
- Build a compact, internal-scroll workspace with mode/preset navigation, pipeline and experiment workspace, and trace/metrics/inspector/cost panels.
- Maintain run state in memory with strict `live | synthetic` separation.
- Normalize events with run/session/turn/request/local-event IDs, timestamps, sequence, source, stage, provenance, duration, severity, redaction state, and sanitized payload.
- Render `Audio ingress → STT → Turn-taking → Agent → Tools → TTS/playback → Outcome` and pulse only stages supported by actual events.
- Respect reduced motion and reuse the sanitized Payload Inspector.

### 2. Credit Guard and lifecycle control

- Maximum concurrent operation: one.
- Live STT: 60 seconds; future Voice Agent: 120 seconds.
- Upload: five minutes when verifiable, with a bounded size fallback.
- TTS: 500 characters; Voice Loop: 200 characters and no automatic repetition.
- Disable inference retries, polling, scheduled execution, page-load execution, navigation execution, loops, prefetching, and load testing.
- Require an operation-specific confirmation showing operation, model/configuration, input size or duration, billable request count, and local limit.
- Stop microphone tracks, recorder, WebSockets, fetches, playback, and timers; finalize the trace and prevent late activity.
- Preserve existing Live Mic behavior outside Observatory; use an Observatory-specific single-attempt option.

### 3. Guarded live demonstrations

1. **Speak and Watch:** temporary-token Live STT, live trace and pulses, request ID, 60-second stop, single attempt. One billable streaming session.
2. **Compare Two Configurations:** one short audio source, sequential A/B STT, transcript comparison, WER only with reference. Two billable requests.
3. **Hear the API:** bounded TTS with request metadata, byte size, timing, and playback lifecycle. One billable request.
4. **Voice Loop:** bounded TTS → prerecorded STT, both request IDs, transcript diff, optional ground-truth WER. Two billable requests.
5. **Italian Voice Path:** bounded Italian TTS using verified `aura-2-livia-it`; no translation claim. One billable request.
6. **Northstar Agent:** disabled and conditional until the repository, account, and official Agent integration requirements are verified.

Include one short fictional sample WAV with a safe reference transcript.

### 4. Cost, history, exports, and documentation

- Add server-only read-only Management actions for accessible projects, requests, per-request cost, usage breakdown, and balances.
- All upstream Management operations are GET-only; add no account mutations.
- Perform at most one immediate cost lookup and one bounded delayed retry; subsequent requests are manual.
- Use honest cost labels: Actual cost, Pending, Estimated locally, Unavailable, Management scope unavailable. V1 does not calculate local estimates.
- Keep active runs in memory. Save metadata only through explicit user action using `deepgram-observatory-runs:v1`.
- Transcript persistence requires separate warned opt-in and independent deletion. Never retain raw audio or secrets.
- Export sanitized JSON/Markdown; include transcripts only with separate approval; reject exports if a high-confidence secret remains.

## Architectural decisions

- Use small data-driven registries, event/metric helpers, a Credit Guard, an in-memory Observatory provider, and focused UI components.
- Use officially supported STT request tags only: `avs_observatory_live`, `avs_stt_experiment`, and `avs_round_trip`.
- Correlate TTS by local run ID and real Deepgram request ID; do not invent TTS tags.
- Time to first transcript is measured from the first successfully sent audio chunk to the first non-empty result.
- Speech-end to final appears only when comparable verified timestamps exist; otherwise it is unavailable.
- WER uses normalized word-level Levenshtein distance against explicit ground truth; punctuation differences remain separate.
- Frequent audio activity may be summarized in the trace without changing audio sent to Deepgram.
- Display permanently: **Heat is not causality. Live signals identify where investigation should begin.**

## Testing contract

Use mocked token, STT REST/WebSocket, TTS binary, Management, microphone, recorder, playback, and audio APIs. Tests must fail if a real Deepgram host is contacted.

Cover no request on mount/navigation, confirmations, concurrency, controlled 60-second stop, complete cleanup, redaction, pulse mapping, mode isolation, Management outcomes, WER gating, history/transcript consent, export sanitization, secret rejection, reduced motion, keyboard access, and layouts at 1366×768, 1440×900, and 1920×1080. Re-run critical regression coverage for Live Mic, Payload Inspector, API Studio, Code Lab, and Questline handoff.

Validation commands:

```text
npm run lint
npm run build
npm run test:e2e:observatory
```

## Manual live-account validation

Codex must not perform these billable actions. The user will:

1. Check read-only project/balance access.
2. Run one short prerecorded STT request and inspect its request ID and pulse.
3. Attempt one documented per-request cost lookup.
4. Run one 10–15 second microphone session and confirm Stop/cleanup.
5. Run one short TTS request and inspect playback trace.
6. Run one bounded Voice Loop.
7. Run the Italian Voice Path.
8. Export a sanitized run and search exports, storage, logs, URLs, and test artifacts for secrets.

Live cost and latency behavior remains **ready for manual verification** until these checks are completed.

## Deferred scope

- Executable Voice Agent/Northstar Agent
- Database infrastructure
- Real customer connectors
- Production telemetry ingestion
- Background jobs and recurring polling
- Load testing
- Unrestricted agent loops
- Account or project mutations
- Claims of general accuracy, reliability, satisfaction, or agent quality from bounded demonstrations

## Definition of Done

- Observatory is a working top-level module with unmistakable synthetic and live modes.
- Synthetic mode is deterministic and unable to contact Deepgram.
- Every live operation requires operation-specific confirmation.
- Five demos are implemented and fixture-verified; Northstar Agent remains honestly disabled.
- Credit Guard, single-attempt behavior, 60-second stop, and cleanup work.
- Pulses, trace, timing, IDs, metrics, and cost states carry explicit provenance.
- WER appears only with intentional ground truth; Actual cost appears only from Management data.
- Management permission failures degrade safely.
- History is explicit and metadata-only by default.
- Exports contain no credentials, tokens, account-sensitive metadata, or audio.
- Existing critical modules retain their behavior.
- Lint, production build, and targeted Observatory tests pass without using Deepgram credits.
- Manual live-account checks are documented and explicitly incomplete until the user runs them.

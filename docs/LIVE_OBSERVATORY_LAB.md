# Live Observatory Lab

Live Observatory Lab is a controlled local demonstration that visualizes real Deepgram request and streaming events. It is not a Deepgram internal product, production telemetry system, or customer connector.

This general STT/TTS observability surface is distinct from
`/flux-observatory`. Flux Conversation Observatory uses the conversational
`/v2/listen` contract, a dedicated turn-event reducer, deterministic replay,
dynamic Configure tracking, and turn intelligence. Neither surface's fixture
evidence is a live provider validation.

## Mode boundary

- **Synthetic Preview** loads deterministic fictional Northstar Home Goods events. It cannot request a token, open a Deepgram socket, or call a Deepgram REST route.
- **Live Lab Mode** must be activated manually. Each operation then requires a second operation-specific confirmation before any billable request starts.

Every event identifies its source, pipeline stage, and provenance (`measured`, `derived`, `simulated`, `human-rated`, or `unavailable`). Unused pipeline stages do not pulse. “Heat is not causality” remains visible throughout the workspace.

## Demonstrations

| Demo | Billable requests | Default bound | Status |
|---|---:|---|---|
| Speak and Watch | 1 streaming STT session | 60 seconds | Implemented; ready for manual live verification |
| Compare Two Configurations | 2 prerecorded STT requests | One source, five minutes when duration is available | Implemented; ready for manual live verification |
| Hear the API | 1 TTS request | 500 characters | Implemented; ready for manual live verification |
| Voice Loop | 1 TTS + 1 prerecorded STT | 200 characters, one sequential run | Implemented; ready for manual live verification |
| Italian Voice Path | 1 TTS request | 200 characters, `aura-2-livia-it` | Implemented; ready for manual live verification |
| Northstar Agent | 0 | Disabled | Conditional and deferred |

Northstar Agent remains disabled because the repository does not yet contain a verified Voice Agent session/player/settings integration or account-capability preflight. It never fabricates Agent or Tool activity.

The comparison surface also provides **Configuration A only** as a one-request manual-validation path before the learner chooses to spend two requests on an A/B comparison.

## Evidence, storage, and cost

Runs record local IDs, Deepgram request IDs when returned, sanitized evidence, timing, errors, and cost state. WER appears only with explicit ground truth. Active runs stay in memory. **Save metadata** stores a separately versioned sanitized record; transcript storage and export require a separate warning and opt-in. Raw microphone audio is never stored.

Read-only usage and cost access is disabled until explicitly enabled. Project IDs remain server-side behind temporary local handles. “Actual cost” appears only when the documented request record returns `details.usd`; no local price table or hardcoded balance is used.

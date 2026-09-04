# ElevenLabs core provider convergence

Date: **2026-08-29**
Stage: **the ElevenLabs provider integration**
Starting checkpoint: `62a25225d18f3de80aec01caa71e555aa006bd27`

## Status

ElevenLabs now exercises the canonical ONE provider kernel for the OVL capabilities that already existed: account-scoped model and voice discovery, batch Text to Speech, voice selection, and prerecorded Speech to Text.

`LIVE ELEVENLABS VERIFICATION: NOT PERFORMED`

No provider request or provider credit was used for this convergence. Registration, a server credential, or a fixture does not independently authorize execution. Runtime policy, budgets, public invocation, benchmark eligibility, and ranking were not promoted.

## What converged

- Stable provider ID: `elevenlabs`.
- Explicit capability declarations: `discovery.models`, `discovery.voices`, `tts.batch`, `tts.voice-selection`, and `stt.prerecorded`.
- One provider registration owns catalog, normalized discovery, TTS, STT, server-only credential definition, evaluation metadata, and deterministic fixtures.
- The generic provider routes, API Studio, Evaluate, Provider Hub, REST, MCP, and Stage 3 projections consume shared contracts rather than a new ElevenLabs-specific platform.
- The existing fixed ElevenLabs HTTP transport remains isolated in the provider client; no second transport was added.

## Discovery and privacy boundary

Model and voice discovery are credential-backed and account-scoped. Provider payloads terminate at the ElevenLabs normalization boundary.

The canonical projection retains only fields required by ONE:

- stable provider model or voice ID;
- display name;
- implemented TTS capability;
- validated language identifiers where supplied;
- source and verification provenance; and
- bounded pagination state.

Arbitrary labels, descriptions, preview and sample URLs, ownership/account metadata, authorship metadata, and unrelated provider capability flags are discarded. Account-scoped discovery requires verified access in hosted production and is never added to the public default provider projection.

## Execution and credential policy

`ELEVENLABS_API_KEY` remains server-only and is read through the shared credential helper. Public projections expose only coarse readiness, never the environment-variable name or value.

Network-capable operations require exact, non-interchangeable policy proofs:

- model discovery → `discovery.models`;
- voice discovery → `discovery.voices`;
- TTS → `tts.batch` plus independent model and voice discovery proofs used for catalog validation; and
- prerecorded STT → `stt.prerecorded`.

All proofs for composite TTS are validated before parallel discovery can begin. Direct adapter invocation, cache access, a legacy feature flag, registration, fixtures, or credential presence cannot bypass this boundary.

The generic routes continue to apply Stage 2 input, trust, quota, budget, and concurrency controls. TTS is bounded to 1,000 characters and a 16 MiB normalized audio response. STT retains trusted server-side audio-duration admission, a 10 MiB upload bound, and no arbitrary URL input.

## Fixtures, errors, and evidence

Four deterministic shared-contract fixtures cover model discovery, voice discovery, TTS, and prerecorded STT. They require no credential or network and report `synthetic-fixture` provenance. They make no claim about provider latency, quality, pricing, health, entitlement, or live availability.

Canonical errors cover invalid requests, missing configuration, policy denial, authentication/authorization failure, rate limits, quota exhaustion, upstream failures, timeout, malformed responses, and oversized responses. Raw upstream bodies, request headers, private voice metadata, and credentials are not returned.

Discovery evidence distinguishes a live dispatch from a fresh cache result. Dispatched upstream HTTP failures retain their safe status provenance and report that provider transport occurred; pre-dispatch policy and validation denials report that it did not. TTS evidence records the normalized operation and safely knowable dispatch/timing state without claiming a request occurred after a pre-dispatch denial.

## UI and evaluation

ElevenLabs API Studio is a compatibility client over the shared provider routes. Its configured and executable states come from the canonical provider projection. The default policy remains fail closed.

Evaluate receives ElevenLabs standardized and native output information from the adapter evaluation profile. Anonymous hosted callers cannot inspect the account-scoped model catalog; protected access requires an authenticated member, and voices remain restricted to the operator-approved public/stock allowlist. Standardized `pcm_24000` uses an upstream streaming response but ONE buffers and validates it to completion; OVL does not claim a streaming TTS capability.

## Runtime state

- Integration: contract tests passed / fixture validated.
- Credential readiness: unconfigured by default; configured does not imply healthy or enabled.
- Runtime: disabled unless every canonical policy and cost gate explicitly permits the operation.
- Provider budgets: disabled by default.
- Public invocation: disabled by default.
- Public benchmark eligibility: false.
- Public ranking eligibility: false.
- Live account verification: not performed.

## Legacy-path disposition

- `src/lib/providers/elevenlabs/client.ts` is the single server-only provider transport.
- Generic model, voice, TTS, and STT routes are canonical callers.
- API Studio and Evaluate do not construct provider requests directly.
- Legacy Open Lab readiness helpers remain transitional compatibility inputs for non-converged runtime capability reporting; they are not adapter execution authority.
- No obsolete duplicate ElevenLabs transport was found.

## Deferred ElevenLabs functionality

Realtime STT, true streaming TTS delivery, voice cloning, agents and conversational AI, dubbing, sound effects, administration, webhooks, and other ElevenLabs product families remain outside this stage. Account entitlement, live catalog shape, output quality, latency, pricing, quota behavior, and production suitability require a separately authorized live-verification stage.

## Validation

- Provider contracts: 118 unit/contract tests and 9 provider browser tests passed, including Fish regression coverage.
- Full unit suite: 749 passed; 3 unrelated failures match the existing Solution Deliverables baseline and preserved local operator work.
- Main browser suite: 88 passed, 12 failed, and 6 intentionally skipped. The 12 failures are exactly the seven stable unrelated and five Windows download-stream cohorts documented in `docs/POST_FISH_E2E_BASELINE.md`; the three previously flaky shared-suite cases passed.
- Typecheck and production build passed. Lint passed with the established three unrelated warnings and zero errors.
- Secret audit passed across 693 source and browser-asset files.
- Provider requests: zero. Provider credits: zero.

## Next stage

The next expected convergence stage is **the Deepgram provider integration — Deepgram Core Provider Convergence**. This record does not authorize it.

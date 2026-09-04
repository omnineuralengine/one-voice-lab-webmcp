# Deepgram core provider convergence

Date: **2026-08-29**

Stage: **the Deepgram provider integration**

## Status

Deepgram now uses the canonical ONE provider kernel for the request-response capabilities already present in ONE Voice Lab: static model and voice discovery, prerecorded Speech to Text, batch Text to Speech, and model-ID-based voice selection.

`LIVE DEEPGRAM VERIFICATION: NOT PERFORMED`

No Deepgram request or provider credit was used for this convergence. Deterministic fixtures verify ONE's contracts only; they do not establish current Deepgram latency, quality, pricing, availability, entitlement, or production suitability.

## Canonical capability boundary

| Capability | ONE implementation | Evidence | Live status |
| --- | --- | --- | --- |
| `discovery.models` | Bounded, dated static STT and TTS model projection | Repository and fixture verified | No live discovery performed |
| `discovery.voices` | Bounded, dated static Aura voice projection | Repository and fixture verified | No live discovery performed |
| `stt.prerecorded` | Canonical `ProviderSttAdapter` over bounded file transcription | Repository and fixture verified | Not live verified |
| `tts.batch` | Canonical `ProviderTtsAdapter` over buffered HTTP synthesis | Repository and fixture verified | Not live verified |
| `tts.voice-selection` | Deepgram Aura model ID carries voice selection | Repository and fixture verified | Not live verified |

The stable provider ID remains `deepgram`. One registration owns the catalog, normalized discovery, STT/TTS adapters, server-only credential definition, evaluation metadata, and four deterministic fixture adapters. Registration, adapter availability, fixture availability, credential presence, runtime authorization, and live/realtime readiness remain separate facts.

## Discovery and privacy boundary

The canonical public model and voice projections use an explicit static catalog. They require no credential and make no provider request. Provider-specific records terminate at the Deepgram normalization boundary and expose only stable identifiers, display names, declared modalities/capabilities, verified language metadata where available, availability state, source, and verification time.

Project-scoped and account-private model discovery remains an API Studio compatibility/management concern and is **not** part of canonical public provider discovery. It is not silently substituted for static discovery, cached into the public projection, or invoked by Provider Hub, REST, MCP, or Evaluate. A later focused design must establish authorization, visibility, bounded caching, refresh, and failure behavior before account-private discovery can become canonical.

## Execution and credential policy

`DEEPGRAM_API_KEY` remains server-only and is read only after validation and exact-operation authorization. Credential presence establishes, at most, configured state; it does not authorize a request or establish health.

Network-capable core operations require a non-interchangeable policy proof for the exact operation:

- prerecorded STT -> `stt.prerecorded`;
- batch TTS -> `tts.batch`;
- static public model and voice reads -> no paid execution authorization because no provider transport is possible; and
- project-scoped account-private model discovery -> denied and deferred before provider transport.

An API key, registered adapter, fixture, feature flag, cached/static record, UI state, or direct adapter call cannot independently authorize provider transport. Stage 2 identity, trust, quota, provider/global budget, concurrency, and kill-switch controls remain authoritative where the operation is cost-bearing. Pre-dispatch denial is represented as no provider request sent.

## Prerecorded Speech to Text

The canonical STT path accepts a bounded local upload only. The paid admission sequence remains:

1. same-site and provider/capability policy preflight;
2. multipart and file-size bounds;
3. trusted server-side PCM RIFF/WAV inspection;
4. duration-based quota and budget admission;
5. concurrency lease;
6. exact `stt.prerecorded` policy proof;
7. adapter dispatch;
8. bounded response parsing and normalized transcript output.

The current canonical upload limit is 10 MiB, and Stage 2's trusted media boundary limits admitted audio to five minutes. Client-supplied duration is not authoritative. Arbitrary URL transcription and JSON URL execution remain disabled. Unsupported, malformed, oversized, or unverifiable media fails before provider dispatch.

Only bounded transcript, timing, confidence, speaker, detected-language, and safe request-identity fields survive normalization. Arbitrary upstream provider/account fields do not escape the provider boundary.

## Batch Text to Speech

Deepgram batch TTS uses the canonical TTS adapter. The request is validated and authorized before the server credential is read or the provider transport can run. Deepgram's Aura model identifier is also the voice-selection identifier, so generic Evaluate logic does not maintain a second provider-specific voice field or transport.

The adapter exposes the standardized linear16 24 kHz request plus bounded native MP3/linear16 options. ONE buffers and validates the upstream response to completion; this is a batch capability and is not evidence of a canonical streaming-TTS implementation. Timeouts, cancellation, malformed responses, oversized audio, authentication/authorization errors, quota/rate limits, and upstream failures map to sanitized canonical errors.

Generated audio is short-lived and session/client scoped. Another admitted session cannot retrieve or delete a generated-audio reference. No raw provider body, credential, or authorization header is included in public errors or operation evidence.

## Deterministic fixtures and evidence

Four shared-contract fixtures cover static model discovery, static voice discovery, batch TTS, and prerecorded STT. They are deterministic, credential-free, network-free, and labeled `synthetic-fixture`. Fixture byte counts and transcripts validate contract behavior only; fixture timing is never reported as provider latency.

Canonical operation evidence records only safely knowable facts such as provider, capability, operation, mode, policy decision, dispatch state, normalized status, correlation ID, measured timing when applicable, and normalized failure class. A cache/static read, fixture execution, pre-dispatch denial, live dispatch, and upstream failure remain distinguishable.

## API Studio, Evaluate, and compatibility paths

API Studio remains a broader allowlisted Deepgram learning workbench. Its core public-model, prerecorded-STT, and batch-TTS compatibility paths delegate to the canonical provider services where their semantics match. Account/project management, Text Intelligence, and realtime/session families remain separate compatibility or deferred surfaces; they are not declared as canonical core provider capabilities by this convergence.

Evaluate receives model/voice catalogs and TTS configuration from the canonical Deepgram adapter profile. Provider cards, Provider Hub, REST, MCP, benchmark planning, and public projections consume shared provider contracts rather than a Deepgram-specific schema. Static discovery does not contact Deepgram, and fixture runs do not authorize live execution.

## Realtime and temporary-token boundary

Streaming STT, Flux/turn-aware STT, streaming TTS, Voice Agent sessions, microphone capture, browser WebSockets, partial-result lifecycles, reconnects, and temporary browser credentials are not request-response operations. They remain outside the canonical batch contracts pending the provider-neutral realtime/session architecture described in [Deepgram realtime architecture boundary](DEEPGRAM_REALTIME_ARCHITECTURE.md).

Hosted temporary-token issuance remains disabled. Deepgram's documented token grant is broad enough to require additional ONE-side session, replay, concurrency, quota, and spend controls; current official material does not establish single-use, replay, concurrent-socket, session-binding, or revocation semantics. A reconnect must therefore obtain fresh ONE admission and a fresh token rather than reuse a credential.

## Runtime state

- Integration: canonical core adapters and deterministic fixtures implemented.
- Credential readiness: unconfigured by default; configured does not imply enabled, healthy, or live verified.
- Runtime: fail closed unless every canonical policy and cost gate explicitly permits the exact operation.
- Provider/global budgets: disabled by default.
- Hosted temporary-token issuance: disabled.
- Arbitrary URL STT: disabled.
- Public invocation: disabled by default.
- Public benchmark eligibility: unchanged; fixtures are not public evidence.
- Public ranking eligibility: unchanged.
- Live core verification: not performed.
- Realtime architecture: deferred.

## Official source inventory

Official Deepgram sources were reviewed on **2026-08-29**. These sources describe provider behavior; ONE's fixture evidence remains separate.

- [Deepgram API authentication](https://developers.deepgram.com/reference/authentication)
- [List models](https://developers.deepgram.com/reference/manage/models/list)
- [Prerecorded Speech to Text](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded)
- [Live Speech to Text](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)
- [Single-request Text to Speech](https://developers.deepgram.com/reference/text-to-speech/speak-request)
- [Streaming Text to Speech](https://developers.deepgram.com/reference/text-to-speech/speak-streaming)
- [Token-based authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication)
- [Grant a temporary token](https://developers.deepgram.com/reference/auth/tokens/grant)
- [WebSocket subprotocol authentication](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol)
- [API rate limits](https://developers.deepgram.com/reference/api-rate-limits)

## Deferred Deepgram work

- live STT/TTS credential and contract verification;
- project/account-private model discovery convergence;
- a provider-neutral realtime/session architecture;
- hosted temporary-token issuance;
- streaming STT, Flux, streaming TTS, Voice Agent, and other long-lived sessions;
- live entitlement, rate-limit, latency, reliability, quality, pricing, and cost verification;
- production policy/budget promotion; and
- public benchmark/ranking promotion.

## Validation

- Focused Deepgram adapter, route, policy, temporary-token, and live-client regression tests passed without provider network access.
- Provider validation passed: 137 unit/contract tests and 9 provider browser tests, including Fish and ElevenLabs regression coverage.
- The full unit suite passed 772 tests; the three remaining failures are the two documented Solution Deliverables baseline failures and one assertion caused by preserved, unrelated keyboard companion/operator work.
- The main browser suite matched the ElevenLabs checkpoint exactly: 88 passed, 12 documented baseline failures, and 6 intentional skips. No new Deepgram, provider, benchmark, or failure cohort appeared.
- Evaluate validation passed 52 unit tests and 4 browser tests; its one remaining Windows/Chromium empty-download-stream failure matches the established baseline.
- Typecheck and the 89-page production build passed. Lint passed with zero errors and the established three unrelated warnings.
- Secret audit passed across 697 source and browser-asset files. `git diff --check` passed.
- Live Deepgram requests: **0**. Deepgram credits consumed: **0**.

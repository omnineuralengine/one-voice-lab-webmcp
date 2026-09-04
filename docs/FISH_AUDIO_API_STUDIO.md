# Fish Audio API Studio

Verification date: **2026-08-28**.

Fish Audio API Studio is the existing UI client for the scoped canonical `fish-audio` integration at `/providers/fish-audio/api-studio`. It is community-built and independent; it is not an official Fish Audio product, endorsement, benchmark, or production-readiness claim.

The detailed convergence record is [`providers/FISH_AUDIO.md`](providers/FISH_AUDIO.md).

## Repository verified

- Stable provider ID: `fish-audio`.
- Current static TTS models (`s2-pro`, `s1`) are normalized without a credential or network call. Compatible older identifiers remain execution-only compatibility values and are not presented as current discovery.
- Voice discovery is normalized at the provider boundary and returns only explicitly public records. Private/unlisted resources, authors, samples, previews, and arbitrary source metadata are excluded.
- Four deterministic shared fixtures cover models, public voices, buffered TTS, and beta prerecorded STT. Fixture output is labeled `synthetic-fixture`, never live.
- `FISH_AUDIO_API_KEY` is a server-only credential definition. It is never serialized to client code, public evidence, fixtures, telemetry, errors, or response metadata.
- Voice discovery, TTS, selected-voice validation, and STT fail before provider transport unless canonical policy explicitly authorizes the exact operation. A key or legacy feature flag alone is insufficient.
- Inputs, uploads, upstream bodies, audio responses, timeouts, request concurrency, and error details remain bounded and normalized.
- The page makes no provider request on load and displays canonical configured/runtime state. Execution controls remain disabled when current policy cannot prove execution is allowed.

## Evidence status

- **Implemented:** canonical catalog capabilities, normalized public discovery, shared credential definition, adapter-owned Evaluate semantics, operation-bound execution authorization, deterministic fixtures, normalized errors/evidence, route compatibility, and truthful UI state.
- **Fixture/contract verified:** yes.
- **Mocked transport verified:** yes; representative success and failure states are covered without live traffic.
- **Live verified:** no.
- **Runtime enabled:** no default or production enablement was made.
- **Benchmark eligible/ranked:** no.
- **Fish requests made in the Fish Audio provider integration:** none.
- **Fish credits intentionally consumed in the Fish Audio provider integration:** none.

## Official contract references

- <https://docs.fish.audio/api-reference/introduction>
- <https://docs.fish.audio/api-reference/endpoint/model/list-models>
- <https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech>
- <https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text>

Provider documentation is attributable capability evidence. It does not establish account entitlement, live quality, latency, pricing, quota, reliability, retention, or production readiness.

## Deferred

Live synthesis/STT verification, private or account-scoped discovery, private voices, cloning/model creation, realtime STT, WebSocket or streaming-result TTS, agents, provider administration, live benchmarks, cost benchmarks, and production activation remain explicitly deferred.

Do not configure or enable Fish from this document. Production credentials, policy, budgets, and any live verification require a separate authorized stage.

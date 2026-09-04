# the Cartesia provider onboarding — Cartesia focused canonical onboarding

Date: **2026-08-29**

Starting checkpoint: `657a8b79384e8a1e4abaa4b19de9f8ed7d947011`

## Status

Cartesia now uses the canonical ONE provider kernel for the request-response
capabilities already present in ONE Voice Lab: bounded static model discovery,
account-scoped voice discovery, buffered batch Text to Speech, and separate
voice selection.

`LIVE CARTESIA VERIFICATION: NOT PERFORMED`

No live Cartesia request was made and no Cartesia credit was consumed. The
fixtures and mocked transports verify ONE's contracts only. They do not prove
current Cartesia latency, quality, pricing, availability, entitlement,
reliability, or production suitability.

## Canonical capability boundary

| Capability | ONE implementation | Evidence | Live status |
| --- | --- | --- | --- |
| `discovery.models` | Bounded, dated static projection for `sonic-3.5` and `sonic-3` | Provider-documented and fixture-verified | No provider request; availability remains unknown |
| `discovery.voices` | Bounded account-scoped discovery with protected allowlisting | Provider-documented and fixture-verified normalization | Not live verified |
| `tts.batch` | Buffered HTTP synthesis using raw 24 kHz signed 16-bit little-endian PCM | Provider-documented and fixture-verified | Not live verified |
| `tts.voice-selection` | Separate selected voice identifier validated through the account-scoped catalog | Provider-documented and fixture-verified | Not live verified |

ONE does not declare Cartesia STT, realtime, session, WebSocket, or other
provider product families in this stage.

## Registration and source of truth

The stable provider ID remains `cartesia`. One canonical registration owns the
catalog adapter, normalized discovery adapter, batch-TTS adapter, server-only
credential declaration, evaluation profile, and deterministic fixture
adapters. Provider listing, adapter installation, fixture support, credential
configuration, runtime authorization, live verification, benchmark
eligibility, and public ranking remain separate facts.

The code-owned provider catalog declares only the implemented capability
surface. Mutable operational policy remains server-authoritative and can narrow
but never manufacture an installed capability.

## Discovery and privacy boundary

The two Sonic model identifiers are static, bounded, and network-free. Their
presence does not establish account entitlement, live availability, or current
provider health.

Voice discovery is credential-backed and account-scoped. The canonical
normalization boundary retains only stable identity, display name, validated
language metadata, source, and verification time. It discards arbitrary source
fields including ownership, account, preview, description, embedding, and
sensitive trait metadata. Hosted protected Evaluate additionally restricts the
catalog to operator-approved voice identifiers.

Account-scoped voices are not added to the anonymous public provider
projection. Generic Cartesia voice and TTS routes remain intentionally closed;
the existing protected Evaluate workspace is the only retained live-capable
product boundary, and it remains disabled by default.

## Execution and credential policy

`CARTESIA_API_KEY` remains server-only. Credential presence establishes at most
`configured-not-runtime-verified`; it is not execution authority or a health
signal.

Credential-backed operations require exact, non-interchangeable canonical
policy proofs before provider transport:

- voice discovery requires `discovery.voices` authorization;
- batch synthesis requires `tts.batch` authorization; and
- selected-voice validation requires its own `discovery.voices`
  authorization before synthesis.

Model discovery is static and cannot dispatch a provider request. Registration,
fixtures, cached metadata, a runtime flag, UI state, direct adapter access, or a
credential cannot independently authorize live execution. Stage 2 identity,
trust, quota, global/provider budget, concurrency, and kill-switch controls
remain authoritative for any cost-bearing lane.

## TTS contract

The provider-owned adapter preserves the current Cartesia request semantics:

- API version `2026-08-14`;
- model identifiers `sonic-3.5` and `sonic-3`;
- a separate validated voice identifier;
- raw container;
- `pcm_s16le` encoding;
- 24,000 Hz mono comparison output; and
- buffered completion through ONE's batch-TTS result contract.

Text, model, voice, output format, response type, response size, cancellation,
and timeout are bounded before a normalized result is returned. A streamed
upstream body being buffered to completion does not establish a canonical
streaming or realtime capability.

## Fixtures, errors, and evidence

Three deterministic shared-contract fixtures cover model discovery, voice
discovery, and batch TTS with voice selection. They require no credential or
network, carry `synthetic-fixture` provenance, and make no provider performance
or availability claim.

Canonical errors cover validation, configuration, policy denial,
authentication, authorization, quota, rate limiting, upstream failure,
timeout, malformed responses, oversized responses, and unsupported
capabilities. Raw provider bodies, authorization headers, account metadata, and
credential material do not escape the server boundary.

Operation evidence distinguishes static discovery, fixture execution,
pre-dispatch denial, live dispatch, provider response, and normalized upstream
failure. Fixture timing is not reported as Cartesia latency, and a denied
operation does not claim that provider transport occurred.

## Evaluate, Provider Hub, REST, MCP, and benchmarks

Evaluate now reads Cartesia model/voice/output behavior from the adapter's
canonical evaluation profile rather than maintaining a Cartesia-only request
translation branch. Provider Hub, generic provider discovery, REST, MCP, and
Stage 3 benchmark planning consume the same provider projection and stable ID.

Generic live Cartesia voice and TTS routes remain closed. No Cartesia-specific
public REST or MCP schema, provider page, benchmark schema, scoring rule, or
leaderboard exists. Fixture benchmark planning may exercise compatible TTS
contracts, but fixture results remain synthetic, private, benchmark ineligible,
and excluded from public ranking.

## Realtime/session boundary

No Cartesia realtime or session transport exists in the repository's current
implemented surface. This onboarding therefore neither requires nor changes
the provider-neutral realtime/session boundary documented in
[`DEEPGRAM_REALTIME_ARCHITECTURE.md`](DEEPGRAM_REALTIME_ARCHITECTURE.md).
External provider product availability is not an implemented ONE capability.

## Runtime state

- Integration: canonical registration and deterministic fixtures installed.
- Credential readiness: unconfigured by default; configuration is not live
  verification.
- Runtime: disabled unless every existing server-side policy and cost gate
  explicitly permits the protected Evaluate operation.
- Generic voice and TTS invocation: closed.
- Provider/global budgets: disabled by default.
- Public invocation: disabled.
- Public benchmark eligibility: false.
- Public ranking eligibility: false.
- Live verification: not performed.
- Production configuration or infrastructure changed: no.

## Validation

The final credential-free checkpoint validation produced:

- Cartesia/evaluation focused tests: **32 passed** after the final bounded
  allowlist correction;
- provider suite: **152 unit/contract tests passed** and **9 browser tests
  passed**;
- unit suite: **776 passed** with the same **3 unrelated baseline failures**;
- Evaluate: **56 unit tests passed**, plus **4 browser tests passed** and the
  same **1 known Windows download-stream failure**;
- main browser suite: **88 passed, 12 known failures, 6 intentional skips**,
  exactly matching the current canonical baseline;
- typecheck, production build, and secret audit: **passed**; and
- provider requests and provider credits: **zero**.

The browser failures remain the previously attributed Provider Hub title,
Questline state/URL, Deliverables origin, Voice Open configuration, and
Windows/Chromium download-stream cohorts. No Cartesia, provider-contract, or
benchmark regression was introduced.

## Official source inventory

Official Cartesia sources recorded by the canonical catalog were reviewed on
**2026-08-26**. These are provider-documented claims, not ONE live evidence.

- [Sonic Text to Speech models](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest)
- [Voices API](https://docs.cartesia.ai/api-reference/voices/list)
- [Text to Speech bytes API](https://docs.cartesia.ai/api-reference/tts/bytes)

## Deferred Cartesia work

- separately authorized live credential and contract verification;
- live account entitlement, model/voice availability, response-shape, rate
  limit, latency, quality, reliability, pricing, billing, region, and retention
  verification;
- durable private voice discovery caching and freshness behavior;
- production policy, budget, and runtime promotion;
- generic public invocation;
- benchmark and ranking eligibility review; and
- realtime, streaming, session, voice-cloning, and other unimplemented Cartesia
  product families.

The full four-provider architectural assessment is in
[`INITIAL_PROVIDER_CONVERGENCE_ASSESSMENT.md`](INITIAL_PROVIDER_CONVERGENCE_ASSESSMENT.md).

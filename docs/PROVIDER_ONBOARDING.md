# ONE Voice Lab provider onboarding

## Purpose

This checklist is the canonical path for adding a real provider without weakening ONE Voice Lab's provider-neutral architecture. Cataloging, integration, configuration, runtime enablement, health, and benchmark eligibility are independent reviews.

No provider is live merely because its name appears in the catalog or a credential exists.

Use these evidence labels consistently:

- **Provider-documented:** attributable current official material states the behavior; ONE has not necessarily executed it.
- **Fixture-verified:** a provider-specific deterministic fixture adapter passed the shared contract kit without network or credits.
- **Live-verified:** an explicitly authorized, separately flagged live smoke test verified the behavior in a named environment.
- **Benchmark-verified:** controlled runs passed the applicable Stage 3 methodology, comparability, integrity, and evidence review.

These labels are cumulative only when each gate has its own evidence. A synthetic extensibility fixture does not fixture-verify a real provider, and live verification does not automatically create benchmark eligibility.

## Integration checklist

### 1. Catalog and evidence

- [ ] Choose a stable lowercase provider ID (1–80 characters; lowercase letters, digits, and hyphens).
- [ ] Classify the entry as speech provider, local runtime, voice-stack infrastructure, or evaluation system.
- [ ] Assign the appropriate catalog group.
- [ ] Verify the official website and documentation over HTTPS.
- [ ] Record source title, URL, verification date, and verification status.
- [ ] Add only capabilities established by current official documentation.
- [ ] Leave uncertain capabilities `unknown`/`unverified`; do not infer them from marketing copy.
- [ ] Keep infrastructure and evaluation products out of speech-provider rankings.

Primary extension point: `src/lib/providers/catalog.ts` and the schemas in `src/lib/providers/platform-types.ts`.

### 2. Stable integration identity

- [ ] Add the provider to the installed provider identity only when executable integration work begins.
- [ ] Create one manifest with stable ID, safe display metadata, declared integration capabilities, module links, official documentation references, limitations, and server-only credential requirements.
- [ ] Confirm manifest capability records and adapter capability registration agree.
- [ ] Do not create a second registry or provider-specific application.

Primary extension points: `src/lib/providers/types.ts`, `src/lib/providers/registry.ts`, and a provider-owned manifest directory.

### 3. Credential boundary

- [ ] Define the minimum server-only environment variable or secret-manager input.
- [ ] Reject any `NEXT_PUBLIC_` credential declaration.
- [ ] Never return variable names, values, lengths, fragments, or upstream auth bodies to public projections.
- [ ] Document a safe placeholder; do not commit a populated environment file.
- [ ] Treat presence as `configured-not-runtime-verified`, not healthy.
- [ ] Do not add browser BYOK or raw credential editing.

### 4. Capability-specific adapters

- [ ] Implement only applicable interfaces: prerecorded STT, streaming STT, batch TTS, streaming TTS, realtime, model discovery, voice discovery, or health.
- [ ] Keep provider endpoints, authentication headers, wire formats, and response parsing inside the provider module.
- [ ] Validate and bound input before any network call.
- [ ] Normalize output, error codes, timing, provider request IDs where safe, usage units, cancellation, and timeout behavior.
- [ ] Reject unsupported capabilities with a structured error.
- [ ] Prevent arbitrary URL fetching and unbounded response bodies.
- [ ] Require a distinct operation-bound policy proof for every credential-backed sub-operation; validate all proofs before starting parallel work.
- [ ] Record a stable adapter version.

Primary extension points: `src/lib/providers/adapters.ts`, `src/lib/providers/types.ts`, provider-owned adapter/client files, and the existing generic route handlers.

### 5. Deterministic fixtures and contract tests

- [ ] Add deterministic provider response fixtures with no credentials or network.
- [ ] Validate metadata, stable ID, declared capability consistency, adapter version, normalized output, errors, cancellation, timeout, and unsupported behavior.
- [ ] Verify no credential-shaped field reaches the public projection.
- [ ] Exercise model/voice discovery only with fixtures or curated metadata.
- [ ] Prove benchmark compatibility for each proposed benchmark capability.
- [ ] Confirm automated tests make no provider-domain request and consume zero credits.

Use `validateProviderContractCandidate()` and `executeProviderFixtureContract()` from `src/lib/providers/contract-test-kit.ts`. The `future-provider` test proves open provider identity; Cartesia is the first focused real-provider onboarding completed without a new shared abstraction. Neither fixture is live-provider evidence.

### 6. Operational policy and budgets

- [ ] Add a fail-closed operational policy row through a forward migration if the provider ID is new.
- [ ] Start `globally-disabled`, runtime `disabled`, and benchmark `ineligible`.
- [ ] Add capability-level policy only where provider-level policy is too broad.
- [ ] Configure an existing Stage 2 provider/global budget for each cost-bearing operation; do not create a parallel budget system.
- [ ] Confirm quota unit reflects trusted server-derived usage (for STT, normally decoded audio duration rather than compressed bytes).
- [ ] Confirm global and provider kill switches, concurrency, timeout, and bounded fan-out apply.
- [ ] Keep production budgets disabled until a separate operator change.

Primary extension points: a forward Supabase migration, `src/lib/providers/policy-service.ts`, and the existing Stage 2 access/budget policies.

### 7. Private testing promotion

- [ ] Confirm credential configuration in the intended non-production/test environment.
- [ ] Move from fixture-only to private testing only through administrator-authorized, confirmed, revision-checked policy.
- [ ] Verify the capability itself is enabled; provider enablement alone is insufficient when an override exists.
- [ ] Perform optional live smoke tests only under the explicit live-test flag and with separately authorized credentials.
- [ ] Record account entitlement, region, model/voice availability, and adapter version without logging secrets or private payloads.
- [ ] Revert to disabled or budget-paused immediately on unsafe behavior.

### 8. Model and voice discovery

- [ ] Determine whether official discovery endpoints exist and whether results are public or account-scoped.
- [ ] Normalize stable internal and provider identifiers, modality, capability, verified language, status, source, and verification time.
- [ ] Set TTL, maximum stale age, provider count, and entry count.
- [ ] Preserve a last-good stale result on a refresh failure under the documented stale policy.
- [ ] Never expose account-private voices through anonymous REST/MCP.
- [ ] Do not infer gender, ethnicity, or other sensitive traits.

### 9. Benchmark eligibility

- [ ] Pass provider contract tests for the exact capability.
- [ ] Establish valid configuration and administrative enablement.
- [ ] Match a Stage 3 methodology, modality, suite, codec/transport, region/deployment, sample, and freshness policy.
- [ ] Preserve provider and model metadata snapshots in every run.
- [ ] Keep fixture-only, private, failed-integrity, and insufficient-sample results out of public rank.
- [ ] Promote benchmark status explicitly; runtime enablement does not imply benchmark eligibility.
- [ ] Leave publication and integrity decisions to Stage 3.

### 10. Human and machine surfaces

- [ ] Confirm the Provider Hub explains each lifecycle dimension and unavailable state.
- [ ] Confirm selectors filter by capability declarations rather than provider-name branches.
- [ ] Confirm public REST and MCP use the shared actions and projection.
- [ ] Confirm no public administrative or paid MCP tool exists.
- [ ] Verify mobile, keyboard, screen-reader, reduced-motion, PWA, and touch behavior.
- [ ] Update the catalog and platform docs with exact implemented status and limitations.

## Definition of done

A provider is integrated only when:

1. its stable identity and official metadata are attributable;
2. applicable capability-specific adapters are installed;
3. deterministic fixtures pass the shared contract kit;
4. inputs, outputs, timing, cancellation, timeout, and errors are normalized;
5. credentials remain server-only;
6. model/voice discovery is normalized and bounded where supported;
7. Stage 2 trust, quota, budget, concurrency, and kill switches protect every cost-bearing path;
8. administrative and capability policy is fail-closed and audited;
9. benchmark eligibility is independently validated through Stage 3;
10. public REST/MCP/UI expose the same canonical safe projection;
11. zero-credit automated tests and local database tests pass; and
12. documentation distinguishes implemented, fixture-tested, configured, live-verified, and deferred behavior.

Public use and public ranking are later explicit promotions, not part of basic adapter completion.

## Rollback and disablement

Rollback should be reversible and preserve evidence:

1. set the affected capability or provider access to `globally-disabled` or `budget-paused` through the administrator boundary;
2. set runtime state to the matching fail-closed state;
3. use existing Stage 2 provider/global budget and kill switches for immediate cost containment;
4. invalidate or let bounded discovery metadata become stale; do not replace it with an empty success;
5. retain sanitized bounded audit evidence for investigation;
6. preserve historical Stage 3 provider/model snapshots and published results;
7. mark current benchmark eligibility ineligible without rewriting historical rank snapshots;
8. remove adapter registration in a focused code change only after runtime is safely disabled; and
9. remove credentials from the deployment secret manager separately, without committing or logging them.

Do not delete historical benchmark evidence merely because a provider is disabled today.

## Reson8 readiness assessment

This is the first fixture-first real-vendor onboarding assessment. It installs deterministic normalization adapters and fixtures, plus isolated server-only transports used for separately approved private contract checks. No credential value, application live adapter, budget enablement, runtime enablement, public invocation, or benchmark eligibility exists.

| Item | Assessment |
| --- | --- |
| Stable provider ID | `reson8` (already cataloged) |
| Current lifecycle | Cataloged; fixture validated; private live-contract verified; globally disabled; runtime disabled; benchmark ineligible |
| Evidence state | Provider-documented: yes, official sources reviewed 2026-08-28. Fixture-verified: yes. Private live-contract verified: prerecorded, Realtime, and Turns once each after applicable remediations. Production-verified: no. Benchmark-verified: no. |
| Provider-documented targets | Prerecorded STT, realtime STT, interim/final transcripts, language handling, word timing and confidence, prerecorded/realtime diarization, phrase bias/custom phrase collections, structured-token patterns, Turns start/candidate/end events, and hosted deployment |
| Required adapters | Separate `prerecorded-stt`, `streaming-stt`, and `turn-aware-stt` fixture adapters are installed. Isolated server-only verification transports preserve these boundaries but are not registered with the application, REST, MCP, or benchmark executor. |
| Server authentication | Official docs specify `Authorization: ApiKey ...` for direct server connections. The server-only `RESON8_API_KEY` input is declared without a value, browser exposure, or live validation. |
| Browser authentication | Official docs describe 600-second bearer tokens and WebSocket subprotocol use. ONE must not implement token issuance until audience, replay, revocation, concurrency, session binding, scope/write permission, abuse, and spend semantics are authoritatively established. |
| Model discovery | Official docs expose authenticated organization custom-model listing. A custom model is a phrase collection, not a documented base-model selector. Results are account-scoped; any future cache must be private by default and must not leak names through public REST/MCP. No public base-model catalog is assumed. |
| Benchmark categories | Private fixture planning is supported for compatible STT methodology categories; real accuracy/latency/reliability and realtime-turn evidence require comparable live transport, region, codec, model identity, sample, and methodology review |
| Admission unit | Use ONE's trusted server-decoded audio duration. Provider-published credit conversion is time-sensitive and billing rounding is undocumented, so do not publish a cost estimate or enable a production budget until versioned pricing metadata is reviewed. |
| Transport recommendation | Use direct server-side HTTPS for bounded prerecorded uploads, a direct server-side WebSocket adapter for realtime transcripts, and a separate server-side WebSocket adapter for Turns. Keep LiveKit optional and outside the canonical provider adapter. |
| Streaming concerns | Interim/final, flush, turn-candidate/final, close classification, timeout, cancellation, chunk/buffer/session bounds, and backpressure are fixture-tested. One bounded private Realtime and Turns contract session passed with zero retries. Reconnect behavior, reliability, scale, billing, and production concurrency remain unverified. |
| Open questions | Account entitlement, hard file/session limits, accepted sample-rate range, regional routing, exact model/version observability, active-agreement transcript retention, rate/concurrency values, request/usage IDs, health endpoint, billing rounding, and bearer-token semantics |

The fixture-first implementation touches only:

- `src/lib/providers/catalog.ts` to update verified sources/capability scope;
- `src/lib/providers/platform-types.ts` for the narrowly required generic capability/adapter vocabulary;
- `src/lib/providers/adapters.ts` for server-only credential and fixture-adapter registration;
- `src/lib/providers/streaming-stt.ts` and `src/lib/providers/turn-aware-stt.ts` for bounded provider-neutral event contracts;
- `src/lib/providers/reson8/` for provider-owned wire parsing and fixtures;
- shared provider contract, discovery, policy, UI, and transport tests; and
- the existing Stage 3 benchmark planner for explicitly injected fixture capability projections.

No migration was necessary because the existing `reson8` operational row and default-deny policy already keep the provider globally disabled and benchmark ineligible. A future live task should update existing policy and Stage 2 budget configuration rather than create another policy system.

It should not require changes to benchmark schemas, leaderboard calculations, trust tiers, public REST/MCP schemas, or unrelated UI.

The exact activation order is:

1. preserve the fixture-validated, fail-closed operational state;
2. resolve contractual, token, model-identity, limit, and billing questions;
3. preserve the privately contract-verified server-only transports outside application registration;
4. configure disabled Stage 2 duration-based budgets and capability policy before any future application transport;
5. require separate authorization for any further private live check or production-oriented verification;
6. perform an independent Stage 3 comparability and benchmark-eligibility review; and
7. consider public ranking only through the separate Stage 3 publication policy.

The complete gate-by-gate checklist and rollback notes are in `docs/providers/RESON8.md`.

Official sources reviewed on 2026-08-28:

- https://docs.reson8.dev/
- https://docs.reson8.dev/choosing-an-endpoint/
- https://docs.reson8.dev/authentication/
- https://docs.reson8.dev/api/auth/token/
- https://docs.reson8.dev/api/speech-to-text/prerecorded/
- https://docs.reson8.dev/api/speech-to-text/realtime/
- https://docs.reson8.dev/api/speech-to-text/turns/
- https://docs.reson8.dev/speech-to-text/features/audio-formats/
- https://docs.reson8.dev/speech-to-text/features/languages/
- https://docs.reson8.dev/speech-to-text/features/diarization/
- https://docs.reson8.dev/speech-to-text/features/custom-models/
- https://docs.reson8.dev/api/custom-model/list/
- https://docs.reson8.dev/limits/
- https://docs.reson8.dev/security-compliance/
- https://docs.reson8.dev/integrations/livekit/
- https://docs.reson8.dev/versioning/
- https://www.reson8.dev/
- https://www.reson8.dev/terms
- https://www.reson8.dev/privacy-policy

## Explicitly deferred

- Reson8 application live-adapter registration, production credential provisioning, runtime promotion, reliability/performance verification, and benchmark verification;
- integrating the remaining provider catalog;
- hosted temporary-token issuance for any provider without verified semantics;
- a provider plugin package/generator;
- public administrative REST/MCP tools;
- paid agent invocation;
- DeepEval implementation;
- reputation/portable trust, provider marketplace mechanics, Stage 9 visuals, and blockchain.

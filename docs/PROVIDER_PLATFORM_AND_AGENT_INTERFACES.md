# ONE Voice Lab provider platform and agent interfaces

## 1. Product purpose

Stage 4 makes provider extensibility an explicit platform property. Humans and authorized machine clients can inspect the same provider, capability, readiness, and benchmark evidence without each transport inventing provider-specific rules.

The acceptance test is deliberately simple: adding provider N+1 should require new provider metadata, applicable server adapters, fixtures, contract tests, administrative policy, budgets, and benchmark eligibility review—not changes to benchmark schemas, trust tiers, REST or MCP shapes, or unrelated UI.

This stage does not make catalog membership executable. It does not enable new paid providers, browser credentials, public administration, arbitrary provider invocation, or unrestricted paid agent actions.

## 2. Architecture overview

The provider path has four layers:

1. `src/lib/providers/catalog.ts` owns curated discovery membership and attributable metadata.
2. `src/lib/providers/registry.ts` and the capability-specific adapter registrations own installed integration truth.
3. `private.provider_runtime_policies` and `private.provider_capability_policies` own mutable operational restrictions.
4. `projectProviderPlatform()` creates the safe canonical projection consumed by public provider records, shared actions, REST, MCP, and the Provider Hub.

The credentialed execution path remains:

```text
validated input
  -> global live-operation kill switch
  -> provider/capability operational policy (fail closed)
  -> server identity and trust
  -> Stage 2 quota and provider-budget admission
  -> concurrency lease
  -> installed adapter
  -> normalized result/error
  -> bounded audit and observability
```

The Stage 3 benchmark engine remains the canonical owner of measurements, judgments, comparability, ranking, publication, and integrity. Provider-platform state supplies current eligibility inputs; it does not rewrite historical evidence.

## 3. Canonical source-of-truth split

### Code-owned integration truth

Code owns:

- stable installed `ProviderId` values;
- provider manifests and adapter registration;
- capability and adapter interfaces;
- server-only credential-variable declarations;
- safe catalog defaults and metadata sources;
- normalized platform schemas; and
- deterministic contract fixtures.

### Database-owned operational truth

The forward migration `20260828022032_provider_platform_operational_state.sql` owns:

- discovery workflow status;
- provider and capability access mode;
- runtime, health, and benchmark status;
- conflict-safe administrative revisions;
- bounded user presentation preferences; and
- administrator change audit through the existing Stage 2 audit lifecycle.

### Precedence

The intersection is fail-closed:

- A database row cannot manufacture catalog membership, installed code, an adapter, a capability, or a credential.
- Code support does not override a database disable, budget pause, capability restriction, trust requirement, Stage 2 budget, or global kill switch.
- Environment-variable presence can establish only `configured-not-runtime-verified`; it cannot establish health or entitlement.
- A provider becomes live-enabled only when installed code, server configuration, code allowlisting, operational policy/runtime/health, the global live switch, and at least one enabled Stage 2 provider-budget admission path all permit it.
- Provider- and capability-level access and benchmark policy are intersected most-restrictively; a capability row can narrow but never promote provider-wide policy.
- Missing or invalid operational state defaults to disabled for production invocation.
- User preferences affect presentation only and never outrank administrative policy.
- Historical benchmark records keep their captured provider/model snapshots even if current metadata or policy changes.

This is one provider architecture with separate ownership domains, not two competing registries.

## 4. Provider model

`platform-types.ts` defines strict versioned projections for:

- stable catalog ID and display metadata;
- entity kind and catalog group;
- official links and metadata provenance;
- discovery, integration, runtime, and benchmark lifecycle;
- credential readiness, health, and readiness explanation;
- normalized capability declarations;
- installed/fixture integration state;
- normalized model and voice records; and
- metadata verification and freshness.

Provider IDs are bounded lowercase slugs. The installed `ProviderId` union stays narrower than the open catalog ID schema, allowing a new fixture provider to prove extensibility without pretending it is installed.

Provider-documented support, integration-supported support, ONE-verified support, and benchmarked support remain distinct. Marketing or provider documentation is not measured benchmark evidence.

## 5. Provider lifecycle

Lifecycle dimensions are independent:

| Dimension | States |
| --- | --- |
| Discovery | `cataloged`, `outreach-planned`, `credentials-requested`, `credentials-received` |
| Integration | `adapter-missing`, `adapter-in-progress`, `fixture-validated`, `contract-tests-passed`, `configured` |
| Runtime | `enabled`, `disabled`, `budget-paused`, `degraded`, `unavailable`, `deprecated` |
| Benchmark | `ineligible`, `fixture-only`, `private-testing`, `benchmark-eligible`, `publicly-ranked` |
| Administrative access | `globally-disabled`, `fixture-only`, `private-testing`, `trusted-user-access`, `public-use`, `budget-paused` |

Credentials received therefore does not mean configured, enabled, healthy, benchmark eligible, or publicly ranked. Database checks reject contradictory `public-use`/disabled and budget-pause transitions. Compare-and-swap revisions prevent concurrent administrator overwrites.

## 6. Capability model

Capabilities are declarative and queryable across these families:

- discovery;
- speech-to-text;
- text-to-speech;
- realtime voice;
- audio intelligence; and
- deployment.

Each declaration carries support status, verification class, attributable sources, provider/model scope when available, last verification date, required adapter kind, integration path, cost-bearing status, and benchmark eligibility.

The capability vocabulary can describe features such as prerecorded/streaming STT, partial/final transcripts, timestamps, diarization, language handling, batch/streaming TTS, realtime turn behavior, audio-intelligence features, and deployment class. Vocabulary membership is not enablement. A provider implements only declared, evidenced capabilities with an applicable installed adapter.

## 7. Adapter contracts

The repository already uses capability-specific contracts:

- `ProviderTtsAdapter` for normalized TTS execution, timing, cancellation/timeout context, optional health, and optional attributable cost estimation;
- `ProviderSttAdapter` for validated prerecorded STT;
- `ProviderCatalogAdapter` for provider-scoped model and voice discovery; and
- `ProviderFixtureAdapter` for deterministic contract testing.

Provider-specific endpoints, headers, wire payloads, and response parsing stay inside provider modules. Generic routes resolve an installed adapter and receive normalized values or normalized errors. Deepgram static model/voice discovery, prerecorded STT, and batch TTS now use these canonical contracts. Its project/account management and realtime/session families remain compatibility or deferred surfaces rather than being mislabeled as batch adapters.

Streaming STT, streaming TTS, and realtime contracts are represented in the normalized capability vocabulary but are not all implemented as executable generic adapters in this stage.

## 8. Contract-test kit

`contract-test-kit.ts` verifies candidate metadata and fixture adapters without network access. It checks:

- unique stable identity;
- adapter/provider identity;
- declared capability consistency;
- non-empty adapter version;
- one adapter per capability;
- benchmark capability backed by a fixture adapter;
- absence of credential-shaped public fields;
- normalized fixture results;
- timeout and cancellation; and
- sanitized failure behavior.

`tests/unit/provider-platform.spec.ts` supplies a synthetic `future-provider` outside the installed provider enum, with a normalized model, voice, and fixture-only TTS adapter. The contract candidate, benchmark-planning projection, Provider Hub data contract, and the shared action executor under both REST and MCP sources accept it without changes to the benchmark model, transport schemas, or current provider registry. It is explicitly a test fixture, not a vendor. Reson8 separately proves real-vendor onboarding through provider-owned deterministic STT fixtures while remaining disabled and benchmark ineligible.

Deepgram applies the same contract kit to four deterministic fixtures: static model discovery, static voice discovery, prerecorded STT, and batch TTS. Exact-operation policy tests prove that credential presence, registration, fixture availability, direct adapter access, or authorization for another capability cannot dispatch its core provider transport. These tests make no live-provider or performance claim.

## 9. Provider Hub

The Provider Hub extends the existing `/providers` route and provider profile routes. Its data comes from the canonical public projection, not direct environment inspection or provider calls.

Safe views may show:

- catalog group and entity kind;
- discovery, integration, runtime, and benchmark status;
- credential readiness without the credential name or value;
- health source and timestamp;
- verified capability declarations and provenance;
- normalized public-safe models and voices;
- metadata verification and freshness; and
- official website/documentation links curated in code.

Catalog-only providers are expected states, not broken cards. Public views explain that discovery, integration, credential readiness, runtime policy, health, and benchmark status are different facts. The Hub renders the six catalog groups as progressive disclosures, uses responsive cards rather than a wide status table, and preserves minimum touch targets, keyboard focus, screen-reader labels, and non-color status text.

The safe projection, `/providers` Hub, provider profile routes, and user preference controls are implemented. A polished operator semantic control remains partial; current administration uses the guarded server API rather than a public or broadly accessible control surface.

## 10. Administrator enablement

Mutable policy is private and server-authoritative. Guarded RPCs support:

- administrator-only policy reads;
- provider-level lifecycle/access updates;
- capability-level access/benchmark overrides;
- explicit expected revisions;
- invalid-transition rejection; and
- bounded audit events in the existing Stage 2 store.

The server policy service requires both an active `admin` trust profile and `LAB_USAGE_GUARD_TOKEN`. `GET` and `PATCH /api/admin/providers` add a same-site browser-signal check, an 8 KiB body limit, typed confirmed update envelopes, sanitized errors, no-store responses, and conflict-aware status codes. Consequential updates therefore require an explicit `confirmed: true` input and the current revision. No anonymous REST or MCP administration exists. Credential editing is not part of the system.

Database enforcement and the guarded administrator REST boundary are implemented. A polished semantic control administration UI is intentionally not claimed by this document unless present in the current application diff and validation report.

## 11. User preferences

The existing `public.user_preferences` row gains:

- favorite and hidden providers;
- preferred provider order;
- default STT and TTS providers;
- a comparison set capped at four providers; and
- preferred deployment class.

Database validation bounds arrays, rejects duplicates and unknown catalog IDs, prevents the same provider being favorite and hidden, protects ownership with existing RLS, and increments a server-owned revision. The server preference service adds compare-and-swap writes against that revision. These fields are presentation preferences only. They cannot enable a provider, create a capability, change trust, bypass quota/concurrency/budgets, or affect public rank.

`GET` and `PUT /api/providers/preferences` provide a private no-store, same-site, 8 KiB-bounded application boundary. Writes require an authenticated user, a browser request signal, canonical provider IDs, and the expected revision; conflicts return a structured `409`. Guest reads return an explicit guest mode with no synced preference row. The Provider Hub supplies controls for favorites, hiding, order, default STT/TTS, a comparison set, and deployment class. Guest choices use a bounded validated local-storage record; authenticated choices sync through the owner-RLS row. Neither mode can enable or invoke a provider.

## 12. Credential readiness

Safe readiness values are `not-required`, `unconfigured`, `configured-not-runtime-verified`, `invalid`, `unknown`, and `environment-restricted`.

Only server code reads provider environment variables. Public projections expose a boolean requirement and safe readiness class—not variable names, values, lengths, fragments, or secret-manager paths. Presence is not a live authentication check and is never called healthy. No paid credential check is performed automatically.

## 13. Health and readiness

Health is separate from readiness and benchmark performance. The model supports configured, unconfigured, healthy, degraded, unavailable, disabled, budget-paused, and unknown.

Health may come from operational policy, local configuration, or an explicit not-observed state. A failed discovery refresh does not prove global provider failure and does not modify benchmark rank. Readiness never reports `live-enabled` while runtime is disabled/unavailable, the global live switch is off, or Stage 2 cost admission is disabled. No continuous paid health polling is introduced.

Current durable health is a single bounded state per provider. A historical health timeline is not implemented.

## 14. Model and voice discovery

Normalized model records carry provider/internal/provider IDs, modality, capabilities, verified languages, availability, source, and verification time. Normalized voice records carry provider/internal/provider IDs, compatible model references, verified languages, availability, source, and verification time. Subjective or sensitive traits are not inferred.

`ProviderDiscoveryCache` provides a bounded process-local cache with:

- configured fresh and maximum-stale windows;
- provider and per-provider entry bounds;
- deterministic ordering and reference uniqueness;
- last successful/failed refresh timestamps;
- last-good stale fallback;
- automatic maximum-stale expiry on reads plus explicit invalidation and pruning; and
- sanitized failure codes instead of upstream bodies.

Public REST/MCP reads use curated or supplied cache-backed projection data and do not trigger live discovery. Account-scoped voice catalogs are not anonymously exposed. A durable distributed discovery cache and controlled refresh scheduler are deferred.

## 15. Provider catalog

`PROVIDER_CATALOG` contains curated identities across speech providers, local runtimes, voice-stack infrastructure, and evaluation interoperability. Catalog-only entries default to no capability declarations, no sources, disabled runtime, and benchmark ineligibility until evidence is verified.

Speech-model providers are separated from orchestration/infrastructure vendors and evaluation systems so adjacent products are not ranked as though they were comparable speech models. See `docs/PROVIDER_CATALOG.md`.

Reson8 is the first documented fixture-first real-vendor onboarding case. Its official STT surface was reviewed on 2026-08-28, and its prerecorded, streaming-event, and turn-aware normalization adapters pass deterministic fixtures through the shared contract kit. Separately approved private checks then established one bounded live contract pass for prerecorded, Realtime, and Turns STT after applicable remediations. The isolated manual-only server verifier is not registered with the application, REST, MCP, or benchmark engine. No credential value, runtime enablement, production verification, benchmark verification, or public eligibility was added. The canonical assessment and activation gates are in `docs/providers/RESON8.md`; provider documentation, fixture validation, and private contract evidence cannot promote operational or benchmark state.

Deepgram's core convergence uses the same source-of-truth split: stable code-owned registration and adapters, mutable fail-closed policy, and one safe platform projection. Public discovery is a bounded dated static catalog and makes no upstream request. Project/account-private discovery, streaming STT, Flux, streaming TTS, Voice Agent sessions, and hosted temporary-token issuance remain outside the canonical request-response surface. See `docs/providers/DEEPGRAM.md` and `docs/providers/DEEPGRAM_REALTIME_ARCHITECTURE.md`.

## 16. Benchmark integration

Stage 3 remains canonical. Current provider/capability state can qualify or exclude a new run, but it cannot mutate an existing provider/model/configuration snapshot. Benchmark eligibility requires installed support, applicable capability policy, explicit benchmark status, methodology compatibility, Stage 2 admission, and Stage 3 publication/integrity rules.

The synthetic provider contract proves the benchmark domain accepts a future stable provider ID without schema changes. Catalog metadata and provider health remain evidence about current integration state, not performance measurements.

## 17. REST architecture

Implemented public read routes use `executePublicServerAction()` and the same Zod-backed action inputs/outputs as MCP:

- `GET /api/public/v1/providers`
- `GET /api/public/v1/providers/{provider}`
- `GET /api/public/v1/providers/{provider}/capabilities`
- `GET /api/public/v1/providers/{provider}/models`
- `GET /api/public/v1/providers/{provider}/voices`
- `GET /api/public/v1/providers/{provider}/health`
- `GET /api/public/v1/methodologies`
- `GET /api/public/v1/methodologies/{methodology}?version=...`
- `GET /api/public/v1/leaderboards`
- `GET /api/public/v1/leaderboards/fixture`
- `POST /api/public/v1/benchmarks/verify`

Provider listing accepts a bounded page size, stable provider-ID cursor, catalog group, entity kind, and normalized capability filter. Legacy public evaluation/methodology routes remain compatible. Reads are schema-versioned, sanitized, cache-controlled, bounded, and protected by a process-local short-burst guard. Deployment WAF/rate limiting remains required for durable multi-instance protection. There is no public administrative endpoint or paid provider proxy in this API.

The separate `GET`/`PATCH /api/admin/providers` route is private, no-store, same-site, explicitly confirmed, and guarded by active administrator trust plus the server guard. It is not part of the public API contract.

The separate `GET`/`PUT /api/providers/preferences` route is a private user endpoint, not a public provider-discovery API. It applies authentication, owner RLS, bounded input, and revision conflicts to synchronized presentation preferences.

A separate REST recommendation endpoint is not implemented; deterministic evidence should not be wrapped in an LLM merely for presentation.

## 18. MCP architecture

The existing `/mcp` server is extended rather than duplicated. Its read-oriented tools are:

- `voice_lab.list_providers`
- `voice_lab.get_provider`
- `voice_lab.list_provider_capabilities`
- `voice_lab.list_provider_models`
- `voice_lab.list_provider_voices`
- `voice_lab.get_provider_health`
- `voice_lab.list_evals`
- `voice_lab.get_eval`
- `voice_lab.get_methodology`
- `voice_lab.compare_providers`
- `voice_lab.run_synthetic_eval`
- `voice_lab.list_benchmark_methodologies`
- `voice_lab.get_benchmark_methodology`
- `voice_lab.list_leaderboards`
- `voice_lab.get_fixture_leaderboard`
- `voice_lab.verify_benchmark_result`

Each tool uses action-registry schemas and `executePublicServerAction()`. MCP-specific provider or benchmark models do not exist. The server exposes no administrator, credential, budget, kill-switch, arbitrary invocation, or paid fan-out tool.

## 19. Agent-response design

Machine responses use stable IDs, versioned structures, source and verification metadata, freshness, limitations, comparability/exclusion reasons, and Stage 3 evidence identifiers where applicable.

Clients must preserve these distinctions:

- verified repository/integration fact;
- provider-documented claim;
- directly observed measurement;
- deterministic calculation;
- human judgment;
- automated judgment; and
- external-framework judgment.

Provider comparison returns registry evidence and explicitly states that it is not a quality ranking. Synthetic leaderboard output is labeled synthetic/private and makes no provider-performance claim. A future recommendation service must disclose its constraints, evidence, method, freshness, confidence, and limitations.

## 20. Authentication, quotas, and budgets

Read-only public interfaces allow legitimate humans and automation but apply bounded burst protection and visibility rules. A caller-supplied `source=agent` label is never identity.

Existing paid routes retain Stage 2 same-site, identity, trust, quota, durable provider budget, global switch, and concurrency controls. Stage 4 resolves effective provider/capability policy centrally for every catalog provider declared in a Lab access context, before quota or budget reservation. Its trust requirement is then folded into Stage 2 admission, so operational policy can only narrow access. Generic adapters, Evaluate, and Deepgram core compatibility routes therefore share the same fail-closed operational gate.

Generic and legacy upload STT routes perform a non-reserving same-site/global/provider-policy precheck before buffering media. When policy requires authenticated trust, the hosted precheck reads the server-derived trust state without reserving usage. Authoritative admission still occurs only after server-side media inspection establishes the trusted duration unit, so forged client duration metadata remains irrelevant and quota is not double-reserved.

Paid agent invocation is intentionally deferred. There is no new service-principal or long-lived API-key issuance system and no MCP paid inference tool.

## 21. Security and privacy

The Stage 4 boundary provides:

- server-only credentials and provider SDK calls;
- strict provider/capability ID validation;
- curated HTTPS documentation links;
- no arbitrary provider registration or executable plugin upload;
- no arbitrary remote JavaScript, CSS, HTML, SDK, icon, or provider URL loading;
- sanitized errors and bounded response/input schemas;
- no raw upstream error/authentication body persistence;
- no anonymous account-scoped voice discovery;
- no provider SSRF or arbitrary URL STT;
- fail-closed production policy resolution;
- early upload-policy and trust preflight without media buffering or quota reservation;
- a server guard on public operational-state reads as well as invocation/admin RPCs, preventing direct Data API callers from bypassing the application read guard;
- admin authorization plus server guard and revision checks;
- owner RLS and database validation for preferences;
- bounded public-read and paid-route controls; and
- no changes to provider credentials or production infrastructure.

Public metadata contains no provider credential values, environment-variable names, private benchmark material, private account IDs, or private audio/transcripts. Service-worker caches must not include authenticated provider responses or sensitive discovery data.

## 22. Persistence and retention

Stage 4 intentionally keeps durable growth small:

- provider runtime policy is one row per curated provider;
- capability policy is one row per provider/capability pair;
- user provider preferences live in one existing row per user with bounded arrays;
- administrator changes reuse Stage 2's bounded, deduplicated audit lifecycle;
- discovery metadata uses a bounded process-local cache rather than an unbounded table; and
- no health-history, polling, duplicate cron, credential, raw provider response, or provider-request table is added.

Policy rows are current state and intentionally durable. Their cardinality is bounded by the curated catalog and exact normalized capability vocabulary; compare-and-swap updates replace state rather than append history. Audit retention and cleanup remain owned by Stage 2. The in-memory discovery cache caps providers and per-provider entries and expires data once its maximum-stale boundary is exceeded.

If durable discovery or health history is introduced later, it requires forward migrations, TTL/retention classes, bounded cleanup batches, RLS/grants, and last-good stale policy before activation.

## 23. Testing strategy

Stage 4 coverage includes or is designed to include:

- catalog uniqueness, kind separation, and claim-free unverified entries;
- deterministic canonical projections and secret exclusion;
- operational state unable to manufacture an adapter;
- synthetic provider N+1 projection and fixture execution;
- discovery cache bounds, stale fallback, failure sanitization, and pruning;
- contract validation, timeout, cancellation, invalid output, and normalized errors;
- public-read burst behavior;
- provider/capability policy authorization, invalid transitions, and revision races;
- user preference bounds, ownership, and non-escalation;
- private-schema grants and safe `SECURITY DEFINER` search paths;
- Stage 3 benchmark compatibility and historical snapshot stability;
- capability-level benchmark-policy exclusion before Stage 3 live planning;
- public readiness projected from actual adapter registration rather than legacy manifest claims;
- shared REST/MCP action schemas and no administrative/paid MCP tools; and
- fixture-only UI/E2E with no provider-domain requests.

The clean local Supabase replay applied all 13 forward migrations. Five pgTAP files passed 369 assertions; all seven deterministic concurrency families passed. Database lint reported only the previously documented Stage 2 shadowed/unused-variable warnings, with no Stage 4 schema warning.

Final repository validation passed lint with the three established warnings, typecheck, the production build, and the secret audit across 673 files. The full unit suite passed 668 of 670 tests; the two failures are the established `solution-deliverables` `deduplicatedItemCount` baseline failures and are unrelated to provider-platform code. Provider Hub E2E passed 5 of 5 tests, benchmark E2E passed 2 of 2 tests, the agent-discovery rail passed 2 of 2 tests after a transient rerun, and the Voice Open unit suite passed 13 of 13 tests. The Voice Open/Evaluate E2E run passed 12 of 13 tests: the remaining export round-trip case reached a complete browser `blob:` download but Playwright 1.61 with Chromium 149 on Windows could not read the locked download artifact (`EPERM`). No application workaround was retained because the failure is isolated to browser-test artifact handling and the export implementation was unchanged.

All automated tests use mocks, fixtures, and the local disposable Supabase stack. They must consume zero provider credits.

## 24. Known limitations

- The catalog is broad; only the four installed providers and the narrowly reviewed Reson8 entry have attributable metadata in this stage.
- Reson8 has fixture-validated prerecorded, streaming-event, and turn-aware STT normalization plus private live-contract verification for each capability. It still has no application live adapter, production verification, reliability/performance benchmark, or benchmark eligibility. Its public v1 contracts do not expose a stable selectable base-model/version identifier, and bearer-token replay/scope semantics remain unresolved.
- Most catalog entries intentionally have no claimed capabilities or sources.
- Deepgram core request-response discovery, STT, and TTS are canonical; project/account management and realtime/session surfaces remain compatibility or deferred paths.
- The generic executable adapter set does not yet cover every normalized streaming/realtime capability.
- Public model/voice data is empty unless curated/cache-backed metadata is supplied; public reads never trigger live discovery.
- Model and voice reads are bounded but not yet independently cursor-paginated; connecting a durable discovery source should add per-resource cursors before larger catalogs are published.
- Health is a current declared/configuration state, not continuous authoritative provider monitoring.
- Provider-level cost-admission readiness currently reports whether any applicable Stage 2 provider budget is enabled; operation-specific readiness remains authoritative only at invocation time.
- The read guard is per process and requires deployment WAF protection for durable distributed limits.
- Production application of the Stage 4 migration and operator policy configuration are deployment gates.
- Paid machine-to-machine invocation has no approved principal/credential boundary and stays disabled.

## 25. Deferred work

- Reson8 application live-adapter registration, production credential provisioning, runtime enablement, browser-token issuance, reliability/performance verification, and benchmark verification; see `docs/providers/RESON8.md` for the ordered gates;
- Deepgram live STT/TTS verification, account-private discovery convergence, and the provider-neutral realtime/session architecture required before hosted temporary-token issuance;
- Cartesia live account verification, private discovery-cache policy, runtime/budget promotion, and any separately designed realtime/session support; its core request-response onboarding is complete without a new shared abstraction;
- integrating every provider catalog entry;
- a durable distributed discovery/health cache and controlled refresh scheduler;
- paid agent or broad programmatic invocation;
- public provider administration through REST or MCP;
- raw browser credential editing or client-side BYOK;
- DeepEval implementation or broader application-evaluation frameworks;
- provider-sponsored marketplace mechanics;
- full reputation and portable trust (Stage 6);
- GPU/Lab Aura visuals (Stage 9); and
- blockchain unless a later architecture decision establishes a concrete need.

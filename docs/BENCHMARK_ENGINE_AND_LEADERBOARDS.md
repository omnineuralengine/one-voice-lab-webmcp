# ONE Voice Lab benchmark engine and leaderboards

## 1. Product purpose

Stage 3 adds ONE Voice Lab's canonical, provider-neutral benchmark domain. It answers a bounded question: for a disclosed use case, input, configuration, environment, and time window, what current evidence supports choosing one provider/model configuration over another?

The benchmark engine does not declare a universally best provider. It preserves raw observations, separates evidence classes, rejects materially incomparable populations, and explains every metric-specific rank.

The existing Evaluate workspace remains the TTS execution surface. Its `EvaluationEvidenceBundle` is the atomic observation that the benchmark layer can validate and aggregate; Stage 3 does not create another paid provider executor.

## 2. Existing architecture reused

Stage 3 extends, rather than replaces:

- the canonical provider registry and capability declarations;
- the existing capability-specific provider adapters;
- the Stage 1 action contracts and structured action results;
- the Evaluate request validator, bounded orchestrator, cancellation, timeout, and partial-result behavior;
- the Stage 2 server-side identity, trust, quota, provider-budget, concurrency-lease, and bounded-audit boundary;
- the versioned `EvaluationEvidenceBundle`, measured metric provenance, human-rating state, and sanitized export contract;
- the private Supabase schema, explicit grants, RLS defense in depth, and existing bounded maintenance schedule; and
- the current ONE design system, mobile navigation, PWA shell, keyboard behavior, and accessibility patterns.

`src/lib/public-evidence` remains a legacy public discovery/fixture projection. It is not the canonical benchmark record and is not silently promoted into leaderboard evidence.

## 3. Canonical benchmark entities

The TypeScript contracts in `src/lib/evaluation/benchmark-schema.ts` define stable, strict JSON for:

- `BenchmarkMethodology`: a versioned objective, procedure, required input/configuration/environment, inclusion and exclusion policy, outlier policy, minimum samples, publication policy, and limitations;
- `BenchmarkSuite`: a versioned collection of cases with locale/domain, dataset license and provenance, input hashes, privacy, lifecycle, and methodology reference;
- `BenchmarkCase`: one reproducible text, audio, event-stream, or controlled fixture reference with a suite/version reference and integrity hash;
- `BenchmarkRun`: one attempted execution with provider/model/configuration snapshots, standardized or provider-optimized evaluation mode, environment, transport, codec, timestamps, status, principal/trust context, and an optional typed source observation;
- `BenchmarkMeasurement`: directly observed or deterministically derived numeric evidence with unit, method/version, measurement point, clock, availability, sample count, and provenance;
- `BenchmarkJudgment`: human and automated judgments with explicit class and evaluator/rubric provenance;
- `BenchmarkArtifactReference`: bounded supporting references carrying content hash, ownership, visibility, retention, and publication policy;
- `BenchmarkResult`: one validated run plus its separated evidence, artifacts, eligibility, visibility, retention, integrity, and limitations;
- `BenchmarkScoringProfile`: one versioned metric/statistic/direction profile with an exact source, measurement point, clock, observation class, method, and source-schema scope and no implicit composite;
- `BenchmarkRankingCandidate`: one exact provider/model/voice/configuration lane whose measurements are linked back to non-empty result/run source records;
- `BenchmarkLeaderboardSnapshot`: a reproducible population, filters, time window, eligibility policy, entries, lane-specific source inclusions/exclusions, integrity, signature state, and limitations; and
- `BenchmarkPlan`: a bounded fixture or live plan whose attempt count is validated before execution.

The corresponding Supabase migration stores normalized private methodologies, suites, cases, runs, provider outputs, measurements, judgments, artifact references, leaderboard snapshots/entries, and signatures. Browser roles cannot write those tables directly. Publication recomputes every digest whose canonical source is stored: methodology definition, exact text input, provider configuration, disclosed filters, metric scope, scenario scope, population, and the final public payload. Suite manifests, non-text inputs, run bundles, and audio/output bytes retain explicit verification records because their canonical source bytes are intentionally not stored; the system does not pretend to recompute absent material.

## 4. Evidence-class separation

The canonical model keeps these classes structurally separate:

1. Objective measurements: observed or deterministic numeric evidence.
2. Human judgments: subjective ratings or preferences from a person.
3. Automated/model judgments: rubric-based evidence from a disclosed model or external framework.
4. Provider-documented claims: attributable capability or developer-experience metadata that is never presented as measured performance.

The Stage 3 metric leaderboard accepts objective measurements only. Human and automated judgments can be stored and inspected, but are not silently mixed into objective rank. Provider claims are explicitly non-rankable.

## 5. Modality-specific categories

The category catalog defines independent contracts for:

- Speech-to-text: identical-audio accuracy, timing, reliability, and cost evidence. The contract is present; paid STT benchmark execution is deferred.
- Text-to-speech: identical-script timing, duration, real-time factor, reliability, cost, and separately stored listening judgments. Existing Evaluate evidence can be materialized here.
- Realtime conversational voice: event-specific turn latency, interruption, recovery, dropout, and session reliability. The contract is present; full conversational-agent execution is deferred.
- Provider capability evidence: attributable provider-documented capability/developer-experience claims, separate from measured benchmarks.

Capability eligibility is category-specific. Unsupported capabilities are excluded with a structured reason rather than forced into a universal table.

## 6. Measurement definitions

Each measurement names its metric and metric version, value, unit, availability, measurement method, precision, sample count, source, timestamp, confidence when justified, and provenance. Provenance distinguishes:

- ONE server-observed values and the server monotonic clock;
- ONE browser-observed values and the browser monotonic clock;
- provider-reported values and the provider's measurement boundary;
- deterministic derivation from validated evidence; and
- synthetic fixture values.

Provider-reported, server-observed, browser-observed, and derived latency are not interchangeable. Unavailable values remain explicit and null. Cost is rankable only when an exact, versioned pricing basis supports it.

Every metric scoring profile fixes the complete provenance tuple. Ranking ignores a same-named metric observed at a different measurement point, clock, observation/source class, method, or source-schema version. Schema validation also binds source class to the allowed measurement point, clock, and observation kind. This prevents provider-reported latency, server-observed latency, and browser playback latency from entering one distribution.

## 7. Comparability rules

`assessBenchmarkComparability` returns a typed decision with material incompatibilities separated from disclosures. Material checks include the benchmark schema, category, suite/case/input version, methodology and metric version, standardized versus provider-optimized evaluation mode, execution mode/environment, transport, normalized media configuration, and the exact aggregation dimensions.

Provider/model/voice/configuration differences are expected disclosures in a cross-provider comparison. They become material incompatibilities when observations are pooled into one repeated-run series. Repeated observations are segmented by the complete material population key, including case/input, methodology, provider/model and disclosed model version, voice/configuration, evaluation mode, deployment, region, transport, codec, sample rate, and channels. Multi-lane observations require an exact provider/model/voice/configuration selector; an ambiguous selector fails closed.

When an atomic Evaluate bundle contains multiple provider lanes, the canonical result retains the whole observation while each ranking candidate carries exact source result/run and measurement IDs. Exclusions identify the candidate, provider, configuration, and result together, so a partial run can truthfully include one successful lane and exclude another without ambiguous provenance.

Examples of structured exclusion reasons include private visibility, missing consent, synthetic-only evidence, insufficient samples, failed runs, incompatible configuration, unsupported version, and manual review required. Raw observations are retained until their declared retention boundary; exclusions never rewrite the source evidence.

## 8. Statistical methodology

`summarizeBenchmarkSamples` uses finite numeric observations and reports the sample count with every summary. Minimum, maximum, mean, and population standard deviation preserve JavaScript's finite double precision. Median is withheld until at least three samples; p95 uses the nearest-rank definition and is withheld until at least twenty samples.

Empty and partial populations remain explicit. Duplicate observation IDs are not double-counted in ranking populations. Stage 3 does not claim confidence intervals or statistical significance where the evidence cannot justify them. Outliers are not removed silently; any future exclusion policy must be predeclared, versioned, and inspectable with original observations preserved.

## 9. Scoring methodology

Stage 3 implements metric-specific ranking, not a universal score. A scoring profile discloses:

- profile ID and version;
- category;
- exact metric and metric version;
- unit;
- exact measurement source, point, clock, observation class, method, and source-schema version;
- selected statistic;
- higher-is-better or lower-is-better direction;
- minimum sample count;
- displayed precision; and
- whether synthetic evidence is allowed.

Missing or unavailable performance evidence is excluded rather than treated as zero. A provider-attributable terminal failure after an observed dispatch is different: its measured `request-success` value remains zero-valued reliability evidence, while its unavailable latency, duration, and cost fields contribute no samples. Pre-dispatch configuration, kill-switch, quota, budget, or other ONE admission denials remain visible but are mapped to unavailable provider reliability and cannot lower a provider's rank. A repeated-run reliability lane may therefore contain complete and attributable terminal-failure sources; each source binds its own status and failure code, while the candidate records the derived summary status `complete`, one uniform failure, or `mixed`. This prevents reliability rankings from selecting only successful requests and reporting 100% by construction without misattributing ONE policy denials to a provider. Ranking and tie detection use the unrounded statistic; rounding is presentation-only, so close values cannot become false ties. Stable provider/candidate identifiers break display-order ties without changing genuinely equal numeric ranks.

No composite or use-case-weighted score is implemented in Stage 3. A later composite would require explicit versioned weights, normalization, sources, uncertainty, and separate visibility of every evidence class.

## 10. Leaderboard eligibility

A candidate receives a metric rank only when it is explicitly eligible, provides the exact objective metric/version/unit/provenance scope, meets the profile's sample threshold, matches its provider/model/configuration provenance, and belongs to the disclosed comparable population. Provider-lane failures receive a publication-scoped disclosure even when another lane in the same atomic run succeeds. Their observed request-success zero remains eligible for a reliability metric, but unavailable performance measurements remain sample-less and cannot enter latency or quality rankings.

Public publication is a separate server-authoritative operation. It requires a controlled suite and current methodology, public-safe input provenance, explicit consent, adequate samples, comparable environment, valid provider metadata snapshot, no unresolved failure, acceptable freshness, and verified integrity. Synthetic fixtures, private runs, user-uploaded private audio, and unsigned drafts are not public-rankable.

The local fixture snapshot is deliberately private, unsigned, synthetic, and non-public. Equal fixture values exercise deterministic ranking and tie behavior only; they make no provider quality, latency, availability, entitlement, model-support, or pricing claim.

## 11. Human-rating policy

The domain preserves naturalness, intelligibility, pronunciation, emotional fit, use-case fit, overall preference, blind/reveal state, and whether a rating occurred before reveal. Objective measurements and human preference remain separate.

Durable public influence requires an authenticated rater, server-side authorization, one bounded write per rater/output/dimension/version, and a configurable minimum unique-rater policy. The database uses uniqueness constraints to prevent repeated self-voting races. Raw rating events expire after a bounded interval unless a future reviewed aggregation policy replaces them. Ratings are never automatically published. Public proof construction currently fails closed when human judgments are present because per-rating publication consent has not yet been modeled.

Provider affiliation and reputation weighting remain extension seams; a reputation or token system is not part of Stage 3.

## 12. Anti-gaming controls

The repository-level controls are:

- deterministic methodology, suite, case, input, configuration, and population identifiers;
- immutable content hashes and idempotency keys;
- exact provider/model metadata snapshots rather than current mutable labels;
- mandatory propagation of every source-run sponsorship disclosure into leaderboard entries and the public snapshot projection; sponsorship cannot change rank, defaults, or eligibility;
- server-authoritative publication and verification;
- uniqueness constraints for votes and snapshots;
- explicit sample thresholds, exclusions, and tie behavior;
- separation of measured, subjective, automated, and provider-documented evidence;
- Stage 2 identity, trust, rate, quota, budget, concurrency, and audit controls for costly paths; and
- bounded retention and cleanup for raw attempts, traces, artifacts, ratings, and unpublished snapshots.

Deployment WAF, provider dashboard spend caps, monitoring, production migration application, and operator review remain deployment gates. Repository controls do not claim that an IP address or browser fingerprint proves a unique person.

## 13. Provider extensibility

Benchmark IDs are safe generic identifiers; ranking functions do not switch on Deepgram, ElevenLabs, Fish Audio, or Cartesia. Current provider metadata comes from the canonical registry. Existing TTS observations enter through the shared adapter/evidence boundary.

A future provider becomes executable only after it has canonical registry metadata, server-only credential configuration, applicable adapters, capability declarations, shared contract tests, administrative enablement, and benchmark eligibility. A synthetic future-provider test demonstrates that the ranking domain itself does not require a four-provider rewrite.

Different modalities participate only in their applicable categories. Adding a provider does not change benchmark schemas, scoring, authorization, trust tiers, public result shapes, or unrelated UI.

## 14. Visibility and publication model

Canonical visibility states are:

- `private` (the default for user-created runs);
- `team`;
- `unlisted`;
- `public-candidate`; and
- `public-verified`.

Publication state is separate from visibility. A public-verified result must be eligible, explicitly published, and hash- or signature-verified. Optional signing is not required to use private or hash-verified evidence. Revocation returns public database records to a non-public state while preserving the investigation trail within its retention policy.

Human-readable UI and future machine-readable endpoints must apply the same authorization and visibility decision. There is no client-controlled publication path.

## 15. Integrity hashing

`canonicalizeBenchmarkJson` accepts bounded JSON-compatible values, rejects cycles, undefined values, non-finite numbers, and non-plain objects, normalizes negative zero, and sorts object keys recursively. Object keys must use 1–80 printable ASCII characters; configuration keys use the narrower ASCII identifier domain `[A-Za-z][A-Za-z0-9._-]{0,79}`. PostgreSQL canonicalization uses explicit `C` collation for the same byte-stable ordering domain. `hashBenchmarkPayload` computes SHA-256 over the resulting UTF-8 canonical JSON.

Configuration numbers shared with PostgreSQL are deliberately constrained to zero or an absolute value in the non-exponent interval from `1e-6` inclusive to `1e21` exclusive, including values inside arrays. This makes JavaScript `JSON.stringify` and PostgreSQL's trimmed numeric text agree for the admitted configuration domain. Values outside that proven range fail validation rather than receiving contradictory cross-runtime digests. Database-public snapshot signing remains an exact-byte operation and does not reserialize PostgreSQL numbers in JavaScript.

Result integrity excludes the mutable integrity envelope itself from the hashed payload. Verification recomputes the hash locally, reports unsupported schema versions, detects tampering, and never upgrades hash-only proof to signature proof. Private and fixture materialization can remain explicitly unsigned until a reviewed publication boundary seals it.

Public proofs are a separate, fail-closed allowlist projection from the verified canonical result. Proof creation rejects private, fixture, unapproved, unpublished, ineligible, incomplete, hash-invalid, and embedded private Evaluate observations. The publication helper atomically transitions an approved public candidate to `public-verified`/`published` before hashing the final state, so changing visibility later invalidates the digest. The proof retains the already-verified source digest plus a recomputable public-content digest, includes configuration hashes rather than configuration values, omits principal/evaluation identifiers, messages, free-text provenance/limitations, and all reference strings, and hashes free-text judgment values. Credentials, private audio or transcripts, private account identifiers, personal data, provider request/response bodies, and sensitive prompts are never part of that projection.

The server publication boundary recomputes every participant configuration digest from the disclosed canonical configuration. It also requires persistent result retention plus a controlled `repository:` or `object:` observation reference; any published artifact must use the same durable schemes, be publication-verified, and use persistent retention without an expiry. A caller cannot make an ephemeral or configuration-mismatched record reproducible merely by supplying a well-formed hash string.

## 16. Optional signing architecture

`benchmark-signing.ts` is server-only. It defines an Ed25519 signer interface, key ID, payload/version binding, signed timestamp, canonical padded base64 signature envelope, and public-key verification. The validator requires the exact 64-byte Ed25519 signature shape. Tests generate ephemeral keys; no private key is committed, logged, stored in a browser, or written to benchmark tables.

Persisted snapshot signing uses a separate prepared-payload seam. The guarded database RPC returns the exact database-canonical UTF-8 string, its bounded JSON projection, the fixed `one-benchmark-db-public-payload/1.0.0` version, and SHA-256 digest. The application validator requires the payload's snapshot ID to match the outer guarded envelope, checks semantic payload agreement, and hashes those exact bytes before signing or verifying them. Generic JavaScript-object signing deliberately rejects the database payload version, avoiding an unsafe assumption that PostgreSQL and JavaScript serialize every numeric value identically.

Signing is optional. Hash-verified results remain usable when no key is configured. The application does not currently bind a production key or expose a signing route. A future transparency log may anchor the existing hash without changing the canonical benchmark model; blockchain is not implemented and is not in the critical path.

## 17. Privacy and retention

The default is private, minimal, and bounded:

- raw user audio is not persisted by default;
- ephemeral attempts and artifacts expire after 14 days;
- detailed technical traces/errors expire after 35 days;
- deterministic fixture records expire after 90 days;
- private runs, cases, and raw human judgments expire after 180 days;
- unpublished methodologies, suites, aggregate snapshots, and signing records expire after 400 days; and
- deliberately published, verified metadata may remain until revoked/retired so the evidence it supports remains reproducible.

Published permanence applies to sanitized metadata, not private raw media. Revoked/retired records re-enter bounded cleanup. Cleanup runs in bounded batches, is repeatable and observable, preserves active/public parents, clears short-lived technical detail before deleting evidence, and follows foreign-key order.

The values balance investigation/reproduction windows against denial-of-storage risk: technical payloads are shortest, private product history is bounded, and intentionally public methodology/results have an explicit archival lifecycle rather than accidental indefinite growth.

## 18. Database architecture

The forward-only migration places authoritative tables in the unexposed `private` schema, enables RLS as defense in depth, revokes table/sequence access from `public`, `anon`, and `authenticated`, and exposes only narrow functions with empty `search_path` and explicit grants.

Server functions use row/advisory locks and idempotency/uniqueness constraints where publication, human ratings, or snapshot generation can race. Snapshot publication serializes the case → suite → methodology catalog path so an administrator cannot retire an ancestor between eligibility validation and publication. JSON, text, artifact sizes, child counts, and key formats are bounded. A narrow owner/admin result reader enforces principal visibility; separate keyset-paginated public snapshot listing and exact snapshot reading expose only sanitized public-verified projections, never raw runs, private principals, object keys, traces, or provider payloads.

The public list returns at most fifty summaries per page. Each summary carries a deterministic prefix of at most ten sponsorship disclosures plus the exact total disclosure count; the full union remains in the immutable, one-megabyte-capped proof. Explicit null or out-of-range limits fail closed rather than becoming an unbounded SQL `LIMIT`. Included measurement provenance is constrained to a small public-safe identifier map, checked against every linked source measurement, included in the source-evidence hash, and disclosed in the signed proof. The signed source hash also binds the server request-start timestamp. Public reliability zeros require that immutable dispatch marker plus an allowlisted provider-attributable outcome; pre-dispatch and ONE-policy failures fail publication. The signed public payload also binds the sanitized disclosed filters and methodology content hash. Snapshot metadata, provider snapshots, population, metric/unit, exact six-field measurement scope, exclusions, and source ownership must agree across every entry and linked measurement.

Stage 3 extends the existing minute-23 maintenance entry point rather than creating a second cron system. The complete migration chain, pgTAP tests, cleanup idempotency, RLS/grants, publication constraints, and concurrent invariants are verified only against a disposable local Supabase stack during development. Production migration application is explicitly outside this stage.

## 19. UI behavior

The existing `/evaluate` workflow remains first. A Stage 3 benchmark section follows it and consumes the same canonical snapshot type used by exports and future interfaces.

The initial UI provides an honest fixture-only setup and leaderboard preview. Setup exposes category, suite, methodology, two-to-four exact provider/model/voice lanes, run mode, standardized configuration, visibility, capability/readiness, eligibility warnings, and a nonbillable label. STT, realtime, protected-live, local-live, and public-candidate choices remain visibly disabled. The shared action runtime validates `benchmark.plan`, executes the deterministic `benchmark.runFixture` action, and receives the validated `EvaluationEvidenceBundle` plus canonical private result. Preview and materialization share the same fixture definition and configuration hash. The UI renders separated evidence counts, exact lanes, comparison mode, exclusions, visibility, retention, and unsigned integrity state without making a provider or Evaluate API request. `benchmark.materializeEvaluation` remains the boundary for separately obtained, validated Evaluate bundles.

The leaderboard has category, modality, provider, model, language/locale, region, methodology, evidence-class, deployment, exact time-window, scoring-profile, and freshness filters. Responsive cards use the historical provider display snapshot and show exact suite/case/input, model/voice/configuration identifiers, adapter/model versions, runtime environment, comparable region/transport/media boundary, sponsorship disclosure, one disclosed metric, sample count, median/p95 availability, freshness, eligibility, visibility, publication, integrity, signature state, and exclusions. Displayed values honor the scoring profile's declared precision. “Why ranked here?” expands the exact methodology and scoring-profile IDs/versions, direction, provenance scope, minimum-sample rule, evidence class, sponsorship boundary, exclusions, integrity, and limitations.

Cards stack at 360/390 px and become a compact grid on wider screens. Controls retain at least 44 px touch targets, visible focus, semantic labels, reduced-motion support, readable wrapping, and no page-level horizontal table. No fixed/sticky controls were added, so the existing mobile dock, keyboard flow, safe-area behavior, and PWA shell remain authoritative.

## 20. Future machine interfaces

Methodologies, suites, cases, runs, results, measurements, judgments, integrity decisions, comparisons, exclusions, scoring profiles, and leaderboard snapshots are strict typed JSON. The action registry records planning/materialization, owner-authorized result retrieval, comparison, metric aggregation, fixture preview, bounded public-snapshot listing, methodology inspection, and integrity verification contracts, but Stage 3 does not broadly expose them through REST, MCP, or automation.

The private result reader and public keyset listing return bounded, versioned database projections. A server-only repository service validates those exact projections, requires an authenticated principal for owner reads, propagates only the server guard, preserves a non-disclosing null, and validates the public keyset limit/cursor before repository access. The action registry uses the same read schemas. No REST, MCP, browser-table access, or administrative publication surface is added.

Stage 4 can project these same contracts through authenticated, permissioned, quota-aware interfaces. It must not introduce a second agent-specific benchmark model or expose administrative publication/signing operations merely because they exist internally.

## 21. Testing strategy

Unit coverage exercises schema strictness, exact embedded-observation participant/status/evaluation-mode invariants, stable versions/IDs, modality boundaries, evidence-class separation, provider snapshots, exact multi-lane selection, source-linked partial failures, reliability zeros versus unavailable performance samples, comparability and exclusions, exact measurement provenance, full-precision statistics and ties, shared cross-runtime configuration/filter number and size bounds, missing metrics, duplicate observations, plan bounds, canonical JSON/SHA-256, configuration-digest rebinding, durable publication references, allowlisted public proof, tamper detection, generic and database-prepared Ed25519 verification, unsupported versions, bounded read projections, privacy, and future-provider neutrality.

Database pgTAP coverage exercises the complete local migration chain, private defaults, RLS/grants, publication eligibility, public projection, rating/snapshot uniqueness, bounded row shapes, retention preservation/deletion, cleanup idempotency, and concurrency-sensitive invariants. The final disposable-local run passed all 309 assertions, including all 201 benchmark assertions. The reliability regression publishes one exact Deepgram lane across a complete and a timed-out source and requires `request-success` unit `boolean`, mean `0.5`, sample count `2`, and candidate status `mixed`; a pre-dispatch `provider_not_configured` zero is then injected and must make signing fail, while dispatched timeout, rate-limit, and malformed-provider outcomes remain attributable. Independent-session Stage 2 and benchmark identity/preference/catalog-publication races passed, and database lint exited successfully with only the documented Stage 2 warnings. The disposable stack was then stopped and removed.

Fixture-only Playwright coverage exercises setup, plan validation, canonical completion, result detail, filters, result explanation, integrity state, scoring precision, 390 px stacking, keyboard-accessible native controls, the existing mobile dock, and explicit assertions that neither provider domains nor the paid-capable Evaluate execution route are contacted. Existing action, provider, trust/security, Evaluate, Voice Open, Pocket/PWA, lint, typecheck, build, full unit, and secret-audit gates remain part of validation.

The final repository pass recorded: 68/68 focused Stage 3 unit tests; 2/2 benchmark desktop/mobile E2E tests; 635/639 full unit tests with the same four documented baseline failures; 84 passes, 15 existing/non-Stage-3 failures, and 6 intentional skips in the 105-test main E2E matrix; and a successful typecheck, production build, secret audit across 647 files, and lint with the same three existing warnings. Evaluate's 51 focused unit tests passed and four of five E2E cases passed; the remaining unchanged export case emitted the expected JSON download but this Windows runner could not read Playwright's locked artifact (`EPERM`) and returned an empty stream. Provider focused units passed 37/37 with seven of eight E2E cases passing; the unchanged Rolodex title expectation remains stale. Pocket passed 24 tests with 24 viewport-specific intentional skips. These failures are outside the Stage 3 diff and were not hidden or weakened.

All automated tests must keep live flags disabled and consume zero provider credits.

## 22. Known limitations

- Stage 3 materializes existing TTS Evaluate evidence; it does not execute STT or realtime benchmark plans.
- The on-screen leaderboard is a synthetic fixture preview, not published provider performance evidence.
- No production benchmark data or live-provider result population was verified.
- No production signing key is configured and no public signing service exists.
- No production repository adapter, benchmark REST/MCP surface, or operator publication UI is wired; those are deliberate later-stage seams.
- Public artifacts are metadata/reference-only until a durable object-store deletion and retention lifecycle is approved.
- Before wiring the real public-list repository adapter, align the TypeScript `suiteId` validator's casing rule with the database's lowercase-only suite key rule.
- Provider-documented capability evidence requires ongoing source/freshness review and is not an observed benchmark.
- One scenario, region, model, voice, codec, or time window does not generalize to another.
- Public anonymous live use still depends on the Stage 2 deployment gates: production migrations, WAF/rate configuration, auth controls, progressive challenges, environment-scoped keys, provider hard caps, monitoring, alerts, and incident procedures.
- A durable public benchmark program still requires curated/licensed datasets, operator publication workflow, anti-gaming operations, and independently controlled canonical runs.

## 23. Explicitly deferred work

- DeepEval compatibility and architecture-boundary analysis: Stage 8.
- Full Provider Hub and provider-plugin SDK: Stage 4.
- Broad authenticated agent REST and MCP exposure: Stage 4.
- Full reputation, contribution history, and portable trust: Stage 6.
- Identical-audio paid STT execution and full realtime conversational-agent evaluation: later modality stages after their safety/cost boundaries are approved.
- Production signing-key configuration or transparency-log anchoring: later security/operations decision.
- GPU and Lab Aura visual systems: Stage 9.
- Blockchain anchoring: absent unless a later evidence-backed architecture decision shows ordinary signatures/transparency logs are inadequate.
- Production migration application, hosted Supabase changes, provider credential changes, deployment, push, and live-provider validation: not performed in Stage 3.

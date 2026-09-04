# ONE Voice Lab — Evaluate

> Phase 1 implementation boundary: provider-neutral text-to-speech comparison. It does not rank providers, compare speech-to-text, simulate a full conversational agent, clone voices, monitor production calls, or publish community ratings.

**Product line:** One scenario. Every voice. Full evidence.

Benchmarks show who wins their test. ONE helps a person discover which configuration works for their scenario—and why. A result is evidence for the exact script, model, voice, provider configuration, environment, and time recorded. It is not a universal provider-quality claim.

## User value

Evaluate keeps the comparison small and inspectable:

1. Choose or edit one versioned script.
2. Choose two to four registered providers.
3. Choose only models and voices exposed by each provider's real adapter/catalog boundary.
4. Confirm any protected live spend explicitly.
5. Run providers independently with bounded concurrency.
6. Listen, inspect measured evidence, add private human ratings, export, and rerun.

The default fixture mode is free, deterministic, and incapable of contacting a provider. Protected live mode is a separate server-only path and is off by default.

## Architecture

Evaluate extends the existing Provider Registry and capability-specific TTS adapters. It does not introduce a second provider registry or let the browser call a provider SDK.

```text
Evaluate workspace
  -> validated Evaluate API
     -> fixture executor OR protected-live gate
        -> existing Provider Registry
           -> one capability-specific TTS adapter per provider
              -> normalized PCM -> validated WAV + versioned evidence
```

The boundaries are intentionally separate:

- **Registry metadata** says a provider is listed and describes repository evidence.
- **Configured** means required server-only environment variables are present; it does not prove account entitlement.
- **Adapter-backed** means the requested TTS capability has an implemented adapter.
- **Live-enabled** means the provider allowlist, provider switch, global Evaluate switch, master live switch, and access/spend controls all permit an attempted request.
- **Fixture available** means ONE can demonstrate the workspace without a provider call. It never implies live availability or provider quality.

Readiness labels remain distinct: Working, Partial, Prototype, Planned, simulated/fixture-backed, unsupported, and unavailable must never be collapsed into “live.” Missing credentials, catalogs, models, voices, or adapters degrade to an explicit unavailable result without discarding other providers' results.

## Adapter contract

Each TTS adapter owns provider-specific validation and translation. The shared contract provides:

- stable provider metadata and adapter version;
- capability and readiness state;
- validated model and voice discovery, or an explicitly versioned model allowlist when discovery does not exist;
- a bounded synthesis request with an `AbortSignal`;
- normalized audio bytes and content metadata;
- monotonic first-audio and completion timing;
- normalized, sanitized errors;
- an optional health/availability result;
- optional versioned cost estimation only when reviewed pricing metadata exists.

Adding a provider should require a manifest, one independently tested TTS adapter, registration, configuration detection, and mocked contract tests—not changes to the comparison cards. See [Adding a Provider](ADDING_A_PROVIDER.md).

## Standardized and provider-optimized modes

The standardized Phase 1 target is signed 16-bit little-endian mono PCM at 24 kHz. The server validates the bytes and wraps them in a deterministic WAV container for browser playback, hashing, and duration measurement.

This target improves comparability; it does **not** make different models, voices, codecs, transports, regions, normalization behavior, or provider-native controls equivalent. Every exact request configuration is disclosed in the evidence. A setting that cannot be translated fairly stays in the separate provider-optimized area and is labeled non-equivalent.

Phase 1 protected-live and local-live runs are deliberately Standardized-only. Raw provider-native formats are not accepted until ONE can normalize them to a portable browser-playback boundary while preserving exact format provenance. Fixture mode may expose provider-optimized behavior to demonstrate the architecture without making a paid provider call. Future provider-optimized live runs may help discover a strong configuration for one provider, but they must not be interpreted as a controlled one-variable comparison unless every other variable was actually held fixed.

## Scenario presets

The bundled preset library is versioned independently of the UI:

- Customer support
- Expressive narration
- Names, numbers, dates, and currency
- Multilingual or code-switching
- Fast conversational response

Evidence records whether the script is an unchanged preset, a customized preset, or fully custom. A preset ID must match the versioned scenario ID, and unchanged preset text cannot be labeled customized. It records the exact text and a SHA-256 input hash. Leading or trailing whitespace is rejected before execution so this recorded text and hash match the text dispatched to every provider. Analytics must not receive the script.

## Execution behavior

- Provider count: two to four.
- Text length: bounded and validated on both client and server.
- Concurrency: bounded worker pool; no unbounded fan-out.
- Timeout: one hard server timeout per provider plus caller cancellation.
- Retry: none by default. A future retry must be explicitly safe, bounded, and recorded as another attempt.
- Partial results: each provider reaches its own complete, cancelled, timed-out, unavailable, or failed state. One failure never erases another provider's audio or evidence.
- Cancellation: aborts ONE's active network read. It must not be described as proof that upstream compute or billing stopped.
- Response size and audio shape: bounded before normalization.
- Transport: provider results stream as newline-delimited evidence events so one completed result can remain usable while another provider is still running. This also avoids buffering four base64-encoded PCM outputs into one oversized hosted-function response.
- Errors: allowlisted code and useful sanitized message only. Authorization values, credentials, provider payloads, and internal URLs never reach the browser.

## Evidence schema

The versioned JSON schema records:

- evidence schema: `one-voice-evidence/1.0.0`;
- TTS comparison methodology: `one-tts-compare/1.0.0`;
- metric methodology: `one-tts-metrics/1.0.0`;

- schema, methodology, and metric versions;
- evaluation, run, scenario, and scenario-version identifiers;
- exact input text, type, origin, and hash;
- standardized or provider-optimized mode;
- exact provider, model, voice, adapter version, native configuration, environment, and a scoped region when known;
- a nullable upstream-request timestamp (null means no provider dispatch), plus first-audio, completion, and optional client-playable wall-clock timestamps;
- monotonic metric values, measurement points, units, availability, versions, and provenance;
- normalized audio MIME type, duration, private ephemeral reference, and content hashes;
- normalized status, sanitized error, and observed/inferred/provider-reported/unavailable trace events;
- separate human ratings and blind/reveal state;
- private visibility, no-publication consent, ephemeral retention, sponsorship disclosure, and reserved model-judge fields.

Raw provider payloads, API keys, authorization headers, cookies, internal URLs, and raw audio are excluded from the export schema. Import accepts only supported UTF-8 JSON below the documented byte limit, rejects unknown schema fields, recomputes the exact-text hash, verifies run/provider/blind-label/metric/status coherence, and rejects credential-shaped content before display.

Phase 1 uses export/re-import for sharing. It does not add a database or hosted public link merely for Evaluate. Audio remains in browser memory for the active session and is not embedded in the JSON export.

## Metric methodology and provenance

Measured, derived, provider-reported, human-rated, and future model-judged evidence are separate categories.

| Metric | Measurement point | Phase 1 rule |
|---|---|---|
| Server time to first audio chunk | ONE server, monotonic clock | Request dispatch to first non-empty response-body audio bytes. Response headers alone do not count. |
| Time to first audible output | Unavailable unless directly measured | Never inferred from first byte. |
| Total generation time | ONE server, monotonic clock | Request dispatch through validated end of response. |
| Audio duration | Derived from validated normalized PCM | PCM bytes divided by sample rate, channel count, and sample width. |
| Real-time factor | Derived | Total generation seconds divided by audio duration seconds. |
| Request status | ONE server | Normalized complete/failure/cancel/timeout/unavailable state. |
| Client time-to-playable | ONE browser, monotonic clock | Recorded separately after the browser can load the normalized audio. |
| Estimated cost | Unavailable by default | Shown only with an immutable, reviewed pricing record, exact formula, unit, currency, source, and effective date. |

Provider-reported latency or alignment metadata may appear only with a provider-reported label. It is never mixed with ONE's server-observed or browser-observed latency. `regionScope` distinguishes ONE's Vercel server region from a provider region; Phase 1 records the former when `VERCEL_REGION` is available and leaves provider region unknown unless the provider explicitly establishes it.

Distributions require repeated comparable runs. A median should not appear before at least three samples; a p95 should not appear before at least twenty. The sample count must always accompany the statistic.

## Blind listening and ratings

Blind mode uses deterministic seeded randomization for reproducible tests and neutral labels Voice A through Voice D. It is limited to Standardized mode so native containers cannot carry provider-identifying metadata; every blind result is normalized to ONE's WAV boundary. Until the user submits a preference or explicitly reveals identities, the UI must suppress provider names, colors, filenames, URLs, inspector metadata, and download names that could reveal the mapping.

Naturalness, intelligibility, pronunciation, emotional fit, use-case fit, and overall preference are recorded separately. Evidence records whether the rating occurred before or after reveal. Ratings remain local/private and are never automatically published. Phase 1 reserves model-judge fields but does not compute or display them.

There is no universal composite “best voice” score.

## Modes

### Fixture

- Default and freely available.
- Deterministic local evidence/audio fixtures.
- No provider credentials or network calls.
- Proves application behavior only.

### Protected live

- Uses server-configured credentials only.
- Requires an explicit paid-call confirmation.
- Requires the Evaluate kill switch, the production master live switch, the provider-specific switch, a configured adapter, and access/spend approval.
- Public anonymous use remains disabled by default.

### Local live

- Intended for a trusted local operator with server-side credentials.
- Keeps the same validation, timeout, concurrency, and evidence boundaries.
- The supported development command binds to `127.0.0.1`. Do not enable local-live on a LAN- or internet-bound development server; any future remote-operator mode requires a separate operator authorization boundary.
- Does not imply production safety.

### Future sponsored

A future provider-sponsored project may pay for bounded compute. Sponsorship must be disclosed as “Compute sponsored by [provider]” and can never purchase rank, scoring influence, favorable defaults, preferential placement, interpretation, or veto rights. Durable project budgets and abuse controls are prerequisites.

## Environment variables

Use safe placeholders only. Provider credentials remain server-only and never use a `NEXT_PUBLIC_` prefix. Supabase's publishable browser configuration is not a provider credential.

```dotenv
ONE_LIVE_EVALS_ENABLED=false
ONE_LIVE_EVALS_ANONYMOUS_ENABLED=false
ONE_LIVE_LAB_ENABLED=false
ONE_EVALUATE_MAX_TEXT_LENGTH=320
ONE_EVALUATE_ELEVENLABS_VOICE_IDS=
ONE_EVALUATE_CARTESIA_VOICE_IDS=
RUN_LIVE_PROVIDER_TESTS=false

OPEN_LAB_DEEPGRAM_ENABLED=false
OPEN_LAB_ELEVENLABS_ENABLED=false
OPEN_LAB_FISH_AUDIO_ENABLED=false
OPEN_LAB_CARTESIA_ENABLED=false

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
LAB_USAGE_GUARD_TOKEN=

DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
FISH_AUDIO_API_KEY=
CARTESIA_API_KEY=
```

Existing provider-specific live switches, `ONE_LIVE_LAB_ENABLED`, Supabase access configuration, and `LAB_USAGE_GUARD_TOKEN` remain additional independent gates. Turning on one flag does not make every provider live.

Hosted `protected-live` discovery and synthesis fail closed for ElevenLabs and Cartesia unless `ONE_EVALUATE_ELEVENLABS_VOICE_IDS` and `ONE_EVALUATE_CARTESIA_VOICE_IDS` contain comma-separated, operator-approved stock/public voice IDs. The server filters discovery to those IDs and validates the submitted voice again immediately before orchestration; the browser catalog is never treated as an authorization boundary. Trusted non-production `local-live` runs may inspect the configured account-wide catalog so the local operator can evaluate access without expanding hosted exposure.

Credential-backed ElevenLabs model discovery, voice discovery, and TTS execution each require an independent operation-bound policy proof. TTS permission cannot authorize either catalog lookup, and a cached account-scoped catalog is re-authorized before it is read.

Cartesia's static model catalog is credential-free. Its account-scoped voice discovery and batch TTS use the same exact-operation proof boundary, and selected-voice validation requires an independent voice-discovery proof before synthesis. Evaluate reads Cartesia's raw 24 kHz PCM and API-version behavior from the canonical adapter profile rather than a provider-name request branch.

The existing Open Lab policy still denies ElevenLabs execution whenever `OPEN_LAB_MODE=true`. Evaluate reports that lane as unavailable in that mode instead of implying a working live adapter; deterministic fixture evidence remains available.

Deepgram Evaluate discovery now comes from the canonical dated static model and
voice projection, so opening or filtering the catalog requires no credential or
provider request. Aura voice choice is encoded by the model identifier and the
adapter profile supplies standardized linear16 24 kHz plus bounded native
format metadata; generic Evaluate code does not construct a second Deepgram
request. Protected execution still requires the exact `tts.batch` policy proof
and every Stage 2 gate. Fixtures are labeled synthetic, and
`LIVE DEEPGRAM VERIFICATION: NOT PERFORMED`; no fixture value is latency,
quality, pricing, availability, or ranking evidence.

Cartesia's generic provider voice and TTS routes remain disabled outside Evaluate. Configuring its credential, provider switch, or Evaluate allowlist does not enable those broader routes.

`LIVE CARTESIA VERIFICATION: NOT PERFORMED`; deterministic fixtures and mocked transports are contract evidence, not latency, quality, price, availability, or production evidence.

`RUN_LIVE_PROVIDER_TESTS=true` is reserved for deliberate manual smoke tests. It must never be set in normal CI, unit, integration, or Playwright jobs.

## Privacy, security, and cost controls

- Default visibility is private; default retention is ephemeral.
- Script, audio, ratings, exact provider payloads, and traces do not enter product analytics.
- No browser-side provider keys, BYOK, provider SDK calls, or credential storage.
- No arbitrary upstream URL, Authorization header, raw reference audio, or voice-cloning input.
- Same-site validation, strict schemas, text/provider/concurrency/timeout/response limits, and sanitized errors apply before execution.
- Protected live requests reuse durable member/guest/shared spend protection where available.
- `ONE_LIVE_EVALS_ENABLED` is the Evaluate-specific kill switch; `ONE_LIVE_LAB_ENABLED` remains the production master pause.
- Public anonymous live evaluation stays off until durable distributed rate limiting, shared budgets, identity/abuse controls, monitoring, incident response, and provider-account quotas are configured and verified.
- Process-local rate limiting is defense in depth, not sufficient public abuse protection across server instances.
- No automated test is authorized to spend provider credits.

## Methodology limitations

- A single scenario does not generalize to another use case, language, voice, audience, or production environment.
- Voice identity and model architecture differ; shared audio encoding does not create semantic equivalence.
- Streaming protocols and geographic routing can change latency independently of synthesis quality.
- Browser decode and playback readiness are client measurements, not provider latency.
- Provider-reported metadata may use a different clock and definition than ONE.
- Dynamic catalogs, mutable model aliases, account entitlements, and provider availability can change after a run.
- Fixture and mocked results verify ONE's behavior, not live provider quality, latency, pricing, entitlement, or availability.
- Blind mode reduces ordinary listening bias in the rendered experience; it is not a cryptographic secrecy boundary against a participant inspecting their own browser network traffic or source state.
- Sponsorship disclosure is mandatory and never changes ordering or interpretation.

## Phase 2 seam

The smallest next phase is identical-audio speech-to-text comparison through a sibling capability adapter that reuses the same scenario/evidence/trace architecture. Full conversational-agent evaluation should follow later, only after multi-turn timing, interruption, turn-taking, tool use, and safety evidence have their own explicit contracts.

## Stage 3 benchmark seam

Evaluate now remains the execution and listening surface while the canonical benchmark layer treats each validated `EvaluationEvidenceBundle` as one atomic TTS observation. Comparable repeated observations can be segmented and aggregated into a versioned, metric-specific leaderboard snapshot with explicit sample requirements, exclusions, freshness, integrity, and limitations.

The benchmark setup and preview below Evaluate are deterministic, synthetic, nonbillable, private, and unsigned. The setup validates a bounded two-to-four-lane fixture plan through the shared action runtime, materializes the canonical private result locally, and exposes the exact result/evidence/eligibility detail without calling providers. Equal fixture values intentionally tie every listed provider and demonstrate only the generic UI/ranking path; they are not provider performance evidence. Public publication is a separate server-authoritative operation and cannot be requested from this preview.

STT and realtime benchmark categories have typed extension seams but no paid execution path in Stage 3. Existing protected-live TTS remains the only paid comparison path and keeps the Stage 2 trust, quota, budget, concurrency, and kill-switch controls. See [Benchmark Engine and Leaderboards](BENCHMARK_ENGINE_AND_LEADERBOARDS.md).

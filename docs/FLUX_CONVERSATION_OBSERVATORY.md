# Flux Conversation Observatory

**Route:** `/flux-observatory`  
**User-facing subtitle:** See every turn, interruption, and response boundary.  
**Repository status:** Implemented with deterministic fixtures. Live Provider
Mode is implemented, but no retained microphone/provider validation record
exists yet. **Manual validation required. Production readiness not
established.**

Flux Conversation Observatory is a local-first conversational observability
workspace. It makes the distinction between ordinary streaming transcription
and conversational turn intelligence inspectable: transcript updates describe
what the provider heard, while Flux turn events describe when the provider's
conversation state changed.

The Observatory is not a decorative transcript viewer and does not present a
mock voice agent as live. Provider events, local browser observations,
synthetic fixtures, derived metrics, and assumptions retain separate labels.

## Evidence labels

- **Deepgram documentation verified**: a product or wire-contract statement was
  checked against current official Deepgram documentation.
- **Repository verified**: the behavior exists in the current source.
- **Synthetic fixture — not a live Deepgram result**: deterministic replay data
  exercised the same normalizer and reducer as the live path.
- **Locally measured**: a duration or lifecycle observation was derived from
  browser timestamps; it is not a provider benchmark.
- **Manual validation required**: a real credential, microphone, browser, and
  provider run has not been retained as evidence.
- **Experimental idea**: the bounded speculative-response demonstrator does not
  call an LLM, TTS service, or tool.

## Two modes, one event pipeline

### Synthetic Replay

Synthetic Replay does not request microphone permission, mint a temporary
credential, open a provider socket, or make a billable call. It feeds labeled
events into the same typed normalizer, reducer, timeline, metrics, turn
inspector, scorecard, and Mermaid generator used by Live Provider Mode.

### Live Provider Mode

Live Provider Mode has two separate visible actions:

1. **Prepare microphone** opens a consent dialog and then requests browser
   microphone permission. It does not contact Deepgram.
2. **Start provider session** requests a short-lived credential from the
   server, opens the Flux WebSocket, waits for `ConfigureSuccess`, and only then
   starts audio processing and streaming.

Stop, provider failure, token expiry, reconnect, device disappearance, and
component cleanup clear credential references and release media tracks,
AudioContext/AudioWorklet nodes, timers, listeners, and WebSocket references.
Reconnect creates a new connection generation; stale messages from an earlier
generation cannot mutate the active session.

## Official Flux contract used by the repository

The contract below was rechecked on 2026-07-28. Product availability can
change, so recheck the linked official sources before a customer POC.

| Contract | Repository behavior | Evidence |
| --- | --- | --- |
| Conversational endpoint | Direct WebSocket to `wss://api.deepgram.com/v2/listen`; no Flux `/v1/listen` fallback | Deepgram documentation verified; repository verified |
| Models | `flux-general-en` and `flux-general-multi` | Deepgram documentation verified; repository validated |
| Turn messages | `TurnInfo` with `Update`, `StartOfTurn`, `EagerEndOfTurn`, `TurnResumed`, and `EndOfTurn` | Deepgram documentation verified; normalized by the repository |
| Session/configuration messages | `Connected`, `ConfigureSuccess`, `ConfigureFailure`, `Error`; warnings and unknown future messages remain safely inspectable | Deepgram documentation verified for the core messages; repository verified |
| Initial and dynamic thresholds | `eot_threshold`, `eager_eot_threshold`, `eot_timeout_ms` | Deepgram documentation verified; repository validated |
| Dynamic control | Explicit `Configure` message; active state changes only after acknowledgement | Deepgram documentation verified; repository verified |
| Browser authentication | Permanent key stays server-side; browser receives a short-lived credential and uses the Bearer WebSocket subprotocol | Deepgram documentation verified; repository verified |

Official references:

- [Flux quickstart](https://developers.deepgram.com/docs/flux/quickstart)
- [Turn-based Audio / Flux API reference](https://developers.deepgram.com/reference/speech-to-text/listen-flux)
- [Token-Based Authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication)
- [Sec-WebSocket-Protocol guidance](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol)

## Configuration laboratory

The editor and active configuration are intentionally distinct. Choosing a
preset or editing values does not alter a live session. **Apply configuration**
is explicit. Each transaction retains the previous, requested, and acknowledged
configuration plus its sent, acknowledged, or rejected state. A rejection does
not replace the last acknowledged configuration.

Client validation currently enforces:

- `eot_threshold`: 0.5 through 0.9;
- `eager_eot_threshold`: disabled, or 0.3 through 0.9 and no greater than
  `eot_threshold`;
- `eot_timeout_ms`: integer from 500 through 60,000;
- no more than 100 non-empty keyterms, each at most 120 characters;
- language hints only with `flux-general-multi`, using the client allowlist;
- at most 10 language hints at this application boundary; and
- an integer configured chunk target from 10 through 1,000 ms.

The repository contract recognizes raw `linear16`, `linear32`, `mulaw`,
`alaw`, `opus`, and `ogg-opus` and sample rates of 8, 16, 24, 44.1, and 48 kHz.
The current live browser capture implementation deliberately emits only mono
`linear16` PCM; other documented formats remain configuration/reference
surfaces and require a different verified capture path.

The live pipeline uses an AudioWorklet, resamples to the configured supported
rate, and targets the configured cadence. The default is approximately 80 ms
because that is provider guidance, not a promise that the browser will emit
every frame at exactly 80 ms. The UI separately displays measured local
cadence, socket queue size, dropped frames, and delayed frames.

### Presets are starting points

| Preset | `eot_threshold` | `eager_eot_threshold` | `eot_timeout_ms` | Intended experiment |
| --- | ---: | ---: | ---: | --- |
| Balanced conversation | 0.70 | 0.50 | 5,000 | Moderate two-party starting point |
| Fast response | 0.60 | 0.40 | 1,500 | Earlier speculative work; expect more cancellation |
| Deliberate speaker | 0.85 | 0.65 | 12,000 | Longer pauses and stronger commitment evidence |
| Interruption stress test | 0.65 | 0.35 | 4,000 | Resume cancellation and rapid transitions |

None is presented as universally optimal. Representative audio and
scenario-specific success criteria decide fit.

## Timeline and turn intelligence

The timeline keeps provider events and locally observed lifecycle events
separate. It supports turn, transcript, connection, configuration, failure, and
local-measurement filters. Sanitized payloads are expandable; malformed JSON and
unknown future message types remain inspectable without changing turn state.
Duplicate messages are suppressed, sequence anomalies are counted, and bounded
memory prevents an unbounded session trace.

For a selected turn, the inspector shows the transcript, word timing when
supplied, languages when supplied, event sequence, eager/resumed behavior,
active configuration, local timing, missing fields, and reviewer notes. Its
**What this proves** and **What this does not prove** sections keep a received
event or local duration from becoming a universal product claim.

## Objective metrics

The repository derives only values supported by received events or local
timestamps:

- completed turn count;
- resumed-turn count;
- unknown and malformed message counts;
- configuration and connection failure counts;
- dropped and delayed local audio-frame counts;
- `StartOfTurn` to `EagerEndOfTurn`;
- `EagerEndOfTurn` to `EndOfTurn`;
- `StartOfTurn` to `EndOfTurn`;
- explicit reconnect attempt to next socket open; and
- observed interval between locally emitted audio chunks.

Each duration aggregate shows sample size, minimum, and maximum. Median appears
only with at least three observations; P95 appears only with at least twenty.
Otherwise the UI says **Insufficient observations**. The current wire contract
does not expose an explicit forced-timeout reason, so forced-timeout count is
reported as unavailable rather than inferred.

Browser timing includes capture, browser scheduling, buffering, network, and
transport effects. It is not a universal Deepgram latency benchmark.

## Deterministic replay scenarios

All fixtures are fictional event records and carry the label **Synthetic
fixture — not a live Deepgram result**:

1. Clean completed sentence.
2. Hesitation followed by continuation.
3. Long intentional pause.
4. Self-correction.
5. Eager end followed by confirmed end.
6. Eager end followed by turn resumed.
7. Natural interruption or barge-in cue.
8. Forced timeout not identifiable from `TurnInfo`.
9. Dynamic configuration success.
10. Dynamic configuration failure.
11. Token expiry and reconnect with an obsolete-generation event.
12. Malformed provider event.
13. Unknown future event.
14. Multilingual turn.
15. Rapid consecutive turns.

## Experimental orchestration demonstrator

The turn inspector contains a deterministic state illustration labeled
**Experimental orchestration demonstrator**. `EagerEndOfTurn` starts a local
speculative state, `TurnResumed` cancels it, and `EndOfTurn` may promote it. It
does not call a real LLM, TTS provider, or tool, and it does not prove a
production agent architecture.

## Exports and module handoffs

The user must explicitly generate each artifact.

- POC scorecard: sanitized Markdown and JSON with run mode, provider-validation
  state, model/audio/threshold settings, counts, meaningful timing samples,
  reviewer notes, unsupported conclusions, assumptions, and next evidence.
- Architecture: validated safe-subset Mermaid (`.mmd`) and sanitized SVG plus
  an accessible relationship description.
- API Lab: sanitized Flux operation link and contract shape.
- Architecture Studio: model, ownership, credential boundary, audio path,
  Configure/cancellation behavior, evidence state, and observability points.
- Live Solution Studio / Solution Deliverables Studio: a typed, redacted case
  contribution containing evidence status, architecture data, risks, and open
  questions—not credentials or transcripts.

Scorecards exclude credentials, authorization headers, raw audio, transcripts,
provider URLs, and internal stacks. Session evidence is bounded in memory and
is not automatically persisted.

## keyboard companion boundary

The semantic command registry can open the Observatory, select a mode, request
the visible microphone confirmation, stop, apply a preset, clear, mark a turn,
export a scorecard, and open Architecture or Deliverables handoffs. The browser
remains authoritative. A command cannot invisibly grant microphone permission
or start a billable provider session, and credentials are never command data.

## Verification status

Focused repository checks are defined in:

- `tests/unit/flux-observatory.spec.ts`;
- `tests/unit/flux-observatory-repository-integration.spec.ts`;
- `tests/unit/temporary-token-boundary.spec.ts`; and
- the existing API Studio, Pocket, Live Solution, Deliverables, and Control
  Deck regression suites.

These tests can demonstrate endpoint construction, validation, normalization,
reducer behavior, metric math, fixture determinism, sanitization, handoff
shapes, command boundaries, and cleanup code. They do not demonstrate a paid
Deepgram response, microphone/device behavior, network conditions, account
entitlements, or customer-specific performance.

Use current command output—not this document—as release evidence. The retained
status for this document is **Implemented with deterministic fixtures** and
**Manual validation required**. Follow
[Flux Provider Validation](FLUX_PROVIDER_VALIDATION.md) before using
**Live-provider validated** for a specific environment.

## Production evidence still required

- the documented real-browser/provider validation sequence;
- representative speakers, pauses, languages, accents, noise, codecs, and
  devices for the defined scenario;
- end-to-end latency and cancellation behavior with the intended LLM/TTS/tool
  boundaries;
- concurrency, backpressure, reconnect, token-expiry, and long-session tests;
- retention, consent, privacy, security, regional, and compliance review;
- account entitlement, model availability, rate-limit, and cost validation;
- monitoring, alerting, operational ownership, and failure-recovery evidence;
  and
- scenario-specific success criteria and human review.


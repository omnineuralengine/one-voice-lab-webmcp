# Deepgram realtime architecture boundary

Date: **2026-08-29**

Status: **ARCHITECTURE MEMO — IMPLEMENTATION DEFERRED**

`LIVE DEEPGRAM VERIFICATION: NOT PERFORMED`

## Purpose

the Deepgram provider integration converges request-response Deepgram operations onto the shared provider kernel. It deliberately does not force streaming STT, Flux, streaming TTS, Voice Agent, microphone capture, or browser WebSockets through batch adapter contracts.

Realtime work is session-oriented, cost-bearing, reconnectable, and event-driven. It needs a provider-neutral lifecycle and evidence model before any provider-specific transport is promoted. Existing Deepgram realtime labs remain local/fixture-oriented or intentionally disabled in hosted mode; this memo is not runtime enablement.

## Current official facts and unresolved semantics

Official Deepgram material reviewed on **2026-08-29** establishes the following:

- `POST /v1/auth/grant` creates a temporary token. The documented default TTL is **30 seconds**, and a requested TTL may be **1 through 3600 seconds**.
- The documented grant uses broad `usage::write` access across Deepgram usage products such as Listen, Speak, Read, and Agent. It is not documented as a ONE operation-scoped or session-bound grant.
- A token is required when the WebSocket is established; official guidance says an established connection may continue after that token expires.
- Official material describes live STT interim/final events, endpointing, utterance-end behavior, keepalive/finalize/close messages, and provider-specific disconnect/error behavior.
- Official material does **not** establish single-use tokens, replay prevention, concurrent-socket restrictions, binding to one ONE session, or a per-token revocation protocol suitable for ONE's threat model.

Consequences:

- hosted token issuance remains disabled;
- a token is not treated as authorization by itself;
- one connection generation receives one fresh ONE admission and one fresh token;
- reconnect never reuses an earlier token or earlier concurrency admission;
- token TTL is not treated as a session-duration or spend bound because a socket may outlive it; and
- live provider capability, reliability, latency, pricing, quota, and production suitability remain unverified.

## Existing realtime surface classification

| Surface | Current disposition |
| --- | --- |
| Live Mic / `/v1/listen` WebSocket | Existing provider-specific local/fixture surface; not a canonical realtime adapter |
| Flux / `/v2/listen` | Existing provider-specific fixture/observability surface; not a canonical turn-session adapter |
| Streaming TTS / `/v1/speak` | API Studio/provider-specific surface; canonical implementation deferred |
| Voice Agent / `agent.deepgram.com` | Provider-specific session family; canonical implementation deferred |
| Temporary-token route | Hosted issuance disabled; local operator boundary only where explicitly allowed |
| Browser microphone and audio playback | UI/session resources, not provider authorization |

None of these surfaces is declared as a canonical core batch capability by the Deepgram provider integration.

## Required provider-neutral architecture

| # | Concern | Required ONE boundary before implementation |
| ---: | --- | --- |
| 1 | Session lifecycle | A typed state machine with stable session and generation IDs: draft, validating, admitted, connecting, ready, streaming, draining/finalizing, completed, failed, cancelled, disconnected, and rate-limited. Provider events cannot directly mutate UI state outside this reducer. |
| 2 | Session-scoped authorization | An opaque server decision bound to principal, provider, exact realtime capability, operation, session ID, connection generation, permitted transport, and expiry. Batch-operation proofs are not reusable. |
| 3 | Connection admission | Identity, trust, capability enablement, global/provider budgets, quota, concurrency, live switch, input/configuration bounds, and confirmation must pass before a token or socket is created. |
| 4 | Temporary credential issuance | Server-only provider key; same-site authenticated request; exact admitted generation; no-store response; credential returned only in memory; redacted everywhere else. Hosted issuance stays disabled until all gates are proven. |
| 5 | Token lifetime | Request the shortest practical TTL and record issued/expiry times, but do not equate TTL with session duration or spend because the socket may outlive the token. Enforce an independent ONE maximum session duration. |
| 6 | Token replay prevention | Maintain a server-side one-generation grant record and reject a second issuance/use where ONE can observe it. Because provider-side single-use is undocumented, replay resistance also requires strict TTL, session binding in ONE, bounded issuance, and post-issuance monitoring. |
| 7 | Client/server trust boundaries | The browser may hold only a temporary token in memory. Permanent keys, provider authorization headers, budget decisions, trust decisions, and policy state stay server-side. Caller labels such as `source=agent` are not identity. |
| 8 | WebSocket ownership | Choose one owner per capability: either a purpose-built server/worker proxy or a browser socket admitted by a server-issued token. UI components do not each implement independent provider transports. Hosting compatibility must be verified before choosing a proxy. |
| 9 | Cancellation | Cancellation transitions the local session once, closes capture/socket/playback, releases ONE's lease, and records that upstream compute/billing cessation is not guaranteed unless provider evidence confirms it. |
| 10 | Reconnect semantics | Reconnect is a new connection generation with fresh policy, budget/quota, concurrency admission, and a fresh token. No automatic credential reuse. Attempt count and elapsed time are bounded; stale-generation events are ignored. |
| 11 | Backpressure | Bound audio frame size, outbound queue bytes, pending frames, event queue, and buffered duration. Pause/drop/fail behavior is explicit; unbounded browser or server buffers are forbidden. |
| 12 | Partial/interim results | Normalize provisional transcripts as replaceable, generation- and turn-scoped evidence. Consumers cannot treat an interim result as a final or execute irreversible actions from it without a separately defined policy. |
| 13 | Final results | A final result is provider-confirmed or locally finalized under a documented rule. Completion must preserve whether all approved audio was sent and whether finalization/flush was acknowledged. |
| 14 | Timing semantics | Record clock owner and measurement points: admission, socket open/ready, first audio sent, first partial, first final, finalize requested/confirmed, disconnect, and completion. Provider-reported timing remains separately labeled. |
| 15 | Provider events | A capability-specific adapter maps Deepgram wire events into a small versioned provider-neutral event union while retaining sanitized provider-event metadata only when useful. Unknown events are bounded and do not crash the session. |
| 16 | Normalized event contracts | Separate common lifecycle/transcript/error events from optional STT endpointing/turn, TTS audio/control, and Agent/tool events. Do not create one giant realtime provider interface. |
| 17 | Usage accounting | Reserve a conservative session envelope before connect; accumulate trusted audio/output/session units server-side where observable; reconcile without trusting browser-supplied duration; record uncertainty rather than inventing provider billable units. |
| 18 | Concurrency accounting | A durable lease is scoped to principal, provider, capability, session, and generation. It is acquired before issuance/connect and released idempotently on terminal state or bounded expiry. Reconnect cannot hold or mint unlimited leases. |
| 19 | Quota enforcement | Apply per-principal/session/IP controls at admission plus bounded incremental or time-slice checks for long sessions. A browser token cannot bypass quota once issued. |
| 20 | Provider spend admission | Require global and provider budgets, provider/capability policy, maximum session envelope, and emergency pause. Budget reservation must precede token issuance; reconciliation must fail safe when provider usage is unknown. |
| 21 | Evidence/tracing | Emit bounded records for admission, token issuance without value, socket generation, provider dispatch, normalized events/counts, usage checkpoints, terminal state, and failure class. Preserve correlation without storing raw audio or transcript by default. |
| 22 | Failure semantics | Normalize validation, policy denial, configuration, authentication, forbidden, quota, rate limit, timeout, malformed event, unsupported capability, buffer overflow, provider error, and internal failure. Raw upstream/auth bodies never escape. |
| 23 | Disconnect semantics | Distinguish requested close, provider close, network loss, authentication failure, idle timeout, server termination, and unknown abnormal close. Browser code 1006 alone is not a diagnosis. |
| 24 | Observability | Track bounded counts/durations, session and generation IDs, sanitized close/error class, token age, buffer pressure, reconnect count, and lease cleanup. Do not log tokens, permanent keys, audio, private transcripts, or arbitrary provider events. |
| 25 | Privacy/data retention | Raw audio and private transcript persistence default to off. Ephemeral memory is cleared on terminal state. Any retained trace has an explicit class, TTL, ownership/visibility, bounded size, and cleanup path. |
| 26 | Browser exposure | Temporary token only, held in memory and sent through the documented WebSocket subprotocol—not query strings, local storage, logs, analytics, URL history, or service-worker caches. The browser never sees a permanent key. |
| 27 | Abuse resistance | Same-site checks, authenticated principals where cost-bearing, trust tiers, burst/rate limits, one active issuance per admitted generation, bounded session/frames/reconnects, provider/global budgets, durable concurrency, audit aggregation, and kill switches. Automation is permitted only through explicit identity and scope. |

## Recommended future flow

```text
validated session request
  -> server identity and trust
  -> exact provider/capability policy
  -> quota + global/provider budget reservation
  -> durable session concurrency lease
  -> one connection generation
  -> short-lived provider token issuance
  -> browser or approved realtime worker opens socket
  -> capability adapter normalizes bounded events
  -> incremental usage/evidence checkpoints
  -> finalize/cancel/disconnect
  -> bounded reconciliation and lease cleanup
```

The browser-socket option minimizes media egress through ONE but exposes a replayable temporary credential to the client. A server/worker proxy centralizes enforcement and observability but adds media custody, hosting, scaling, latency, and cost. A later decision must verify the deployment platform's long-lived connection behavior and choose per capability; this memo does not assert that the current Vercel function architecture can safely own long-lived WebSockets.

## Minimum activation evidence

Before any hosted realtime path is enabled, a separate authorized stage must verify:

- current provider token scope, TTL, replay, concurrency, and revocation behavior;
- exact provider error/close/event schemas;
- deployment transport and maximum session behavior;
- trusted usage and reconciliation units;
- durable quota, budget, and concurrency behavior across reconnects;
- bounded buffers, cancellation, stale-generation rejection, and cleanup;
- privacy/retention and service-worker exclusion;
- provider-domain observability and incident kill switches; and
- deterministic fixtures plus a separately approved, capped live contract test.

## Official sources

Accessed **2026-08-29**:

- [Token-based authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication)
- [Grant a temporary token](https://developers.deepgram.com/reference/auth/tokens/grant)
- [Authentication](https://developers.deepgram.com/reference/authentication)
- [Using the Sec-WebSocket-Protocol](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol)
- [Live Speech to Text](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)
- [Endpointing](https://developers.deepgram.com/docs/endpointing)
- [Interim results](https://developers.deepgram.com/docs/interim-results)
- [Utterance end](https://developers.deepgram.com/docs/utterance-end)
- [Streaming Text to Speech](https://developers.deepgram.com/reference/text-to-speech/speak-streaming)
- [Voice Agent API](https://developers.deepgram.com/reference/voice-agent/voice-agent)
- [API rate limits](https://developers.deepgram.com/reference/api-rate-limits)

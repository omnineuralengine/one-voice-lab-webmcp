# API Studio Known Limitations

## Browser realtime diagnostics

- Browser JavaScript cannot read a failed WebSocket handshake response body and usually cannot read `dg-error` or `dg-request-id` handshake headers. The manually invoked Node diagnostic client is the supported deeper inspection path.
- Close code 1006 means the browser did not receive a normal close frame. It does not identify authentication, configuration, entitlement, network, or server behavior by itself.
- Request ID is shown only when Deepgram provides it in an accessible event. A missing request ID is displayed as unavailable, never fabricated.
- Timeline and Raw Events are session-memory diagnostics. They are cleared when a new session starts and are not persisted by API Studio.
- Transcript text and audio data are deliberately excluded from the shared diagnostic export. The dedicated Live Mic transcript UI remains ephemeral and is not part of that export.
- Fixture coverage proves visible sequencing, failure handling, sanitization, and cleanup without contacting Deepgram. A real two-turn audible Voice Agent session remains a separate manual verification requirement.

## General limitations

- Live Mic, Flux, streaming TTS, and Voice Agent retain provider-specific local
  or fixture-oriented WebSocket surfaces. They are not canonical realtime
  adapters, hosted token issuance is disabled, and this stage performed no live
  Deepgram verification. `/flux-observatory` retains its dedicated `/v2/listen`
  normalizer, reducer, timeline, dynamic Configure laboratory, local metrics,
  and deterministic replay without implying hosted or production readiness.
- API Studio's older general-purpose realtime PCM capture still uses the broadly
  compatible but deprecated `ScriptProcessorNode`. Flux Conversation
  Observatory has a separate AudioWorklet capture path with bounded buffering;
  this does not retroactively migrate API Studio, Live Mic, or Voice Agent.
- Tier 3 mutations never execute. Advanced mode is a review and training surface only.
- Official management role requirements are not uniformly machine-readable. The registry uses the least permissive practical role label and the server still treats Deepgram 401/403 as authoritative.
- Model enums and language availability change independently of this app. Canonical public discovery currently uses a bounded dated static STT/TTS catalog and reports availability as unknown rather than contacting Deepgram. Project/account-private discovery remains a compatibility surface and is not anonymously projected.
- TTS `pronunciation` is not exposed because it is not present in the current official single-request reference. Encoding/container/sample-rate/bitrate combinations still require reference validation and may be model-specific.
- Text Intelligence displays raw returned fields. The current official `/v1/read` response documents summary, topics, intents, and sentiments; entities are not fabricated when absent.
- Callback options can cause asynchronous delivery and may complicate local inspection. Use them only with a controlled HTTPS receiver.
- The health route reports safe local platform/readiness state and performs no provider credential or project probe. It therefore does not establish provider health, account entitlement, role scope, or live availability.
- Regional inference supports global, EU, and AU registry hosts. Whisper is excluded by the current EU/AU regional reference; management and token routes remain global-only here.
- Generated snippets are dependency-light reference examples. WebSocket Go and .NET examples intentionally leave library selection to Code Lab rather than silently adding a dependency.
- Successful fixture tests validate construction, safety, state, reducers, and cleanup—not a live paid Deepgram response. Every billable and realtime feature remains manual-smoke-test territory.

The request-response core convergence covers only static discovery,
prerecorded STT, and batch TTS/voice selection. Account-private discovery and
the provider-neutral realtime/session architecture are deferred. See
[`providers/DEEPGRAM.md`](providers/DEEPGRAM.md) and
[`providers/DEEPGRAM_REALTIME_ARCHITECTURE.md`](providers/DEEPGRAM_REALTIME_ARCHITECTURE.md).

See [Flux Conversation Observatory](FLUX_CONVERSATION_OBSERVATORY.md) for the
standalone contract and [Flux Provider Validation](FLUX_PROVIDER_VALIDATION.md)
for the retained-evidence gate.

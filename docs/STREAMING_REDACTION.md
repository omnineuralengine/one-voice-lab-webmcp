# Streaming Redaction

## Lifecycle

Realtime consumers must treat interim transcript state as mutable and sensitive.

```text
Audio started
→ interim transcript
→ generic [REDACTED]
→ more context evaluated
→ typed [PHONE_NUMBER_1]
→ final transcript
```

The fixture timeline in Redaction Lab is deterministic local teaching data modeled on documented behavior. It is not a captured production response or quality benchmark.

## Compatibility

Verified on 2026-07-16:

| Deployment | Prerecorded | Streaming |
| --- | --- | --- |
| Hosted API | Available languages, subject to model support | English only |
| Self-hosted | English only | English only |

Unsupported streaming language/redaction combinations are blocked before microphone permission or WebSocket creation. Other settings remain intact so the user can switch to English, choose prerecorded transcription, or disable redaction.

The project’s current Flux registry does not expose `redact`; Flux redaction is therefore marked Manual verification required and is not sent.

## Interim-event safety

- Do not persist unredacted interim text by default.
- Sanitize observability events and diagnostic exports.
- Assume application logs, traces, crash reports, and analytics can become retention systems.
- Preserve placeholder transitions without exporting original spans.
- Apply access and retention controls before forwarding events to an LLM or agent.

## `no_delay`

`no_delay=true` is shown as a redaction-performance tradeoff. The UI recommends `false` or omission when prioritizing stabilized redaction, but never silently rewrites a user’s advanced request.

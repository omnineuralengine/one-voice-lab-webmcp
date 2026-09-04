# Realtime Failure Diagnostics

The status strip answers what is happening now and what last succeeded. The Timeline preserves chronological canonical and sanitized raw events. A failure keeps a persistent banner visible and badges the Raw Events tab.

## Reading a failure

Failure descriptions separate evidence from inference:

- **Observed** means the event sequence proves the boundary, such as a socket that opened without a settings acknowledgement.
- **Likely** is reserved for a stage suggested by multiple observations, not a confirmed root cause.
- **Unknown** means the captured evidence cannot distinguish the cause.

The banner reports the human-readable summary, last successful state, close code and reason, timestamp, likely stage, request ID when present, browser limitation note, and next inspection action. It does not infer authentication, entitlement, schema, network, or provider failure from code 1006 alone.

## Close code 1006

API Studio displays:

> 1006 — Abnormal closure. The browser did not receive a normal close frame and may not expose the handshake response body.

1006 is a browser-observed abnormal closure, not a server close frame. Browser JavaScript generally cannot inspect the failed WebSocket handshake response body or `dg-error` and `dg-request-id` headers. Use the manually invoked server diagnostic client when those headers are needed.

## Diagnostic summary

“Copy diagnostic summary” exports protocol, current state, last successful state, request ID, close code/reason, and milestone labels/statuses/timestamps. It explicitly reports that credentials, audio, and transcripts were not persisted.

Sanitization happens before an event enters the shared store. The export and Raw Events omit:

- permanent API keys and temporary tokens
- Authorization and credential values
- raw microphone or synthesized audio
- transcript and response text
- personal data supplied as text

Request IDs, event types, byte counts, close diagnostics, and non-sensitive state metadata remain available.

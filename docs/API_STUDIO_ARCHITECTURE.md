# API Studio Architecture

## User value

API Studio turns the Deepgram reference into a deliberate learning loop: choose an official endpoint, configure only documented fields, inspect the effective request, execute through a narrow local boundary, and carry the result into the rest of the lab. The permanent credential stays on the local server.

## Smallest working architecture

```text
Browser API Studio
  |-- typed registry (safe metadata only)
  |-- local validation + sanitized request preview
  |-- generated examples with credential placeholders
  |
  | POST /api/deepgram/execute  (allowlisted REST only)
  | POST /api/deepgram/token    (hosted issuance disabled; local operator only)
  | GET  /api/deepgram/health   (safe local platform projection; no provider probe)
  v
Server-only policy and executor
  |-- resolve endpoint ID from registry
  |-- enforce method, path, query, body, content type, region, size, and timeout
  |-- add DEEPGRAM_API_KEY after validation
  |-- redact and return a structured inspector envelope
  v
Deepgram global / EU / AU allowlisted host
```

The endpoint workbench source of truth is [`src/lib/deepgram-endpoint-registry.ts`](../src/lib/deepgram-endpoint-registry.ts). Shared endpoint types are in [`src/types/deepgram-endpoint-registry.ts`](../src/types/deepgram-endpoint-registry.ts). Core public model discovery, prerecorded STT, and batch TTS compatibility operations delegate to the canonical provider adapters instead of maintaining a second core transport. No browser input can supply an upstream host, URL, method, header, or arbitrary path.

## Execution modes

- `server-rest`: the local executor constructs an allowlisted HTTPS request from registry metadata. Canonical public model discovery is static/network-free, while core prerecorded STT and batch TTS delegate through the shared provider adapters. Project/account management and other API Studio families remain bounded compatibility surfaces.
- `browser-websocket`: Flux, streaming TTS, and Voice Agent retain their browser transport design, but hosted temporary-token issuance is disabled. A local-only dedicated token route may be used for explicit operator development; the generic executor cannot mint tokens. PCM capture/playback and sockets are explicitly released on stop and unmount.
- `handoff`: realtime endpoints open an existing purpose-built lab so microphone, playback, socket lifecycle, and cleanup have one owner.
- `locked`: Tier 3 mutation requests can be configured and previewed, but are not sent in this release.

Prerecorded file upload uses the executor's multipart representation and is accepted only for `stt-prerecorded`. Paid transcription accepts verified PCM RIFF/WAV up to 10 MB and five minutes; JSON `stt-prerecorded` and all URL execution are disabled. JSON for other eligible operations remains limited to 1 MB, audio responses to 12 MB, and upstream calls to 45 seconds.

## Regional model

The registry defaults to `api.deepgram.com`. Core inference declares support for `api.eu.deepgram.com` and `api.au.deepgram.com` where the current official regional reference does. Management and token issuance remain global-only. A region is an enum, never a hostname string.

## State and persistence

Request configuration and run results live in React memory. Raw audio, generated audio, transcripts, tokens, and response bodies are not persisted. “Save Sanitized Experiment” is an explicit local action that stores endpoint/configuration metadata and outcome metadata only. Code Lab and Observatory handoffs reuse the app's existing typed launch contexts.

## Canonical core boundary

the Deepgram provider integration converged Deepgram static model/voice discovery, prerecorded STT,
batch TTS, and model-ID voice selection onto the shared provider kernel. The
canonical adapters own exact-operation policy, bounded inputs/responses,
sanitized errors, deterministic fixtures, and safely knowable dispatch evidence.
API Studio remains a client/compatibility workbench, not an alternate Deepgram
provider implementation.

Project/account-private discovery is intentionally not projected as public
catalog data. Streaming STT, Flux, streaming TTS, Voice Agent, browser sockets,
and temporary credentials remain outside the batch contracts. Hosted token
issuance stays disabled pending the provider-neutral session architecture in
[`providers/DEEPGRAM_REALTIME_ARCHITECTURE.md`](providers/DEEPGRAM_REALTIME_ARCHITECTURE.md).

## Scalable next version

The next safe realtime increment is an architecture decision, not an immediate
capture refactor. ONE first needs session-scoped authorization, connection and
spend admission, durable concurrency, token replay analysis, bounded
backpressure, reconnect semantics, event normalization, and evidence/cleanup.
Any later AudioWorklet migration remains subordinate to that session boundary.

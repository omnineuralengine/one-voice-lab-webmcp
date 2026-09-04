# API Studio Security

## Credential boundary

- `DEEPGRAM_API_KEY` is read only by server-only modules.
- `ELEVENLABS_API_KEY` is read only by the server-only ElevenLabs adapter and is sent upstream only as `xi-api-key`.
- `FISH_AUDIO_API_KEY` is read only by the server-only Fish Audio adapter and is sent upstream only as a Bearer credential.
- There is no public Deepgram credential environment variable.
- Existing local operator WebSocket experiments may use a short-lived token returned by `POST /api/deepgram/token` and the `bearer` WebSocket subprotocol. Hosted issuance is disabled; no browser token is available merely because a permanent key is configured.
- Permanent keys and temporary tokens are replaced with a fixed redaction string in previews, inspectors, saved experiments, errors, and logs.
- The token route uses `Cache-Control: no-store` and returns only `access_token` and `expires_in` on success.

Deepgram documents a 30-second default grant TTL and a requested range of 1 to
3600 seconds, but the grant carries broad `usage::write` access and a socket may
outlive token expiry. Official material does not establish the single-use,
replay, concurrent-socket, ONE-session-binding, or revocation semantics needed
for hosted issuance. Reconnect must therefore receive fresh ONE admission and a
fresh token. See
[`providers/DEEPGRAM_REALTIME_ARCHITECTURE.md`](providers/DEEPGRAM_REALTIME_ARCHITECTURE.md).

## Allowlist boundary

`POST /api/deepgram/execute` accepts an endpoint ID plus typed path/query/body values. It rejects:

- unknown endpoint IDs;
- method mismatches;
- `host` and `url` overrides;
- parameters not declared for that endpoint and location;
- unsafe path identifiers;
- unsupported regions and content types;
- WebSocket and handoff endpoints;
- all Tier 3 mutations;
- oversized JSON, media, and audio responses.

Upstream URLs are built only from the registry's protocol, path template, method, and a fixed regional host enum. Browser-supplied authorization headers are never forwarded.

Core public model discovery now resolves from a bounded static canonical
catalog and makes no provider request. The health route projects safe local
provider state and does not probe Deepgram projects, credentials, or account
entitlements. Project/account-private model discovery is not included in the
public provider projection.

For paid prerecorded Speech to Text, JSON and URL input are disabled in every environment. The only executable API Studio representation is a bounded multipart upload whose server-side admission parser accepts canonical uncompressed PCM RIFF/WAV, verifies the container structure, derives duration from trusted byte-rate and data-chunk fields, and rejects files over 10 MB or five minutes before quota or provider dispatch. The complete multipart body is capped at the file limit plus 64 KiB before parsing. Browser duration metadata is ignored for admission.

Other audio containers may still be selected for local preview and Audio Signal Lab inspection, but MP3, M4A, FLAC, Ogg, WebM, and AAC cannot enter a paid transcription path until ONE has a trusted server-side duration probe for them. The legacy Transcribe URL configuration surface is educational only; `/api/deepgram/transcribe-url` and JSON `stt-prerecorded` execution fail closed without consuming quota or provider credits.

## Mutation safety

Tier 3 entries show impact, required role, exact sanitized request, an Advanced Administration Mode toggle, and a per-endpoint typed phrase. Execution remains locked after confirmation in this release. Automated tests verify the lock and never call mutation endpoints.

## Data handling

Audio and transcript persistence are off by default. Playback uses an in-memory object URL that is revoked when replaced or unmounted. Explicit experiment saves omit credentials, token-like fields, source URLs, text/transcripts, raw response bodies, and audio.

## Error handling

The server returns stable local codes such as `unknown_endpoint`, `method_not_allowed`, `host_override_rejected`, `validation_failed`, `mutation_locked`, `upstream_timeout`, and `upstream_unavailable`. It preserves only allowlisted upstream headers, including Deepgram request IDs where available. Raw upstream authorization data is never included.

Canonical Deepgram STT/TTS adapters additionally normalize validation,
configuration, exact-operation policy denial, authentication/authorization,
quota, rate limit, timeout, malformed/oversized response, and upstream failure
classes. Provider bodies are read through explicit size bounds and are reduced
to allowlisted transcript/audio/evidence fields.

## Release secret audit

`npm run audit:secrets` scans source, public assets, and built browser assets for:

- public Deepgram, ElevenLabs, or Fish Audio key variable names;
- configured local provider-key values, without printing them;
- likely hard-coded `Authorization: Token ...` credentials.

The audit intentionally excludes `.env.local` from scanned artifacts. Never commit that file.

## ElevenLabs capability boundary

The separate `/providers/elevenlabs/api-studio` surface does not reuse the broad Deepgram endpoint workbench. It exposes only fixed, capability-specific application routes for models, voices, prerecorded Speech to Text, and Text to Speech. The server rejects arbitrary upstream URLs and headers, bounds JSON and upload sizes, normalizes upstream errors, and omits provider account metadata, voice preview URLs, samples, credentials, and raw authorization details.

No ElevenLabs request runs merely by visiting the page. Catalog loading is explicit, and TTS/STT require an additional human confirmation. ElevenLabs execution is always denied when `OPEN_LAB_MODE=true`; `OPEN_LAB_ELEVENLABS_ENABLED` cannot override that boundary and only controls non-Open-Lab local execution. The current per-session in-memory request guard is defense in depth only and may be isolated per server instance.

## Fish Audio capability boundary

`/providers/fish-audio/api-studio` uses fixed application routes for the documentation-backed TTS model headers, public voice-model listing, `POST /v1/tts`, and beta `POST /v1/asr`. It does not expose model creation, cloning, agents, administration, WebSockets, arbitrary URLs, or browser-supplied authorization headers. Anonymous catalog responses exclude private and unlisted voice metadata, author data, samples, and preview assets.

No Fish Audio request runs on page load. The current static model catalog is credential-free and makes no network request. Public-only voice discovery, selected-voice validation, TTS, and STT require operation-bound authorization from canonical provider/capability policy in addition to the existing admission, budget, concurrency, and legacy narrowing gates. A credential or `OPEN_LAB_FISH_AUDIO_ENABLED` value alone cannot authorize execution. Missing or mismatched policy and missing configuration fail before provider transport with a sanitized canonical error.

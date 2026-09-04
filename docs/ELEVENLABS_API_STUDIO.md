# ElevenLabs API Studio

Provider metadata verification date: **2026-08-27**.

ElevenLabs API Studio at `/providers/elevenlabs/api-studio` is a compatibility UI over ONE's canonical provider registration, normalized discovery, batch TTS, and prerecorded STT contracts. It is community-built and independent; it is not an official ElevenLabs product, endorsement, benchmark, or production-readiness claim.

`LIVE ELEVENLABS VERIFICATION: NOT PERFORMED`

## Canonical boundary

- The stable provider ID is `elevenlabs`.
- The implemented OVL surface is `discovery.models`, `discovery.voices`, `tts.batch`, `tts.voice-selection`, and `stt.prerecorded`.
- Provider-specific payloads terminate inside the server-only ElevenLabs client and normalization modules.
- Account-scoped model and voice results retain only canonical IDs, display names, implemented capabilities, safe language identifiers, pagination, and provenance. Arbitrary labels, previews, samples, descriptions, ownership, and account metadata are discarded.
- The shared API Studio component calls only same-origin generic provider routes. It does not construct an ElevenLabs transport.

## Credential and execution policy

The server reads `ELEVENLABS_API_KEY` through the shared credential boundary. Browser code never reads, receives, logs, or serializes it. Credential presence means only **configured, not runtime verified**.

Live execution requires the canonical provider policy and every applicable Stage 2 trust, quota, budget, concurrency, and global switch. Authorization is exact-operation bound:

- model discovery;
- voice discovery;
- batch TTS, with separate model and voice discovery proofs for catalog validation; and
- prerecorded STT.

A key, legacy switch, registration, fixture, UI state, or direct adapter call cannot independently authorize network work. The default provider policy remains fail closed.

## Input, response, and privacy controls

- No request runs on page load.
- Catalog actions require a deliberate click; TTS and STT require a separate explicit cost confirmation.
- TTS text is limited to 1,000 characters.
- STT accepts bounded uploads only, uses trusted server-side duration admission, and does not accept arbitrary URLs.
- Provider origins are fixed server-side.
- Upstream JSON, error bodies, and audio are bounded and cancellable.
- Generated audio uses `no-store` and a browser-session object URL.
- This route does not persist generated audio, uploaded audio, or transcripts.
- Errors and evidence expose only normalized, allowlisted fields.

## Provider documentation sources

- <https://elevenlabs.io/docs/api-reference/authentication>
- <https://elevenlabs.io/docs/api-reference/models/list>
- <https://elevenlabs.io/docs/api-reference/voices/search>
- <https://elevenlabs.io/docs/api-reference/text-to-speech/convert>
- <https://elevenlabs.io/docs/api-reference/speech-to-text/convert>

These sources establish provider-documented API shapes, not account entitlement, quality, latency, quota, cost, reliability, or availability.

## Local configuration

Use the server-only placeholder in an ignored local environment file:

```dotenv
ELEVENLABS_API_KEY=replace_with_your_actual_key
```

Do not add a `NEXT_PUBLIC_` prefix or commit environment files. A credential alone does not enable execution; canonical operational policy and cost gates must also permit the exact operation.

## Verification and deferral

- **Repository verified:** canonical registration, normalized discovery, server-only credential access, deterministic fixtures, operation-bound policy, bounded transport, sanitized errors/evidence, API Studio, and Evaluate integration.
- **Fixture verified:** four shared-contract fixtures execute without network access or credentials.
- **Live verified:** no.
- **Not implemented:** realtime STT, true streaming TTS delivery, voice cloning, agents/conversational AI, dubbing, sound effects, arbitrary proxying, and automatic execution.

The complete convergence record is [`providers/ELEVENLABS.md`](providers/ELEVENLABS.md).

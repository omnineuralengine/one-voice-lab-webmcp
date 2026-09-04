# ONE Voice Lab provider catalog

## Catalog policy

The catalog is a discovery inventory, not a claim of integration or quality. Each entry has a stable ID, group, entity kind, lifecycle, verification state, and—only when established by current official material—attributable capability metadata.

The following statements are intentionally independent:

- **Cataloged:** ONE recognizes the entity and reserves a stable internal ID.
- **Integrated:** installed code and applicable adapters exist.
- **Configured:** required server credential presence is established without exposing it.
- **Enabled:** administrator policy permits a runtime mode.
- **Healthy:** a safe current signal exists; configuration alone is not health.
- **Benchmark eligible:** the exact capability satisfies Stage 3 rules.
- **Publicly ranked:** a separate eligible public snapshot includes it.

An unverified catalog entry has an empty capability/source set. Catalog membership never creates an adapter, credential, budget, provider call, benchmark result, or rank.

## Current implemented and narrowly verified entries

Current operational defaults come from the Stage 4 migration. They are deployment state, not provider-performance evidence.

| Provider | ID | Kind / group | Integration truth | Default runtime policy | Default benchmark policy | Metadata verification |
| --- | --- | --- | --- | --- | --- | --- |
| Deepgram | `deepgram` | Speech provider / Core and immediate | Contract-tested canonical registration; static normalized model/voice discovery, prerecorded STT, batch TTS/voice selection, and four deterministic fixtures | Globally disabled by safe default; hosted realtime/token issuance disabled | Ineligible; fixtures are not public evidence | Verified official docs, 2026-08-29; ONE fixture verification only |
| ElevenLabs | `elevenlabs` | Speech provider / Core and immediate | Contract-tested canonical registration; normalized account-scoped model/voice discovery, batch TTS, prerecorded STT, and four deterministic fixtures | Globally disabled by safe default; runtime disabled | Ineligible; fixtures are not public evidence | Verified official docs, 2026-08-27; ONE fixture verification only |
| Fish Audio | `fish-audio` | Speech provider / Core and immediate | Installed; model, voice, prerecorded STT, and TTS adapters | Fixture-only access; runtime disabled | Fixture only | Verified official docs, 2026-08-27 |
| Cartesia | `cartesia` | Speech provider / Core and immediate | Contract-tested canonical registration; static normalized models, account-scoped normalized voices, batch TTS/voice selection, and three deterministic fixtures | Globally disabled by safe default; generic voice/TTS routes closed | Ineligible; fixtures are not public evidence | Verified official docs, 2026-08-26; ONE fixture verification only |
| Reson8 | `reson8` | Speech provider / Core and immediate | Fixture-validated STT adapters plus an isolated local verifier privately contract-verified for prerecorded, Realtime, and Turns STT; no application live adapter or credential value | Globally disabled; runtime disabled | Ineligible; fixture planning only | Provider-documented metadata reviewed 2026-08-28; ONE fixture and private contract verification; no production or benchmark verification |

Official sources:

- Deepgram: https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded, https://developers.deepgram.com/reference/text-to-speech/speak-request, https://developers.deepgram.com/reference/manage/models/list, and https://developers.deepgram.com/guides/fundamentals/token-based-authentication
- ElevenLabs: https://elevenlabs.io/docs/api-reference/introduction
- Fish Audio: https://docs.fish.audio/api-reference/introduction
- Cartesia: https://docs.cartesia.ai/
- Reson8: https://docs.reson8.dev/, https://docs.reson8.dev/api/speech-to-text/prerecorded/, https://docs.reson8.dev/api/speech-to-text/realtime/, and https://docs.reson8.dev/api/speech-to-text/turns/

### Deepgram core convergence state

Deepgram's installed provider entry now declares only the canonical core
request-response surface implemented by ONE: static model and voice discovery,
prerecorded STT, batch TTS, and model-ID-based voice selection. Static discovery
is dated, bounded, credential-free, and network-free. Project/account-private
model discovery is not part of the public projection and remains deferred.

| Evidence state | Deepgram status |
| --- | --- |
| Provider-documented | **Yes**, reviewed from official sources on 2026-08-29 |
| Canonical core adapters installed | **Yes**, for static discovery, prerecorded STT, and batch TTS/voice selection |
| Fixture-verified | **Yes**; four deterministic fixtures pass without credentials or network access |
| Live-verified | **No** |
| Hosted realtime/token issuance | **Disabled / deferred** |
| Benchmark-verified | **No** |
| Public benchmark eligible | **No** |

Realtime STT, Flux, streaming TTS, Voice Agent, microphone/session transport,
and temporary browser credentials require a future provider-neutral realtime
architecture. Official token documentation does not establish the replay,
single-use, concurrent-socket, session-binding, or revocation semantics ONE
requires for hosted issuance. Details are in `docs/providers/DEEPGRAM.md` and
`docs/providers/DEEPGRAM_REALTIME_ARCHITECTURE.md`.

### Cartesia core convergence state

Cartesia's installed provider entry now declares only the request-response
surface implemented by ONE: dated static Sonic model discovery, bounded
account-scoped voice discovery, batch TTS, and separate voice selection. The
generic projection includes only public-safe static models; account voices
remain private to authorized discovery.

| Evidence state | Cartesia status |
| --- | --- |
| Provider-documented | **Yes**, reviewed from official sources on 2026-08-26 |
| Canonical core adapters installed | **Yes**, for static/account-scoped discovery and batch TTS/voice selection |
| Fixture-verified | **Yes**; three deterministic fixtures pass without credentials or network access |
| Live-verified | **No** |
| Realtime/session surface | **Not implemented by ONE / deferred** |
| Benchmark-verified | **No** |
| Public benchmark eligible | **No** |

Cartesia required no new shared provider abstraction. Its API version, Sonic
aliases, account voice selection, and raw 24 kHz PCM remain explicit adapter
semantics. Details are in `docs/providers/CARTESIA.md` and
`docs/providers/INITIAL_PROVIDER_CONVERGENCE_ASSESSMENT.md`.

### Reson8 provider-documented capability targets

The catalog records normalized provider-documented targets for prerecorded STT, realtime STT, partial and final transcripts, diarization, word and utterance timestamps, turn-aware STT, language selection/detection, multilingual transcription, per-word confidence for prerecorded/realtime, phrase bias, phrase-collection custom vocabulary, turn detection, and hosted deployment. Only the capabilities registered to a fixture adapter are integration-supported; hosted deployment remains metadata-only. Detailed wire-level options such as pattern recovery remain documented onboarding inputs rather than broad canonical claims.

| Evidence state | Reson8 status |
| --- | --- |
| Provider-documented | **Yes**, reviewed from official sources on 2026-08-28 |
| Adapter installed | **Yes, fixture-only in the application**; the isolated manual verifier is not registered or enabled |
| Fixture-verified | **Yes**; Reson8-specific deterministic fixtures pass the shared contract kit without network access |
| Live-verified | **Yes, private contract only**; one bounded prerecorded request and one bounded Realtime/Turns session each passed after applicable remediations. This is not production, reliability, performance, or benchmark evidence. |
| Benchmark-verified | **No** |
| Benchmark eligible | **No** |

Applicable fixture-backed capabilities use an adapter integration path while remaining benchmark ineligible. Provider documentation and deterministic normalization fixtures are not runtime-health, live-contract, accuracy, latency, or performance evidence.

The detailed evidence inventory, transport recommendation, unresolved questions, and ordered activation gates are in `docs/providers/RESON8.md`. The shared workflow remains in `docs/PROVIDER_ONBOARDING.md`.

## Core and immediate

| Name | ID | Status | Capability claims |
| --- | --- | --- | --- |
| Deepgram | `deepgram` | Canonical core contract tests passed; live verification not performed | Static model/voice discovery, prerecorded STT, batch TTS, and voice selection are fixture-verified; hosted realtime/token issuance and public benchmark eligibility remain disabled |
| ElevenLabs | `elevenlabs` | Canonical contract tests passed; live verification not performed | Account-scoped discovery, batch TTS, voice selection, and prerecorded STT are fixture-verified; operationally disabled by default and public benchmark ineligible |
| Fish Audio | `fish-audio` | Installed | Derived from installed manifest/adapters and cited docs; operationally disabled by default |
| Cartesia | `cartesia` | Canonical contract tests passed; live verification not performed | Static model discovery, account-scoped voice discovery, batch TTS, and voice selection are fixture-verified; generic invocation is closed and public benchmark eligibility remains disabled |
| Reson8 | `reson8` | Fixture validated and privately contract-verified; official metadata reviewed 2026-08-28; application live use disabled | Narrow provider-documented STT targets with fixture-verified normalization and one controlled private contract pass per STT capability; production and benchmark verification false |
| OpenAI | `openai` | Catalog only, unverified | None recorded |
| Soniox | `soniox` | Catalog only, unverified | None recorded |
| Mistral Voxtral | `mistral-voxtral` | Catalog only, unverified | None recorded |

## Benchmark anchors

All entries below are catalog only, unverified, globally disabled, benchmark ineligible, and have no recorded capability claims or source URLs in Stage 4.

| Name | ID |
| --- | --- |
| AssemblyAI | `assemblyai` |
| Speechmatics | `speechmatics` |
| Gladia | `gladia` |
| Rev AI | `rev-ai` |
| Google Cloud and Gemini Live | `google-cloud-gemini-live` |
| Microsoft Azure Speech and Voice Live | `microsoft-azure-speech` |
| AWS Transcribe, Polly, and Nova Sonic | `aws-voice-ai` |
| Groq | `groq` |
| NVIDIA Riva and Speech NIM | `nvidia-riva-speech-nim` |

## Specialist voice

All entries below are catalog only, unverified, globally disabled, benchmark ineligible, and have no recorded capability claims or source URLs in Stage 4.

| Name | ID |
| --- | --- |
| Rime | `rime` |
| Hume AI | `hume-ai` |
| Resemble AI | `resemble-ai` |
| Inworld | `inworld` |
| LMNT | `lmnt` |
| Smallest AI | `smallest-ai` |
| CAMB.AI | `camb-ai` |
| Murf | `murf` |
| Neuphonic | `neuphonic` |
| PlayHT | `playht` |
| xAI | `xai` |

## Local and self-hosted

These are classified as local runtimes rather than hosted speech-provider integrations. All are catalog only, unverified, globally disabled, benchmark ineligible, and claim-free in Stage 4.

| Name | ID |
| --- | --- |
| Whisper | `whisper` |
| faster-whisper | `faster-whisper` |
| whisper.cpp | `whisper-cpp` |
| Local or open Voxtral | `voxtral-local` |
| NVIDIA Riva private deployment | `nvidia-riva-private` |
| Piper | `piper` |
| Kokoro | `kokoro` |
| Chatterbox | `chatterbox` |

## Voice-stack infrastructure

These products may later belong in a Voice Stack area. They are not speech-model providers and must not be ranked as such. All are catalog only, unverified, globally disabled, benchmark ineligible, and claim-free in Stage 4.

| Name | ID |
| --- | --- |
| LiveKit | `livekit` |
| Pipecat | `pipecat` |
| Daily | `daily` |
| Vapi | `vapi` |
| Retell | `retell` |
| Bland AI | `bland-ai` |
| Voiceflow | `voiceflow` |
| Twilio | `twilio` |
| Telnyx | `telnyx` |
| Agora | `agora` |
| SignalWire | `signalwire` |
| Vonage | `vonage` |
| Voximplant | `voximplant` |

## Evaluation interoperability

These are evaluation systems, not speech providers. They remain separate from the provider ranking path. All are catalog only, unverified, globally disabled, benchmark ineligible, and claim-free in Stage 4.

| Name | ID |
| --- | --- |
| DeepEval | `deepeval` |
| Coval | `coval` |
| Cekura | `cekura` |

DeepEval's separate architecture decision remains **B — document compatibility and defer implementation**. Catalog membership adds no dependency or data egress.

## Lifecycle and promotion rules

The default for catalog-only entries is:

```text
discovery: cataloged
integration: adapter-missing
access: globally-disabled
runtime: disabled
health: unknown or disabled
benchmark: ineligible
```

Promotion requires the provider onboarding checklist. In particular:

- credentials received does not imply configured;
- configured does not imply healthy or enabled;
- enabled does not imply benchmark eligible;
- benchmark eligible does not imply publicly ranked; and
- user preference never changes any of these states.

## Metadata maintenance

When an entry is reviewed:

1. use current official sources;
2. record the source title, HTTPS URL, exact verification date, and scope;
3. distinguish provider-documented support from installed/ONE-verified support;
4. record uncertainty and model/region applicability;
5. avoid subjective or sensitive voice-trait inference;
6. do not add pricing without versioned attributable pricing metadata; and
7. update or remove stale claims without mutating historical benchmark snapshots.

No automated provider polling or unbounded metadata history is introduced. Public model/voice reads remain curated or bounded-cache backed and must not expose account-scoped data.

## Deferred catalog work

- verifying and sourcing the claim-free catalog entries;
- integrating any catalog-only provider;
- credential collection or provider outreach workflows;
- a provider marketplace or sponsorship workflow;
- voice-stack ranking;
- evaluation-system integration;
- production policy promotion; and
- public ranking without Stage 3 eligibility and integrity review.

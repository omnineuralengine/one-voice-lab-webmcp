# Multilingual Transcribe URL Samples

## Recognition is not translation

The **Spoken language** setting tells Deepgram which language is present in the audio. A matching request returns a transcript in that same language.

- English speech + English recognition produces an English transcript.
- Italian speech + Italian recognition produces an Italian transcript.
- English speech + Italian recognition may produce empty or incorrect output.
- Translating English to Italian is a separate workflow: English STT, then a translation system, then Italian text.

Auto-detect uses the documented prerecorded `detect_language=true` option and omits the fixed `language` query parameter. When Deepgram returns `results.channels[].detected_language`, the lab displays it as measured response metadata.

## Official sample sources

The sample catalog has two visibly different sources:

1. **Prerecorded speech examples** are explicitly reviewed Deepgram-hosted tutorial or documentation clips already used by the repository. The current retained example is the English Bueller clip.
2. **Aura samples** come from the read-only public model-list endpoint: `GET https://api.deepgram.com/v1/models?include_outdated=false`. The local `/api/deepgram/sample-audio` route examines only the returned `tts` models and publishes a narrow sanitized subset.

For an Aura entry, the browser may receive only:

- canonical model and display names;
- supported language mapped to a recognition code;
- accent;
- `metadata.sample` after HTTPS validation against the reviewed official metadata hosts (`static.deepgram.com` and the currently returned `cdn.sanity.io` asset host);
- a small set of characteristics/tags.

The browser never receives the raw model response, Authorization, an API key, project identifiers, or other account metadata. The catalog request is read-only and does not submit audio for transcription.

Official references:

- [List All Available Models](https://developers.deepgram.com/reference/manage/models/list)
- [Aura voices and languages](https://developers.deepgram.com/docs/tts-models)
- [Language Detection](https://developers.deepgram.com/docs/language-detection)
- [Prerecorded transcription reference](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded)

## Synthesized audio is not a natural-speech benchmark

Aura sample WAVs are speech synthesized by a TTS model. They are useful for demonstrating:

- matching an audio language to an STT language setting;
- request construction;
- response paths;
- Unicode transcript rendering;
- deliberate mismatch behavior.

They do not represent natural microphone acoustics, accents in the population, interruptions, background noise, channel effects, or conversational variability. Do not use one TTS sample to claim general STT accuracy.

## Adding another verified sample

For an Aura voice, no URL should be typed into the client catalog. Instead:

1. Confirm the voice/language in the official Aura documentation.
2. Confirm the model-list response supplies an HTTPS `metadata.sample` on a reviewed official metadata asset host. Add a new host to the narrow server allowlist only after verifying it is returned by the official model endpoint.
3. Add or update the language mapping only if the STT recognition code is verified.
4. Add a mock model-metadata fixture covering the new language.
5. Verify selection changes only local form state and sends no transcription request.

For a natural/prerecorded example:

1. Verify the URL appears in current official Deepgram documentation or an approved repository example.
2. Add it to `CURATED_PRERECORDED_SAMPLES` with source, spoken language, source type, verification status, and learning note.
3. Do not add an expected transcript unless the text is documented and verified.

## Languages without a matching hosted sample

The sample catalog is not the STT support matrix. Deepgram STT may support a language even when current public model metadata has no matching hosted Aura sample.

For those languages, use one of the explicit alternatives:

- record matching speech with the Live Mic module;
- upload matching audio in File Transcription;
- provide a public audio URL whose spoken language is known;
- return to Live Observatory for a controlled microphone run.

Availability in the UI is derived from the sanitized model metadata returned for the current local environment. It is never hardcoded as a promise that every language will always have a sample.

# Live Mic multilingual recognition

## What changed

Live Mic previously inherited the app-level default `language=en`. The WebSocket builder always emitted that value, and the Live Mic surface had no language state to replace it before connecting. Non-English speech was therefore sent to an English Nova-3 configuration unless another module had already changed the shared language.

Live Mic now snapshots a typed recognition configuration before it requests microphone permission, requests a temporary token, or opens a WebSocket. Selector changes never start a request. A change during an active session requires an explicit stop-and-restart decision; the recorder, tracks, socket, timers, token reference, correlation state, and stale-event generation are cleared before the replacement session starts.

## Recognition modes

### Known spoken language

The stable Nova-3 path uses:

```text
wss://api.deepgram.com/v1/listen?model=nova-3&language=<verified-code>&...
```

The selector is derived from the central Nova-3 registry in `src/lib/deepgram-languages.ts`. The registry records model compatibility, streaming compatibility, official documentation, and the last verification date. Examples include Italian `it`, Thai `th`, and Japanese `ja`.

This is recognition, not translation. “Configured spoken language: Italian” means the client requested Italian recognition; it is not a detected-language claim.

### Nova-3 multilingual / code-switching

The stable multilingual path uses `model=nova-3&language=multi`. Its verified set is English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, and Dutch. It does not mean every Nova-3 monolingual language.

When a Deepgram result contains word-level language information, Live Mic labels it “Observed language from Deepgram event,” preserves it in the sanitized inspector, and sends it to the Observatory with measured provenance. No language is invented when the event omits that field.

### Flux multilingual

Flux is intentionally not wired into this Live Mic component. The repository’s stable client parses the v1 Results lifecycle and sends 250 ms MediaRecorder chunks. Flux uses `/v2/listen`, `flux-general-multi`, optional repeated `language_hint` values, different turn events, and different recommended capture timing. A partial Flux connection would make the working Nova path less reliable.

The UI therefore links to the Applied Voice Systems turn-taking lab and clearly labels Flux as deferred. Enabling it requires a verified v2 event parser, Flux-specific lifecycle tests, appropriate chunk timing, and complete cleanup/correlation coverage. Nova-3 never receives `language_hint`; Flux must not use `language=multi`.

## Why streaming `detect_language` is not used

Deepgram’s language-detection documentation states that general Language Detection is not currently supported for live streaming and recommends multilingual models for realtime multilingual handling. Live Mic therefore uses exactly one of:

- fixed `language=<code>` for a known Nova-3 language;
- `language=multi` for Nova-3 multilingual/code-switching;
- a future verified Flux v2 implementation using `flux-general-multi` and optional `language_hint`.

## Endpointing and browser audio

The existing 300 ms endpointing value remains unchanged. It is visible as a responsiveness/segmentation choice, not a universal optimum. Interim results and VAD events remain enabled on the first bounded attempt.

Browser MediaRecorder produces containerized WebM/Opus where supported. Live Mic continues to omit raw PCM `encoding` and `sample_rate` parameters for containerized audio. The five-second upload fallback remains available outside the Observatory and uses the effective selected language.

## Italian manual test

1. Open **Live Mic**.
2. Under **Try your native language**, select **Italian**.
3. Verify the effective configuration shows `nova-3`, Italian, `it`, and `WSS /v1/listen`.
4. Verify no permission prompt or request occurs from selecting the language.
5. Press **Start Live Mic** and approve the existing billable-operation confirmation when using the Observatory.
6. Say: “Ciao, sto provando la trascrizione in tempo reale. Vorrei sapere come il sistema gestisce le pause e le correzioni.”
7. Inspect interim/final transcript events and confirm the sanitized endpoint contains `language=it`.
8. Treat the transcript as observed output, not a guaranteed expected transcript or an accuracy score.
9. Press **Stop** and confirm the microphone indicator turns off.

## Multilingual/code-switching manual test

1. Select **Nova-3 multilingual / code-switching** while stopped.
2. Confirm the preview contains `language=multi` and no fixed language or `detect_language` parameter.
3. Start explicitly, then speak a short phrase that switches only among the documented multilingual set.
4. Inspect interim/final results. If Deepgram returns word language fields, confirm they appear as measured observed languages; if absent, confirm the UI says unavailable.
5. Stop the session. Do not infer general multilingual accuracy from one run.

## Adding or verifying a language

Use only the official [Deepgram Models and Languages Overview](https://developers.deepgram.com/docs/models-languages-overview/) and verify that the exact code supports Nova-3, streaming, and `/v1/listen`. Update the single central registry and its verification date; do not add a component-local language array. Update mock tests for the endpoint and selector. Production availability should be rechecked when Deepgram documentation changes.

## Credit and security behavior

- No request runs on mount, selector change, quick-select, or documentation navigation.
- The user must press Start; Observatory sessions retain their additional confirmation, 60-second limit, and single-attempt behavior.
- `DEEPGRAM_API_KEY` remains server-side. The browser receives a short-lived token only for the active connection.
- Tokens and Authorization values are redacted from the endpoint, inspector, events, storage, logs, and exports.
- The endpoint URL contains model/language configuration only—never the key or temporary token.
- Automated tests mock token, microphone, MediaRecorder, WebSocket, and Deepgram events and consume no credits.

Last official-doc verification: 2026-07-14.

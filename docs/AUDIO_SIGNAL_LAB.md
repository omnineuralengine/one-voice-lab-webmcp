# Audio Signal Lab

## Purpose

Audio Signal Lab is the local-first bridge between audio engineering and speech AI. Its thesis is: **before tuning a speech model, understand the signal the model actually received.** The module analyzes microphone, file, sample-library, and generated-fixture audio without submitting anything to Deepgram automatically.

## Capabilities

- Explicit microphone permission, device selection, actual track settings, waveform, RMS, peak, approximate dBFS, clipping, silence, browser-derived spectrum, recorder MIME, chunk timing, and cleanup.
- Local silence, tone, low-level tone, clipped tone, deterministic noise, and sweep fixtures.
- Copied offline variants: original, low gain, digital clipping, added noise, mono, approximate telephony bandwidth, resampling, and long/short chunk visualization.
- Header-based format inspection for common containers, raw-audio handling, and effective Deepgram configuration guidance.
- Evidence-based health diagnoses that state evidence, importance, likely symptom, engineering check, confidence, and provenance.
- A guarded original-versus-variant comparison. The dialog states that two billable STT requests will occur. WER remains unavailable without confirmed reference text.
- Aggregated Observatory events, DAW teaching, deterministic issue classification, signal-flow ownership, Code Lab examples, and Questline links.

## Measurement limits

Browser meters are engineering indicators, not calibrated acoustic instruments. RMS, peak, dBFS, FFT bins, dominant frequency, silence thresholds, and clipping counts depend on the browser audio graph, window size, device driver, operating-system processing, and track constraints. Requested constraints are not proof that the device honored them. Browser energy is not Deepgram VAD, endpointing, or turn detection, and a healthy waveform does not predict transcription accuracy.

## Formats

- **Container:** a wrapper such as WAV, WebM, Ogg, or MP4 that carries audio and metadata.
- **Codec/encoding:** a sample representation or compression scheme such as linear PCM, Opus, MP3, mu-law, or A-law.
- **Raw audio:** headerless samples. A valid request needs explicit encoding, sample rate, and channels.

The inspector uses byte signatures where possible and does not claim a codec from the filename alone. For supported self-describing containers, the lab omits contradictory raw `encoding`, `sample_rate`, and `channels` parameters. For raw audio, it refuses to build an effective configuration until those facts are supplied.

## Privacy and lifecycle

Microphone audio is not persisted. Uploads and generated fixtures remain in the current browser workflow; variants are copied in memory. Navigating away, stopping, resetting, or unmounting stops all media tracks, disconnects graph nodes, cancels animation frames, stops recording, and closes the `AudioContext`. Monitoring is not connected and remains off. Summary export excludes raw audio, credentials, tokens, and transcript data by default.

## Observatory integration

The module emits sanitized `audio.*` events with `measured`, `derived`, `simulated`, or `human-rated` provenance. High-frequency analysis frames are not dispatched. Only threshold crossings, interval/final summaries, fixture/variant actions, inspection, and explicit experiments enter the Observatory. STT stages pulse only for an actual confirmed comparison.

## Known limitations

- Container/codec detection is intentionally conservative and not a replacement for `ffprobe` or a full demuxer.
- The telephony variant is a browser band-limiting approximation, not a PSTN benchmark; it excludes real codecs, packet loss, jitter, and network artifacts.
- Resampling is a lightweight offline demonstration, not mastering-grade sample-rate conversion.
- Browser recording MIME type and available constraints vary by browser and platform.
- Live Deepgram behavior is ready for the documented user-run check; automated validation uses mocks and zero credits.

See [DAW_TO_VOICE_AI.md](DAW_TO_VOICE_AI.md), [AUDIO_SIGNAL_EXPERIMENTS.md](AUDIO_SIGNAL_EXPERIMENTS.md), and [AUDIO_SIGNAL_LAB_MANUAL_TESTS.md](AUDIO_SIGNAL_LAB_MANUAL_TESTS.md).

## Official Deepgram references

- [Supported audio formats](https://developers.deepgram.com/docs/supported-audio-formats)
- [Determine live-stream audio format](https://developers.deepgram.com/docs/determining-your-audio-format-for-live-streaming-audio)
- [Encoding](https://developers.deepgram.com/docs/encoding) and [sample rate](https://developers.deepgram.com/docs/sample-rate)
- [Multichannel versus diarization](https://developers.deepgram.com/docs/multichannel-vs-diarization)
- [Endpointing](https://developers.deepgram.com/docs/endpointing)
- [Audio preprocessing and barge-in](https://developers.deepgram.com/guides/deep-dives/audio-preprocessing-barge-in)
- [Voice Agent echo cancellation](https://developers.deepgram.com/docs/voice-agent-echo-cancellation)

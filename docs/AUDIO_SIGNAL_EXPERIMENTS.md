# Audio Signal Experiments

## Safe workflow

1. Load or record a short representative fixture.
2. Inspect format and signal health; record what is measured versus inferred.
3. Write a narrow hypothesis.
4. Create one copied offline variant. The original is immutable.
5. Preview both locally. No Deepgram request occurs during transformation.
6. If STT evidence is necessary, select one verified model, spoken language, and shared parameter set.
7. Review the confirmation: two billable prerecorded STT requests, source durations, and settings.
8. Run once, inspect request IDs, timings, transcript diff, sanitized responses, and signal summaries.
9. Calculate WER only after supplying and confirming ground-truth reference text.
10. Record observation, audio-layer interpretation, transcription-layer interpretation, evidence, limitation, and next test.

## Presets and interpretation

- **Original / untouched:** control condition.
- **Low gain:** moves speech toward the noise floor without changing the original.
- **Digital clipping:** flattens peaks; useful for studying lost transient/consonant information.
- **Added background noise:** controlled deterministic noise, not a claim about a real room.
- **Mono conversion:** demonstrates channel collapse; source channel identity may be lost.
- **Telephony-bandwidth simulation:** approximate browser band limit only. Real PSTN audio also includes codecs, companding, packet behavior, noise, and network artifacts.
- **Resampled fixture:** simple local resampling demonstration, not production conversion quality.
- **Long versus short chunking:** visualizes timing/grouping and does not rewrite the proven Live Mic transport.

## Interpretation guardrails

- Signal-health heuristics do not predict Deepgram accuracy.
- Transcript disagreement is not an accuracy score.
- WER requires a trustworthy ground-truth reference and is only one metric.
- Keep language, model, and STT settings identical in an audio-layer A/B test.
- Never infer a codec from a filename alone.
- Do not add raw-audio parameters to a supported self-describing container.
- Do not repeat billable trials casually; use local fixtures and mocks during development.

# Audio Sample Library

## Provenance and privacy boundary

The repository contains 16 MP3 files in `public/samples/`. The same files also appear in the preserved `handoff/Deepgram-Voice-Lab-Applied-Engineering-2026-07-09/` snapshot; those are historical copies, not a second source library.

Repository evidence shows that every current `public/samples/*.mp3` file was generated for this project by `scripts/generate-sample-audio.mjs`. That script reads project-authored fictional text from `src/lib/sample-scenarios.json`, requires explicit confirmation before calling Deepgram Aura TTS, and writes the returned MP3 bytes. The files are synthetic speech, not human recordings. The source scripts contain fictional identifiers and no known personal information.

License/ownership statement applying to every file below: there is no separate third-party recording license because no recording was imported. The project authored the input scripts and generated the output under its Deepgram account. Use and redistribution remain governed by the project's Deepgram account terms; redistribution rights were not independently re-evaluated during this change. The spoken output was not independently transcribed during this audit, so this documentation does not claim a word-for-word content verification.

## Existing file inventory

Metadata was measured locally with `ffprobe` 8.1.2. All files are MP3, mono, 24 kHz synthetic speech.

| File | Duration | Size | Personal/unknown content assessment | Current use |
|---|---:|---:|---|---|
| `automotive-service.mp3` | 19.584 s | 117,504 B | Fictional VIN-style placeholder; no known personal data | Existing Sample Library and Audio Signal Lab |
| `ecommerce-return.mp3` | 20.976 s | 125,856 B | Fictional order/SKU identifiers; no known personal data | Existing Sample Library and Audio Signal Lab |
| `education-advising.mp3` | 14.784 s | 88,704 B | Fictional course codes; no known personal data | Existing Sample Library and Audio Signal Lab |
| `fintech-fraud-alert.mp3` | 21.816 s | 130,896 B | Fictional card digits and merchant; no known personal data | Existing Sample Library and Audio Signal Lab |
| `healthcare-scheduling.mp3` | 19.128 s | 114,768 B | Script explicitly says fictional; no real patient data | Existing Sample Library and Audio Signal Lab |
| `italian-customer-support.mp3` | 17.904 s | 107,424 B | Fictional invoice identifier; no known personal data | Existing library plus curated Upload sample |
| `italian-travel-booking.mp3` | 16.224 s | 97,344 B | Fictional booking code; no known personal data | Existing Sample Library and Audio Signal Lab |
| `japanese-product-support.mp3` | 19.728 s | 118,368 B | Synthetic, but source JSON displays encoding corruption in the current terminal audit | Existing Sample Library only; excluded from curated Upload list |
| `legal-intake.mp3` | 21.744 s | 130,464 B | Script explicitly says fictional; no known personal data | Existing Sample Library and Audio Signal Lab |
| `logistics-delivery-exception.mp3` | 18.576 s | 111,456 B | Fictional operational identifiers; no known personal data | Existing Sample Library and Audio Signal Lab |
| `media-podcast-clip.mp3` | 11.088 s | 66,528 B | Neutral project-authored script; no identifiers | Existing library plus curated Upload sample |
| `restaurant-reservation.mp3` | 11.328 s | 67,968 B | Fictional phone-number suffix and allergy note | Existing Sample Library and Audio Signal Lab |
| `retail-inventory.mp3` | 18.096 s | 108,576 B | Fictional stores/product; no known personal data | Existing Sample Library and Audio Signal Lab |
| `saas-webhook-support.mp3` | 16.896 s | 101,376 B | Fictional customer identifier; no known personal data | Existing library plus curated Upload sample |
| `spanish-customer-service.mp3` | 11.544 s | 69,264 B | Fictional billing scenario; no known personal data | Existing library plus curated Upload sample |
| `travel-hospitality.mp3` | 17.736 s | 106,416 B | Fictional confirmation code; no known personal data | Existing Sample Library and Audio Signal Lab |

The files are safe to retain in this repository based on their generator and fictional source manifest. They should not be represented as public-domain or independently relicensed assets.

## Curated Upload Audio samples

`src/data/audio-samples.ts` exposes four inspected files. The list is intentionally compact and uses the existing `/samples/` convention rather than duplicating binaries in `/audio-samples/`.

| Sample | Measured characteristic | Recommended experiment |
|---|---|---|
| Polished English speech | Mono, 24 kHz, peak -4.5 dBFS | Fixed English versus language detection |
| Technical English speech | Mono, 24 kHz, peak -1.8 dBFS without a full-scale peak | Technical terms and smart formatting |
| Italian customer support | Mono, 24 kHz, peak -4.1 dBFS | `language=it` versus language detection |
| Spanish customer support | Mono, 24 kHz, peak -8.3 dBFS | `language=es` versus language detection |

No existing file is labeled as background noise, clipped audio, silence/long pause, or stereo/multichannel. Those characteristics were not established by the asset audit. The Japanese sample is not promoted until its source-text encoding is corrected and re-verified.

Selecting a curated sample fetches the public asset, creates an in-memory `File`, and sends it through the same signature-aware validation and preview path as a user upload. Selection never starts Deepgram execution.

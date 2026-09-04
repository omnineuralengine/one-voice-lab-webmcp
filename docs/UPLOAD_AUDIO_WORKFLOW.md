# Upload Audio Workflow

## Supported selection paths

Upload Audio accepts one file through:

1. Click or keyboard activation of the bounded drop zone.
2. A file dropped directly on that drop zone.
3. An inspected bundled sample selected from **Try a sample**.

The page itself is not a drop target. Drop handlers prevent the browser's default file-open navigation.

## Validation

All three paths call `validateAudioFile` in `src/lib/audio-file-policy.ts`. The server transcription path applies the same function again before reading and forwarding bytes.

Supported formats are WAV, MP3, M4A, FLAC, OGG, WebM, and AAC. Validation checks:

- a supported MIME type;
- a supported extension;
- a matching container/file signature;
- zero-byte files;
- duplicate selection;
- the active environment's byte limit;
- whether the first bytes can be read.

An empty or generic MIME value may use a conservative extension fallback only when the file signature agrees. The UI labels that result as inferred. A recognized MIME value that conflicts with the file signature is rejected.

Selection and local-preview limits remain format-specific to the existing UI. Paid transcription has a narrower server boundary: canonical uncompressed PCM RIFF/WAV only, at most 10 MB and five trusted minutes in every environment. Formats without a trustworthy server-side duration result are rejected before quota or provider dispatch.

## Preview and cleanup

After validation the module shows filename, normalized MIME type, detected format, byte size, duration when browser metadata is available, and a native audio player. Audio does not autoplay.

The preview URL is an in-memory object URL. It is revoked when the file is replaced, removed, the Upload component unmounts, or navigation hands the file to Audio Signal Lab. Removing a file returns focus to the drop zone.

## Execution boundary

Selection, validation, sample fetching, metadata loading, preview, replacement, removal, and Audio Signal Lab handoff make zero Deepgram calls. Only the visible **Transcribe File** action constructs multipart form data and posts to `/api/deepgram/transcribe-file`.

The route keeps the permanent key server-side. Before multipart parsing, it bounds the complete request body to 10 MB plus 64 KiB of form metadata. After the existing signature checks, the shared server-only admission parser verifies PCM RIFF/WAV structure, computes duration from decoded byte-rate fields, rejects malformed or unsupported media, and converts duration to whole-second quota units. Only then can durable user, provider, global-budget, and concurrency admission run. Request inspectors include sanitized file metadata, never audio bytes. Uploaded bytes, temporary object URLs, filenames, caller-supplied duration, and transcript text are not placed in `localStorage`, diagnostic exports, or the curated manifest.

URL transcription is disabled, including curated URLs, until ONE can establish trusted duration and integrity before provider dispatch. Existing URL-oriented learning surfaces do not indicate live availability; both the dedicated URL route and the generic JSON executor return a fail-closed unavailable response without consuming provider credits.

## Audio Signal Lab handoff

**Use in Audio Signal Lab** places the selected `File` in the existing control-room component state, navigates to Audio Signal Lab, and immediately consumes and clears the handoff reference. Audio Signal Lab decodes and inspects the file locally. It still requires its existing separate confirmation before any comparison request can run.

The handoff is in-memory only. It does not serialize audio into a URL, browser storage, route state, or an export.

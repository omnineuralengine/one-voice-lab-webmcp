# Redaction Lab

Redaction Lab is a local-first Applied Engineering surface for designing transcript-governance policies, inspecting exact Deepgram request values, and carrying an intentional configuration into compatible Speech-to-Text workflows.

> Redaction is not simply a checkbox on transcription. It changes how applications should treat interim events, final transcripts, logs, exports, downstream AI systems, and the original audio that remains outside the redacted text.

## Scope

Deepgram redaction changes transcript output. It does not alter, mute, remove, or sanitize the original audio. The application must govern audio access, retention, deletion, and downstream delivery independently.

The lab provides:

- verified profiles and a searchable 55-entity catalog;
- deterministic fictional fixtures, not live Deepgram results or benchmarks;
- before/after transcript views and typed placeholders;
- a streaming placeholder lifecycle fixture;
- exact repeated query serialization;
- explicit handoffs to Transcribe URL, Upload Audio, Live Mic, and API Studio;
- a downstream-pipeline governance simulator;
- sanitized diagnostic export containing configuration and placeholder metadata only.

It does not provide legal advice, certify compliance, redact audio, or automatically execute billable calls.

## Architecture

```text
Original audio
├── remains unchanged
└── follows the application's audio-retention policy

Deepgram STT
└── detects configured entity classes

Transcript output
└── replaces detected content with typed placeholders

Downstream systems
├── receive redacted transcript where configured
├── preserve placeholder semantics
└── enforce access, retention, logging, and audit policy
```

## Intentional execution

Selecting or applying a policy never transcribes, uploads audio, requests microphone access, or calls Deepgram. Destination modules retain their normal visible Run or Start control and reviewer-unlock rules.

Policy state is scoped to each destination. Applying a policy to Upload Audio does not rewrite an active Live Mic session. “Save as lab default” stores only profile/entity values in local storage—never audio, transcripts, credentials, or raw request bodies.

## Verification

Official Deepgram web documentation was checked on 2026-07-16:

- [Redaction](https://developers.deepgram.com/docs/redaction)
- [Supported Entity Types](https://developers.deepgram.com/docs/supported-entity-types)
- [Prerecorded Listen reference](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded)

The connected Deepgram Docs MCP was present but required renewed OAuth during this implementation. The project records that limitation explicitly; undocumented combinations were not guessed. Flux remains disabled for redaction in this project because the current verified Flux operation metadata does not expose `redact`.

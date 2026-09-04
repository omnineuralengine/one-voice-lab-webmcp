# Redaction Downstream Governance

Redaction is one control in a larger data-handling system.

```text
Customer call
→ Deepgram redacted transcript
→ CRM
→ analytics warehouse
→ QA dashboard
→ LLM summarizer
→ support-agent workspace
```

For every destination, decide:

- whether it receives transcript, audio, or both;
- whether it preserves typed placeholders;
- role-based access and purpose limitation;
- retention and deletion windows;
- logging, tracing, prompt, and export behavior;
- potential re-identification and correlation risk;
- incident response and human escalation.

## Failure examples

“The transcript was redacted, but raw audio was retained indefinitely” remains a governance failure because transcript controls do not change audio.

“Application logs stored unredacted interim transcript events” remains a governance failure because logs can outlive the session and bypass the final redacted transcript.

## Diagnostics policy

Redaction diagnostics may contain:

- requested profiles and entity types;
- request mode and language compatibility;
- generic-to-typed placeholder transitions;
- entity and placeholder counts;
- finalization and warning metadata.

They exclude permanent keys, temporary credentials, Authorization values, raw audio, original sensitive spans, and transcript text by default.

This document describes engineering controls, not legal or regulatory advice. Organizational privacy, security, compliance, and records-management owners must review production policy.

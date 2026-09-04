# Known Limitations

## Verification Boundary

- Automated tests use deterministic fixtures and mocked Deepgram/media boundaries. They do not prove a live provider request, account entitlement, model availability, accuracy, audible quality, or network behavior.
- Connection Check, real microphone/WebSocket behavior, audible TTS, live Observatory operations, management scope, and account-specific API Studio surfaces require bounded manual verification.
- No capability should be labeled live verified until that evidence exists.

## Hosted Reviewer Edition

- No complete hosted reviewer edition is implemented or deployed from this baseline.
- Current hosted-aware behavior is partial: upload limits and narrow Familiar Care session/kill-switch controls exist, but global reviewer authorization, operation allowlisting, quotas, kill switch, first-visit tour state, and full reopen UX remain planned for `hosted-review`.
- The future hosted runtime must not depend on remaining account credit as its abuse control.

## Transcript Redaction

- Redaction changes transcript output only. Original audio is unchanged.
- Detection can produce false negatives, false positives, and context-dependent results.
- Hosted streaming and self-hosted redaction are represented as English-only from the project’s verified documentation; hosted prerecorded support remains subject to current language/model support.
- The current Flux operation metadata does not expose `redact`; Flux redaction is disabled pending manual verification.
- Interim placeholders can change before finalization. Applications must treat all realtime events as sensitive.
- The transcript utility indicator is a local token-replacement heuristic, not a Deepgram quality metric.
- Fixture evaluation is deterministic fictional teaching data, not an official benchmark.
- No redaction profile establishes regulatory compliance.

## Audio and Browser Behavior

- Browser audio meters are engineering indicators, not calibrated instruments.
- Browser codec/container support, device constraints, permissions, drivers, and operating-system processing vary.
- Offline gain, clipping, noise, telephony-band, resampling, and chunk transformations are teaching approximations.
- Real telephony packet loss, jitter, codec behavior, echo, and network impairment are not reproduced.

## Learning and Architecture Surfaces

- Applied Voice Systems telephony, CRM, contact-center, LLM/RAG, multi-agent, and third-party tool paths are simulated or architectural unless explicitly labeled working.
- Questline and Code Lab do not execute learner-authored code. SDK and dependency examples need current-version verification before production use.
- Educational mastery levels are not Deepgram certifications.
- Northstar Agent is disabled because the repository lacks a verified Voice Agent player/settings integration and account-capability preflight.

## Sample Assets

- Reviewed MP3s are project-authored synthetic fixtures generated with Deepgram Aura, not public-domain recordings.
- Redistribution rights were not independently relicensed and remain subject to the project’s Deepgram account terms.
- The Japanese source-text fixture has a documented encoding issue and is not promoted in the curated Upload list.

## Historical and External State

- This baseline begins without valid prior Git history; evolution before the first commit is documented in project files.
- Deepgram API/model/SDK support can change. Dated project registries are reviewed snapshots, not a runtime guarantee of current provider support.
- A connected Deepgram Docs MCP required renewed OAuth during the 2026-07-16 redaction implementation; unresolved combinations were not inferred.

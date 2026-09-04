# Flux Provider Validation Checklist

This checklist is the evidence gate for changing a Flux Conversation
Observatory run from **Implemented with deterministic fixtures** to
**Live-provider validated** for one documented environment. Passing it does not
establish production readiness, universal latency, universal accuracy, or a
universally optimal threshold configuration.

**Route:** `/flux-observatory`  
**Current retained status:** Manual validation required. No completed real
provider/microphone record is included in this repository.

## Before the run

- [ ] Use a private, authorized environment and a non-customer test script.
- [ ] Confirm the repository worktree contains no credentials, recordings, or
  private test artifacts.
- [ ] Configure `DEEPGRAM_API_KEY` only in the trusted server environment.
- [ ] Confirm `/api/deepgram/token` is same-origin and that hosted-review live
  browser access is intentionally enabled if hosted review mode is active.
- [ ] Confirm browser microphone disclosure and participant consent.
- [ ] Disable screen capture of tokens, browser devtools headers, private URLs,
  and transcript content.
- [ ] Choose the current documented Flux model and record the exact settings.
- [ ] Define the scenario's expected turn behavior and pass/fail criteria.
- [ ] Start with a short-lived, bounded run; do not use customer audio.

## Environment record

Complete this section in a private validation record, not by adding secrets to
the repository.

| Field | Value |
| --- | --- |
| Date/time and time zone | |
| Reviewer | |
| Commit or application version | |
| Operating system | |
| Browser and version | |
| Microphone/device | |
| Network context | |
| Flux model | |
| Encoding and sample rate | |
| Configured chunk target | |
| Measured chunk cadence summary | |
| `eot_threshold` | |
| `eager_eot_threshold` | |
| `eot_timeout_ms` | |
| Language hints | |
| Keyterms | |
| Temporary credential TTL | |
| Provider request ID, if safely retained | |

Do not record the permanent key, temporary token, Authorization header,
WebSocket credential, cookies, or private account identifiers.

## Required scenarios

For each scenario, record pass/fail, observed provider events, notable local
timing, sanitized errors, and reviewer notes. A screenshot is optional and must
contain only synthetic/non-sensitive speech and no credentials or private
browser state.

| # | Scenario | Required observation | Pass/fail |
| ---: | --- | --- | --- |
| 1 | Clean complete sentence | `StartOfTurn` and a confirmed `EndOfTurn`; transcript content is secondary to event handling | |
| 2 | Hesitation | Events remain inspectable; no unsupported conclusion is drawn from a single run | |
| 3 | Long intentional pause | Observed behavior is compared with the active thresholds without claiming universal fit | |
| 4 | Self-correction | Updates remain in the correct turn and final text is not confused with an earlier hypothesis | |
| 5 | Eager end followed by completion | `EagerEndOfTurn` then confirmed `EndOfTurn`; speculative demonstrator may promote only after confirmation | |
| 6 | Eager end followed by resumed speech | `EagerEndOfTurn`, `TurnResumed`, and later `EndOfTurn`; stale speculative state is cancelled | |
| 7 | Interruption | `StartOfTurn` is observed as a cue; downstream output interruption is evaluated separately | |
| 8 | Valid threshold update | Explicit `Configure` request and provider success acknowledgement; active settings update only after success | |
| 9 | Rejected configuration | Provider failure is visible and the last acknowledged configuration remains active | |
| 10 | Token expiration or controlled reconnect | A fresh credential and connection generation are used; obsolete events cannot mutate the active session | |
| 11 | Stop and cleanup | Tracks, AudioContext/AudioWorklet, nodes, socket, timers, listeners, buffers, and credential references are released | |
| 12 | Second clean session | A new session succeeds after cleanup with no prior-session event leakage | |

If the provider will not accept a deliberately invalid Configure message, do
not weaken client validation or manufacture a rejection. Record scenario 9 as
**not executed** with the reason and retain the deterministic failure fixture as
fixture evidence only.

## Evidence to retain safely

- application/commit version;
- mode and provider-validation state;
- model, supported audio configuration, threshold configuration, hints, and
  keyterms;
- event type/sequence and request ID when safely available;
- local metric summaries with sample sizes;
- Configure request outcome, provider error code, and sanitized description;
- browser/device/environment details;
- reviewer pass/fail notes;
- exported sanitized scorecard and Mermaid architecture; and
- the next test required.

Do not retain raw microphone audio, full transcripts, credentials, complete
provider URLs, browser storage dumps, internal error stacks, or screenshots
that contain private material.

## Cleanup verification

- [ ] Stop was explicit.
- [ ] Every microphone track has ended.
- [ ] AudioContext is closed.
- [ ] AudioWorklet ports and graph nodes are disconnected.
- [ ] WebSocket is closed and its handlers are detached.
- [ ] Credential and timer references are cleared.
- [ ] No token exists in `localStorage`, `sessionStorage`, IndexedDB, URL,
  visible DOM, console, analytics, export, or screenshot.
- [ ] No audio or transcript was automatically persisted.
- [ ] A second clean session starts without stale state.

## Validation decision

Use one of these exact outcomes:

- **Failed / incomplete — Manual validation required.** Include the smallest
  next action.
- **Live-provider validated for this environment and scenario.** Include the
  date, exact configuration, evidence location, and limitations.
- **POC-ready for the defined scenario.** Use only after scenario-specific
  success criteria are met in addition to live-provider validation.

Always retain: **Production readiness not established** until scale, security,
reliability, retention, compliance, cost, and operations evidence exists.


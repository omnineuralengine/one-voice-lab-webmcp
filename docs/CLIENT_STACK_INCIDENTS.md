# Client Stack Incidents

The incident library teaches evidence-driven diagnosis. Every scenario is deterministic and local unless it explicitly opens an existing Voice Lab inspector record. It never changes a customer system or executes learner-authored code.

## Investigation method

Start with what the user sees, then follow the trace backward:

1. Restate the symptom without assuming a root cause.
2. Draw the process and ownership boundary: browser, proxy, backend, Deepgram, downstream system.
3. Identify the last verified-good event.
4. Collect payload, timestamp, request ID, close code, process, and audio evidence.
5. Classify the likely layer.
6. Form one falsifiable hypothesis.
7. Choose the smallest safe test that can disprove it.
8. Correct the root cause and define prevention.
9. Explain the evidence and impact to the client in plain language.

## Failure categories

| Category | Typical evidence |
| --- | --- |
| Coding bug | Exception, incorrect branch, invalid state update, wrong parser, missing cleanup |
| Integration bug | Wrong endpoint, MIME, auth boundary, proxy behavior, incompatible library or configuration |
| Audio problem | RMS/peak, clipping, channel layout, format metadata, empty or noisy chunks |
| Data problem | Unrepresentative fixtures, malformed records, retention mismatch, duplicate or missing events |
| Model limitation | Segment-specific errors after transport and configuration are validated |
| Evaluation problem | Ground truth, normalization, sample coverage, metric, or reviewer disagreement |
| Expectation mismatch | Product behavior differs from the intended workflow despite technically correct output |

An HTTP 401 is not a model-quality problem. A missed domain term with a successful, correctly configured request is not automatically a coding bug.

## Representative incidents

### Python: realtime connection closes during processing

- Symptom: events stop while a large local file is read or transformed.
- Misleading clue: the close appears to be a network failure.
- Evidence: event-loop delay, chunk timestamps, CPU/blocking trace, WebSocket close details.
- Likely root cause: synchronous work blocks the event loop.
- Test: replace the work with a small deterministic async source or move blocking work off-loop.
- Prevention: bound chunk work, use asynchronous I/O where appropriate, and instrument loop delay.

### TypeScript/React: microphone works, then duplicates events

- Symptom: transcripts or WebSocket messages appear multiple times after remounting.
- Misleading clue: Deepgram appears to send duplicate events.
- Evidence: number of open sockets/listeners, React effect cleanup, mount/unmount timeline.
- Likely root cause: a stale listener or socket survives component cleanup.
- Test: count handler registration and confirm one cleanup for each creation.
- Prevention: keep resource ownership in one effect/ref boundary and close it deterministically.

### Browser: WebSocket authentication fails

- Symptom: browser cannot connect although a server script succeeds.
- Misleading clue: CORS is blamed for every browser failure.
- Evidence: browser WebSocket limitations, token age, handshake/close details, server token route.
- Likely root cause: attempting to set an Authorization header that the native browser API does not support, or using an expired temporary token.
- Resolution: generate a short-lived token server-side and use the documented client authentication pattern. Never ship the permanent key.
- Documentation: [temporary tokens](https://developers.deepgram.com/guides/fundamentals/token-based-authentication) and [WebSocket subprotocol](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol).

### Go: memory grows across streaming sessions

- Symptom: session count returns to zero but goroutines and memory do not.
- Evidence: goroutine profile, context tree, channel ownership, socket-close path.
- Likely root cause: ignored cancellation or a send blocked on an unconsumed channel.
- Test: cancel one fixture session and assert every worker exits within a bound.
- Prevention: one parent context, bounded channels, explicit ownership, and graceful shutdown tests.

### .NET: intermittent socket exhaustion or latency

- Symptom: requests slow or fail under load.
- Evidence: handler/socket metrics, `HttpClient` construction sites, cancellation propagation.
- Likely root cause: constructing and disposing a new `HttpClient` for every request, or blocking an async path with `.Result`.
- Prevention: use dependency injection/managed handlers and keep async calls async end to end.

### PowerShell: command works in Bash instructions but fails on Windows

- Symptom: variable expansion, quoting, paths, or request flags behave differently.
- Evidence: `$PSVersionTable`, `Get-Command curl`, current directory, environment-variable value in the current process.
- Likely root cause: Bash syntax pasted into PowerShell or ambiguity between `curl` and `curl.exe`.
- Prevention: provide shell-specific commands and show environment scope explicitly.

### SQL: transcript retrieval slows over time

- Symptom: session timeline queries become progressively slower.
- Evidence: query plan, indexes, row counts, JSON extraction casts, ordering columns.
- Likely root cause: payload-only storage without indexed session/turn timestamps.
- Prevention: promote stable query keys to typed columns, retain sanitized raw JSON only where justified, and test retention cascades.

### C++: audio corruption changes between builds

- Symptom: clipped/noisy audio or a crash that appears only under optimization.
- Evidence: buffer owner lifetime, callback thread, bounds, sample type, sanitizer/debugger output.
- Likely root cause: dangling buffer, race, invalid signedness, or blocking callback.
- Prevention: scoped ownership, bounded queues, callback-safe operations, and debug/release test coverage.

### PHP: upload succeeds locally but is empty in production

- Symptom: request reaches the application but no valid file bytes reach Deepgram.
- Evidence: PHP upload error code, `upload_max_filesize`, `post_max_size`, temporary-file existence, execution timeout.
- Likely root cause: web-server/PHP limits or temporary-file lifecycle.
- Prevention: validate upload status before reading, stream deliberately, and return clear size/timeout errors.

### Infrastructure: production WebSocket closes after a fixed interval

- Symptom: every otherwise healthy session disconnects at nearly the same age.
- Misleading clue: language runtime or Deepgram model is blamed.
- Evidence: proxy/load-balancer idle timeout, ping/traffic timeline, close code, direct-versus-proxied comparison.
- Likely root cause: customer proxy or gateway timeout.
- Test: compare the same deterministic stream directly and through each hop.
- Prevention: configure supported keepalive and timeout behavior, monitor connection age, and document network ownership.

## Drill controls

- Guided mode reveals the evidence order.
- Timed mode measures reasoning flow, not typing speed.
- Ask for one clue reveals a bounded fact and records hint usage.
- Reveal architecture shows processes and network ownership.
- Show packet/payload displays sanitized, deterministic evidence.
- Explain to client requires a final non-accusatory explanation with impact and prevention.

Scores should reflect reasoning completeness, security, audio knowledge, runtime understanding, evidence gathering, client communication, and reusable impact. Do not require one exact syntax answer.

## Incident report export

A sanitized report should contain:

```text
User-visible symptom
Scope and affected stack
Timeline
Architecture and ownership boundary
Evidence inspected
Hypotheses considered
Root cause and confidence
Resolution
Validation test
Prevention and monitoring
Client-facing explanation
Reusable product or documentation improvement
```

Exports must redact Authorization, API keys, temporary tokens, customer-identifying details, and hidden browser state.

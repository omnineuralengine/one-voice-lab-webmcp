# Language Learning Map

The Questline uses languages as lenses on the same voice-system problems. Core progression does not depend on learning every track.

## Recommended progression

1. TypeScript/React/Next.js: connect existing browser, server-route, WebSocket, and state knowledge.
2. Python: build readable backend, batch, evaluation, and asynchronous mental models.
3. PowerShell and Shell: become fast at environment and connectivity diagnosis.
4. SQL: make transcripts, traces, and evaluations queryable and governable.
5. Go or .NET: specialize in concurrent services or enterprise integrations.
6. C++20: deepen audio-buffer, memory, build, and realtime-infrastructure understanding.
7. PHP and web fundamentals: support legacy and mixed customer stacks.

This ordering is a learning recommendation, not a prerequisite enforced by the product.

## Six-tier map

| Tier | Outcome | Evidence of learning |
| --- | --- | --- |
| 1. Foundations | Read types, functions, errors, packages, environment variables, JSON, and HTTP | Explain input/output types and process startup |
| 2. API Operator | Construct safe STT/TTS requests and extract response data | Identify auth boundary, body type, status, request ID, and transcript path |
| 3. Streaming | Handle binary chunks, events, cancellation, timeout, backpressure, and cleanup | Draw lifecycle and diagnose an injected ordering/close failure |
| 4. Audio Systems | Explain sample representation, channel layout, containers/codecs, buffers, and latency | Diagnose a format, clipping, silence, or chunking fixture |
| 5. Production Integration | Add configuration, tests, observability, storage, deployment, and fallback | Produce a stack-specific runbook and test plan |
| 6. Client Impact | Discover, design, debug, evaluate, and communicate a solution | Export a sanitized capstone brief with tradeoffs and ownership |

## Track outcomes

### TypeScript / JavaScript

- Browser versus Node execution is explicit.
- Promises and callbacks are understood as event-loop coordination, not background threads by default.
- Next.js client/server boundaries keep permanent credentials out of the bundle.
- React effects create and dispose sockets, recorders, listeners, and tracks without render-time state updates.
- `Blob`, `ArrayBuffer`, `Uint8Array`, and Node `Buffer` are not treated as interchangeable names.

Official package: `@deepgram/sdk`. Browser Voice Agent package: `@deepgram/agents`. Package existence does not remove the need for a server-side secret boundary.

### Python

- Virtual environment and interpreter selection are verified before dependency debugging.
- `bytes` versus `str` is explicit.
- Blocking work is kept out of realtime event-loop paths.
- Batch and evaluation harnesses capture request IDs, latency, errors, and model/configuration metadata.

Official package: `deepgram-sdk`. Pin or verify SDK major because official examples currently span different SDK generations.

### Go

- Goroutine and channel ownership is bounded.
- `context.Context` cancellation reaches HTTP, WebSocket, and worker operations.
- Read buffers are not reused while another goroutine still owns their contents.
- Services close response bodies and shut down gracefully.

Official Go SDK exists, but direct `net/http` is the conservative teaching baseline where module-version or method details are uncertain.

### .NET / C#

- `HttpClient` is provided by the application lifetime/handler model rather than recreated per call.
- `async` work is not blocked with `.Result`.
- `CancellationToken` is propagated.
- Streams and WebSockets respect partial reads, disposal, and typed JSON naming.

Official NuGet package: `Deepgram`.

### Shell and PowerShell

- Bash and PowerShell quoting, environment syntax, path semantics, and pipeline types stay separate.
- `curl.exe` is used when curl behavior is intended on Windows.
- Working directory, PATH, process exit code, TLS, DNS, and proxy evidence are checked before changing application code.
- Binary audio is not accidentally routed through a text/object transformation.

The official Deepgram CLI command is `dg`, distributed through `deepctl`; it is external tooling and must be detected or installed explicitly by the learner.

### SQL

- Sessions, turns, words, tool calls, evaluations, and trace events have durable identifiers and timestamps.
- Frequently queried metadata is stored in typed indexed columns; raw JSON is retained deliberately rather than becoming the only schema.
- Redaction and retention cover child records and derived artifacts.
- Query plans and segment-level evaluation queries are part of observability.

SQL stores and retrieves evidence. It does not replace application control flow or streaming orchestration.

### C++20

- Stack, heap, value, reference, pointer, and owner lifetime are explainable.
- Audio callbacks avoid blocking and undefined lifetime.
- Buffers distinguish bytes from typed samples and retain sample format metadata.
- Threads and queues have explicit shutdown and capacity.
- CMake configure/generate, compilation, linking, and Ninja execution are distinguishable failure stages.

No official Deepgram C++ SDK is listed in the SDK feature matrix. REST and WebSocket clients are explicit native/third-party dependencies, and examples must say so.

### PHP

- Server request lifecycle, PHP-FPM/web-server configuration, cURL, uploaded temporary files, environment visibility, and timeout limits are explicit.
- JSON is encoded once and audio files are streamed or read within upload-lifecycle limits.
- The permanent key remains in server configuration.

No official Deepgram PHP SDK is listed in the SDK feature matrix. Use REST; official template apps are references, not SDK evidence.

### HTML, CSS, and React specialization

- Semantic controls and visible focus support accessible microphone and playback workflows.
- Live regions and transcript layouts do not overwhelm assistive technology.
- Responsive consoles preserve internal scroll and operable controls.
- React specialization remains part of the TypeScript/JavaScript runtime track rather than pretending React is another language.

## Optional awareness

- Java is an official SDK track and may be useful for enterprise/JVM customers.
- Kotlin can interoperate with Java libraries, but Questline must not claim a separate official Kotlin SDK.
- Rust has an official Deepgram crate; feature availability must be checked against the SDK matrix and should not block core progression.

## Mastery levels

1. API Reader
2. Language Operator
3. Integration Builder
4. Streaming Debugger
5. Audio Systems Engineer
6. Applied ML Engineer
7. Client Solutions Architect

Progress statuses are `Not started`, `Practiced`, `Needs review`, and `Completed`. They describe local learning evidence only.

## Applied ML lens

Every language quest should record:

- hypothesis;
- input distribution and failure segment;
- model/configuration decision;
- expected output;
- quality and latency metric;
- test fixture and minimum representative set;
- production signal;
- rollout and rollback condition.

The learner should be able to classify a symptom as a coding, integration, data, audio, model, evaluation, or product-expectation problem before proposing a fix.

## Official source status

Reviewed 2026-07-12: [SDK feature matrix](https://developers.deepgram.com/sdks/sdk-features), [pre-recorded guide](https://developers.deepgram.com/docs/pre-recorded-audio), [streaming reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), and [Deepgram CLI installation](https://developers.deepgram.com/developer-tools/cli/installation).

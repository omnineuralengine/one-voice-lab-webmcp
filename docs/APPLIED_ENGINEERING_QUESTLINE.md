# Applied Engineering Questline

Applied Engineering Questline is the runtime, debugging, and client-stack practice layer of Deepgram Voice Lab. API Studio teaches what an endpoint accepts. Code Lab shows where implementation files belong. Applied Voice Systems teaches architecture and production reasoning. Questline connects those surfaces to the way code, audio bytes, network events, processes, and failures behave across languages.

The intended progression is:

```text
Recognize code
  -> explain its runtime and data movement
  -> diagnose a failure in a client stack
  -> test and communicate a production-ready solution
```

Questline levels are local educational milestones, not Deepgram certifications.

## Workspace model

The module uses a compact three-pane workspace rather than a vertically stacked course page:

- The left pane selects quest nodes, languages, toolchains, audio lessons, incidents, and capstones.
- The center pane holds the active lesson, challenge, comparison, architecture, or incident.
- The right pane explains runtime behavior, ownership, common failures, evidence, and mastery checks.

Long content scrolls inside its pane. The top bar keeps language, quest, difficulty, status, and cross-links visible.

## Provenance labels

Every exercise should carry an explicit source label:

| Label | Meaning |
| --- | --- |
| Executable | Uses an existing guarded local Voice Lab route or browser capability. It does not execute learner-authored code. |
| Local simulation | Deterministic client-side fixture or state machine used for practice. |
| Example response | A documented shape, not the result of a current request. |
| Architectural concept | Describes a customer-owned or third-party system that is not installed. |
| Docs verification required | The endpoint is stable but an SDK version, method, model, parameter, or transport detail must be checked before use. |

Existing STT, TTS, token, Live Mic, API Studio, and inspector flows retain ownership of real Deepgram execution. Questline cross-links to them.

## Quest structure

Each language progresses through six tiers:

1. Language foundations: types, functions, errors, packages, environment variables, JSON, and HTTP.
2. Deepgram API operator: safe authentication, STT, TTS, response paths, errors, and request IDs.
3. Streaming and concurrency: WebSockets, events, cancellation, backpressure, cleanup, and reconnect behavior.
4. Audio systems: bytes, PCM, codecs, containers, buffers, capture, and latency.
5. Production integration: service structure, testing, observability, retries, storage, deployment, and security.
6. Client-impact capstone: discovery, architecture, starter files, an injected failure, evaluation, tradeoffs, and a sanitized solution brief.

Every quest node should answer four first-principles questions:

- What data enters, and what exact type is it?
- Which runtime, process, thread, or event loop is doing work?
- Which resource is opened, who owns it, and who closes it?
- What evidence distinguishes a coding bug from an integration, audio, data, model, evaluation, or expectation problem?

## Primary tracks

- Python: backend scripts and services, asynchronous I/O, audio and evaluation tooling.
- JavaScript/TypeScript: browser capture, Node and Next.js boundaries, events, React lifecycle, and typed payloads.
- Go: concurrent services, contexts, channels, binary streams, cancellation, and graceful shutdown.
- .NET/C#: enterprise APIs, dependency injection, managed streams, tasks, and `CancellationToken`.
- Shell/PowerShell: direct API diagnosis, environment scope, quoting, processes, pipes, `curl.exe`, and `ffmpeg`.
- SQL: durable transcript, turn, tool-call, evaluation, observability, retention, and redaction models.
- C++20: ownership, buffers, RAII, callback safety, threads, low-latency audio, CMake, and Ninja.

Bridge tracks cover HTML/CSS, PHP, and React specialization. Java and Rust are optional awareness tracks. There is no claim of an official Deepgram C++ or PHP SDK.

## Runtime explainer

A syntax-only explanation is insufficient. Each code example should explain:

- process and runtime startup;
- memory representation of strings, JSON, and audio bytes;
- network request and response ownership;
- synchronous versus asynchronous behavior;
- callbacks, tasks, goroutines, coroutines, threads, or query execution;
- cleanup and cancellation;
- environment and dependency resolution;
- observable failure evidence.

For example, `await` does not make a blocking operation non-blocking. It yields only when the awaited API is asynchronous. Likewise, a WebSocket callback can still stall progress if it performs CPU-heavy work or a blocking file read.

## Safe execution boundary

Questline never runs arbitrary learner code on the Next.js server. Code editing and reveal-based challenges are educational artifacts. Real calls use the existing local routes:

```text
Learner selection
  -> reviewed Questline registry
  -> existing API Studio or Code Lab workflow
  -> guarded local Next.js route
  -> Deepgram
  -> sanitized inspector envelope
```

The permanent `DEEPGRAM_API_KEY` stays in the server environment. Generated examples use placeholders such as `DEEPGRAM_API_KEY`, `$env:DEEPGRAM_API_KEY`, `process.env.DEEPGRAM_API_KEY`, or `Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY")`.

Temporary tokens are short-lived credentials. They must be redacted from inspectors and never stored in local storage, notes, progress, or exports.

## Local progress and exports

Local progress may record viewed nodes, attempts, hint depth, completed challenges, solved incidents, audio lessons, capstones, notes, and confidence. Before persistence or download, objects must pass credential detection and recursive redaction.

Permitted exports include progress JSON, notes Markdown, incident reports, audio diagnosis reports, polyglot comparisons, stack recommendations, and capstone briefs. Raw Authorization values, API keys, temporary tokens, and raw microphone audio are excluded.

## Official documentation baseline

Deepgram documentation is the source of truth for endpoints, events, models, parameters, and SDK support. The following pages were reviewed on 2026-07-12:

- [Authentication](https://developers.deepgram.com/reference/authentication)
- [Pre-recorded speech-to-text](https://developers.deepgram.com/docs/pre-recorded-audio)
- [Streaming speech-to-text reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)
- [Text-to-speech REST reference](https://developers.deepgram.com/reference/text-to-speech/speak-request)
- [Temporary token grant](https://developers.deepgram.com/reference/auth/tokens/grant)
- [SDK feature matrix](https://developers.deepgram.com/sdks/sdk-features)
- [Deepgram CLI](https://developers.deepgram.com/developer-tools/cli/getting-started)

SDK examples are especially version-sensitive. REST examples are the preferred cross-language baseline when current SDK semantics are uncertain.

# Polyglot Voice Patterns

The purpose of the polyglot matrix is not to memorize eight syntaxes. It is to recognize that different runtimes solve the same system problems: obtain configuration, construct a request, move text or binary data, wait for I/O, parse a response, handle failure, and release resources.

Verified against official Deepgram documentation on 2026-07-12.

## Canonical REST contract

Use direct REST as the first-principles baseline when SDK support or a package version is uncertain.

### Transcribe a hosted URL

```http
POST https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true
Authorization: Token DEEPGRAM_API_KEY
Content-Type: application/json

{"url":"https://dpgr.am/spacewalk.wav"}
```

The API key shown above is a placeholder. In Voice Lab it is added only by a server route.

### Transcribe a local file

```http
POST https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true
Authorization: Token DEEPGRAM_API_KEY
Content-Type: audio/wav

<raw file bytes>
```

This request uses the audio bytes as the body; it is not a multipart form. The content type must match the actual media.

### Generate speech

```http
POST https://api.deepgram.com/v1/speak?model=aura-2-thalia-en
Authorization: Token DEEPGRAM_API_KEY
Content-Type: application/json

{"text":"Hello from the Voice Lab."}
```

The successful response is audio bytes. Do not call a JSON parser on it. Inspect `Content-Type` and `dg-request-id`, then stream or save the body.

### Request a temporary token

```http
POST https://api.deepgram.com/v1/auth/grant
Authorization: Token DEEPGRAM_API_KEY
Content-Type: application/json

{}
```

This request belongs on the server. The response contains `access_token` and `expires_in`; the token is immediately sensitive and must be redacted.

Sources: [pre-recorded STT](https://developers.deepgram.com/docs/pre-recorded-audio), [TTS REST](https://developers.deepgram.com/reference/text-to-speech/speak-request), and [token grant](https://developers.deepgram.com/reference/auth/tokens/grant).

## Stable response paths

For a pre-recorded transcription:

```text
results.channels[0].alternatives[0].transcript
results.channels[0].alternatives[0].words
metadata.request_id
```

For Nova streaming, transcript results use:

```text
event.type == "Results"
event.channel.alternatives[0].transcript
event.is_final
event.speech_final
```

Streaming and pre-recorded responses are not interchangeable. Flux `/v2/listen` also has a different turn-event model from Nova `/v1/listen`.

## Semantic equivalence matrix

| System concern | Python | TypeScript/Node | Go | C#/.NET | PowerShell | PHP | C++20 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Read server secret | `os.environ[...]` | `process.env...` | `os.Getenv(...)` | `Environment.GetEnvironmentVariable(...)` | `$env:DEEPGRAM_API_KEY` | `getenv(...)` | `std::getenv(...)` with guarded conversion |
| HTTP client | `requests` or `httpx` | server-side `fetch` | `net/http` | injected `HttpClient` | `Invoke-RestMethod` / `Invoke-WebRequest` | cURL extension | chosen native/third-party HTTP library |
| JSON value | `dict` | object + TypeScript type | struct/map | typed record/class | object or hashtable | associative array | chosen JSON value type |
| Binary audio | `bytes` | `Buffer`, `ArrayBuffer`, stream | `[]byte`, `io.Reader` | `byte[]`, `Stream` | file/byte stream | file handle/string bytes | `std::vector<std::byte>` or typed sample buffer |
| Async/concurrency | coroutine/event loop | promises/event loop | goroutines + context | tasks + cancellation token | process pipeline/jobs | usually synchronous request lifecycle | threads, callbacks, queues, RAII |
| Cleanup | context manager / `finally` | `finally`, abort, close | `defer` + cancellation | `using` / `await using` | `try/finally` | `try/finally`, close handle | destructor and scoped owner |

These constructs look different, but they protect the same boundaries.

## Authentication region

Every language implementation must make the same architectural decision before syntax matters:

```text
Trusted backend process -> may read DEEPGRAM_API_KEY
Browser or untrusted client -> must not read DEEPGRAM_API_KEY
Browser realtime connection -> obtains a short-lived token from backend
```

Native browser WebSockets cannot set arbitrary Authorization headers. Deepgram documents `Sec-WebSocket-Protocol` for client-side connections. The exact hand-written Bearer-token constructor syntax should remain **Docs verification required** because the standalone subprotocol guide illustrates the API-key form, while the API reference documents Bearer JWT authentication. The official Browser Agent SDK handles this internally for Voice Agent through `tokenFactory`.

Sources: [WebSocket subprotocol guide](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol), [streaming STT reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), and [Browser Agent SDK](https://developers.deepgram.com/docs/browser-agent-overview).

## Official SDK support

| Language | Official package | Questline rule |
| --- | --- | --- |
| JavaScript/TypeScript | `@deepgram/sdk` | SDK patterns may be shown with a verification date; REST remains the stable comparison baseline. |
| Python | `deepgram-sdk` | Package is official, but official pages reference different major generations. Pin a lesson or mark its method example for version verification. |
| Go | `github.com/deepgram/deepgram-go-sdk/v3` in the specific Go guide | Official documentation is inconsistent about the `/v3` suffix. Direct `net/http` is the conservative baseline. |
| .NET/C# | NuGet package `Deepgram` | Official. Keep version-sensitive factory and schema names attached to a docs link. |
| PHP | None listed in the SDK matrix | Use REST with PHP cURL. A template app is not an SDK. |
| C++ | None listed in the SDK matrix | Use REST or a clearly labeled third-party WebSocket/HTTP client. A template app is not an SDK. |
| Java | `com.deepgram:deepgram-java-sdk` | Optional awareness track. |
| Rust | crate `deepgram` | Optional awareness track; gate examples by the SDK feature matrix. |

The official matrix currently lists Voice Agent support for JS, .NET, Python, Go, and Java; Flux SDK support for JS, Python, and Java; and Nova v1 streaming support for JS, .NET, Python, Go, Rust, and Java. Do not infer feature parity from package existence.

Source: [SDK feature matrix](https://developers.deepgram.com/sdks/sdk-features).

## File and deployment shapes

| Runtime | Typical files | Production shape |
| --- | --- | --- |
| Python/FastAPI | `pyproject.toml`, app module, route, service, tests | ASGI service; async work must remain non-blocking. |
| TypeScript/Next.js | client component, server route, typed service, tests | Browser captures audio; server route owns permanent credentials. |
| Go | `go.mod`, `cmd/.../main.go`, internal handler/client packages | Single compiled service with explicit contexts and graceful shutdown. |
| ASP.NET | solution, project, controller, service, options, tests | Managed service with dependency injection and propagated cancellation. |
| PowerShell | `.ps1`, optional module and Pester-style examples | Diagnostic automation, not a browser credential delivery mechanism. |
| PHP | composer/app files, server endpoint, upload handler | Server request lifecycle; account for upload and execution limits. |
| C++20 | `CMakeLists.txt`, source/include/tests | Native binary; HTTP/WebSocket and audio libraries are explicit dependencies. |

## Deepgram CLI

The official CLI command is `dg`, distributed as the Python package `deepctl`. Official documentation includes `dg listen`, `dg speak`, and `dg read`. Questline should detect or ask about installation and never pretend the CLI is present. It must not silently run the remote installer, and account-changing CLI commands stay docs-only.

Source: [CLI installation](https://developers.deepgram.com/developer-tools/cli/installation) and [CLI getting started](https://developers.deepgram.com/developer-tools/cli/getting-started).

## Review checklist for generated examples

- The permanent key is read only in a trusted process.
- Authorization is redacted in logs, inspectors, fixtures, and exports.
- The request body matches JSON versus raw binary semantics.
- TTS success is handled as binary audio.
- The response path matches pre-recorded versus streaming data.
- Timeouts and cancellation reach the network operation.
- Streams, sockets, files, and media tracks are closed by their owner.
- Retries distinguish idempotent reads from actions that may duplicate side effects.
- SDK package, method, model, and option names have an official URL and verification date.

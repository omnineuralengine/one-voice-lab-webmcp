import type {
  PolyglotFocus,
  PolyglotImplementation,
  PolyglotWorkflow,
  QuestCodeExample,
  QuestDocsMetadata,
  QuestlineLanguageId,
} from "@/types/questline";

type Profile = Pick<
  PolyglotImplementation,
  "dependency" | "environmentSetup" | "clientLibrary" | "serialization" | "binaryHandling" | "concurrency" | "errorHandling" | "cleanup" | "testing" | "deploymentShape"
>;

const PROFILES: Record<QuestlineLanguageId, Profile> = {
  python: { dependency: "requests for REST; verify a WebSocket client before streaming", environmentSetup: ["python -m venv .venv", "Activate the intended virtual environment", "Set DEEPGRAM_API_KEY in the process environment"], clientLibrary: "requests/raw HTTP", serialization: "dict to JSON; response.json() to dict", binaryHandling: "bytes and binary file handles; never decode audio as UTF-8", concurrency: "synchronous REST or asyncio for independent streaming work", errorHandling: "timeout, raise_for_status, provider error body sanitized", cleanup: "context managers close files; close sessions/tasks/sockets", testing: "pytest concepts with mocked HTTP and deterministic fixtures; not installed here", deploymentShape: "CLI, worker, FastAPI service, or evaluation job" },
  typescript: { dependency: "native fetch/WebSocket plus existing Next.js routes", environmentSetup: ["Install project dependencies", "Keep DEEPGRAM_API_KEY server-only", "Mark browser/server files explicitly"], clientLibrary: "fetch for REST; browser WebSocket for verified realtime flow", serialization: "JSON.stringify and response.json()", binaryHandling: "Blob, ArrayBuffer, Uint8Array, or Node Buffer", concurrency: "event loop, promises, callbacks, AbortSignal", errorHandling: "check response.ok; capture status and sanitized body", cleanup: "abort requests, close sockets, stop tracks, revoke object URLs", testing: "Vitest/Jest concepts plus mocked fetch/events; not installed here", deploymentShape: "Browser plus Next.js/Node trust boundary" },
  go: { dependency: "standard net/http for REST; verify a WebSocket library before streaming", environmentSetup: ["Initialize go.mod", "Set DEEPGRAM_API_KEY in the service environment"], clientLibrary: "net/http", serialization: "encoding/json", binaryHandling: "[]byte and io.Reader", concurrency: "goroutines coordinated by context and channels", errorHandling: "explicit error/status checks with deadlines", cleanup: "defer response.Body.Close; cancel contexts; stop goroutines", testing: "standard testing package and httptest", deploymentShape: "single compiled service binary or container" },
  csharp: { dependency: "built-in HttpClient and ClientWebSocket", environmentSetup: ["Create a .NET project", "Use environment/configuration providers for DEEPGRAM_API_KEY"], clientLibrary: "HttpClient; ClientWebSocket where verified", serialization: "System.Text.Json", binaryHandling: "byte[], Stream, MemoryStream", concurrency: "Task-based async/await with CancellationToken", errorHandling: "EnsureSuccessStatusCode or explicit typed error mapping", cleanup: "reuse HttpClient; dispose response/streams; propagate cancellation", testing: "xUnit concepts with a fake HttpMessageHandler; not installed here", deploymentShape: "ASP.NET API, worker service, or console diagnostic" },
  powershell: { dependency: "PowerShell built-ins and curl.exe where exact byte control is needed", environmentSetup: ["Open a new PowerShell session", "Set $env:DEEPGRAM_API_KEY for that process", "Confirm working directory and PATH"], clientLibrary: "Invoke-RestMethod or Invoke-WebRequest", serialization: "ConvertTo-Json and PSCustomObject", binaryHandling: "ReadAllBytes or -InFile; avoid accidental text pipes", concurrency: "sequential commands unless jobs/runspaces are explicit", errorHandling: "try/catch plus status/exit-code evidence", cleanup: "remove temporary files and clear short-lived environment scope", testing: "Pester concepts; not installed here", deploymentShape: "Windows diagnostic/runbook script" },
  shell: { dependency: "curl and jq concepts; distinguish Bash from PowerShell", environmentSetup: ["Export DEEPGRAM_API_KEY in the current shell", "Confirm curl and working directory"], clientLibrary: "curl", serialization: "quoted JSON or jq-generated JSON", binaryHandling: "--data-binary and stdin/stdout", concurrency: "foreground pipelines, signals, explicit background jobs", errorHandling: "--fail-with-body plus exit-code checks", cleanup: "trap signals and remove temporary files", testing: "shell fixture scripts and exit-code assertions", deploymentShape: "CLI, container probe, or CI diagnostic" },
  sql: { dependency: "database engine and migrations; SQL does not call Deepgram", environmentSetup: ["Apply schema in a non-production database", "Use application-managed credentials"], clientLibrary: "database protocol through the application", serialization: "typed columns plus JSON/JSONB where justified", binaryHandling: "store references/metadata by default, not raw audio", concurrency: "transactions, indexes, locks, connection pools", errorHandling: "constraints, rollback, and application error mapping", cleanup: "commit/rollback and enforce retention", testing: "migration/query validation with deterministic rows", deploymentShape: "managed or customer-owned database" },
  cpp: { dependency: "CMake/Ninja plus customer-selected HTTP/WebSocket/audio libraries", environmentSetup: ["cmake -S . -B build -G Ninja", "cmake --build build", "Set DEEPGRAM_API_KEY only for a trusted local/service process"], clientLibrary: "No official C++ SDK assumed; library choice requires verification", serialization: "customer-selected JSON library; schema must be explicit", binaryHandling: "std::vector<std::byte> or std::vector<int16_t>", concurrency: "threads and bounded queues; never block audio callbacks", errorHandling: "typed results/errors, timeouts, and RAII cleanup", cleanup: "RAII closes sockets/devices and joins threads", testing: "test-framework concepts; no framework installed", deploymentShape: "native gateway or performance-sensitive service" },
  "html-css": { dependency: "browser standards", environmentSetup: ["Serve from a secure browser context for microphone access"], clientLibrary: "No network behavior without JavaScript", serialization: "semantic form fields only", binaryHandling: "Not applicable without script", concurrency: "browser rendering/main thread", errorHandling: "accessible status and validation messages", cleanup: "preserve focus and visible state", testing: "keyboard and accessibility review", deploymentShape: "browser interface" },
  php: { dependency: "PHP cURL extension; no Deepgram PHP SDK assumed", environmentSetup: ["Confirm PHP/cURL versions", "Expose DEEPGRAM_API_KEY to PHP-FPM/server process, not the browser", "Check php.ini upload/time limits"], clientLibrary: "cURL raw REST", serialization: "json_encode/json_decode", binaryHandling: "temporary upload file and binary cURL body", concurrency: "typically synchronous request worker", errorHandling: "cURL error, HTTP status, timeout, sanitized provider body", cleanup: "close handles before request completion", testing: "PHPUnit concepts; not installed here", deploymentShape: "PHP-FPM/web server or CLI worker" },
  react: { dependency: "React within the TypeScript browser track", environmentSetup: ["Confirm client component boundary", "Use local routes, never a permanent browser key"], clientLibrary: "fetch/WebSocket owned by handlers/effects", serialization: "JSON through typed application models", binaryHandling: "Blob/ArrayBuffer held in refs where appropriate", concurrency: "event loop plus React render/commit/effect lifecycle", errorHandling: "state machine and user-visible errors", cleanup: "effect cleanup stops media and network resources", testing: "component/event lifecycle concepts", deploymentShape: "browser UI backed by trusted server routes" },
  "java-kotlin": { dependency: "Official Java SDK/raw REST patterns require current verification", environmentSetup: ["Use Maven/Gradle and a server-side environment variable"], clientLibrary: "Verify current official Java examples", serialization: "typed JSON model", binaryHandling: "byte[]/ByteBuffer/Stream", concurrency: "threads, futures, reactive APIs, or coroutines by stack", errorHandling: "typed exceptions/status mapping", cleanup: "close streams and async clients", testing: "JUnit concepts", deploymentShape: "JVM service" },
  rust: { dependency: "Official crate feature parity requires verification", environmentSetup: ["Use Cargo and server-side environment configuration"], clientLibrary: "Verify current official Rust examples", serialization: "typed serde model where supported", binaryHandling: "owned byte buffers and slices", concurrency: "selected async runtime and bounded channels", errorHandling: "typed Result and deadlines", cleanup: "drop/close resources and cancel tasks", testing: "cargo test concepts", deploymentShape: "native async service" },
};

const SPEECH_DOCS = docs("https://developers.deepgram.com/docs/speech-to-text", "verified", "Canonical endpoints and exact model/option compatibility must be checked per operation.");
const TTS_DOCS = docs("https://developers.deepgram.com/docs/text-to-speech", "verified", "The examples request MP3 explicitly so file extension and bytes agree.");
const TOKEN_DOCS = docs("https://developers.deepgram.com/guides/fundamentals/token-based-authentication", "verified", "Temporary tokens are short-lived, redacted, and kept in memory only.");
const READ_DOCS = docs("https://developers.deepgram.com/docs/text-intelligence", "needs-verification", "Verify selected feature flags and response paths before production use.");

function docs(url: string, status: QuestDocsMetadata["verificationStatus"], notes: string): QuestDocsMetadata {
  return { docsUrl: url, lastVerifiedAt: status === "verified" ? "2026-07-12" : null, verificationStatus: status, notes };
}

function implementation(
  language: QuestlineLanguageId,
  input: Pick<QuestCodeExample, "title" | "filename" | "code" | "runtime" | "status"> & {
    regions?: Partial<Record<PolyglotFocus, [number, number]>>;
    notes?: string[];
    docs?: QuestDocsMetadata;
    files?: string[];
    entryPoint?: string;
    overrides?: Partial<Profile>;
  },
): PolyglotImplementation {
  return {
    language,
    title: input.title,
    filename: input.filename,
    code: input.code,
    runtime: input.runtime,
    status: input.status,
    regions: input.regions ?? {},
    notes: input.notes ?? [],
    docs: input.docs,
    entryPoint: input.entryPoint ?? input.filename,
    files: input.files ?? [input.filename],
    ...PROFILES[language],
    ...input.overrides,
  };
}

const hostedUrlImplementations: PolyglotImplementation[] = [
  implementation("python", { title: "Python raw REST", filename: "transcribe_url.py", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 2], authentication: [7, 7], request: [4, 10], parsing: [12, 13], errors: [11, 11] }, code: `import os\nimport requests\n\nresponse = requests.post(\n    "https://api.deepgram.com/v1/listen",\n    params={"model": "nova-3", "language": "en", "smart_format": "true"},\n    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},\n    json={"url": "YOUR_AUDIO_URL"},\n    timeout=30,\n)\nresponse.raise_for_status()\ndata = response.json()\nprint(data["results"]["channels"][0]["alternatives"][0]["transcript"])` }),
  implementation("typescript", { title: "TypeScript server fetch", filename: "src/server/transcribe.ts", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { authentication: [5, 7], request: [1, 10], parsing: [13, 14], errors: [11, 11] }, code: `const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,\n  },\n  body: JSON.stringify({ url: "YOUR_AUDIO_URL" }),\n  signal: AbortSignal.timeout(30_000),\n});\nif (!response.ok) throw new Error(\`Deepgram status \${response.status}\`);\nconst data = await response.json();\nconsole.log(data.results.channels[0].alternatives[0].transcript);` }),
  implementation("go", { title: "Go net/http", filename: "cmd/transcribe/main.go", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { authentication: [8, 8], request: [4, 11], errors: [12, 12], cleanup: [13, 13] }, code: `ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)\ndefer cancel()\nbody := strings.NewReader(\`{"url":"YOUR_AUDIO_URL"}\`)\nreq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", body)\nif err != nil { return err }\nreq.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))\nreq.Header.Set("Content-Type", "application/json")\nres, err := http.DefaultClient.Do(req)\nif err != nil { return err }\ndefer res.Body.Close()` }),
  implementation("csharp", { title: "C# HttpClient", filename: "TranscriptionClient.cs", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { authentication: [2, 3], request: [4, 7], errors: [8, 8], parsing: [9, 9] }, code: `using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true");\nrequest.Headers.Authorization = new("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));\nrequest.Content = JsonContent.Create(new { url = "YOUR_AUDIO_URL" });\nusing var response = await httpClient.SendAsync(request, cancellationToken);\nresponse.EnsureSuccessStatusCode();\nusing var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(cancellationToken));` }),
  implementation("powershell", { title: "PowerShell Invoke-RestMethod", filename: "transcribe-url.ps1", runtime: "cli", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 2], authentication: [3, 3], request: [4, 5], parsing: [6, 6] }, code: `$Uri = "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true"\n$Headers = @{ Authorization = "Token $env:DEEPGRAM_API_KEY" }\n$Body = @{ url = "YOUR_AUDIO_URL" } | ConvertTo-Json\n$Result = Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $Body\n$Result.results.channels[0].alternatives[0].transcript` }),
  implementation("shell", { title: "Bash curl", filename: "transcribe-url.sh", runtime: "cli", status: "executable", docs: SPEECH_DOCS, regions: { authentication: [2, 2], request: [1, 4], errors: [1, 1] }, code: `curl --fail-with-body -X POST \\\n  "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true" \\\n  -H "Authorization: Token $DEEPGRAM_API_KEY" -H "Content-Type: application/json" \\\n  -d '{"url":"YOUR_AUDIO_URL"}'` }),
  implementation("php", { title: "PHP cURL", filename: "transcribe-url.php", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 2], authentication: [5, 5], request: [3, 7], errors: [8, 8], cleanup: [9, 9] }, code: `$curl = curl_init("https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true");\ncurl_setopt_array($curl, [\n  CURLOPT_POST => true,\n  CURLOPT_HTTPHEADER => ["Authorization: Token " . getenv("DEEPGRAM_API_KEY"), "Content-Type: application/json"],\n  CURLOPT_POSTFIELDS => json_encode(["url" => "YOUR_AUDIO_URL"]),\n  CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,\n]);\n$result = curl_exec($curl);\nif ($result === false) { throw new RuntimeException(curl_error($curl)); }\ncurl_close($curl);` }),
];

const fileImplementations: PolyglotImplementation[] = [
  implementation("python", { title: "Python binary file body", filename: "transcribe_file.py", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 2], "send-audio": [3, 9], authentication: [6, 6], cleanup: [3, 3] }, code: `import os, requests\nwith open("YOUR_FILE_PATH", "rb") as audio:\n    response = requests.post(\n        "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true",\n        headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}", "Content-Type": "audio/wav"},\n        data=audio, timeout=30,\n    )\nresponse.raise_for_status()` }),
  implementation("typescript", { title: "Node binary file body", filename: "transcribe-file.ts", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 2], "send-audio": [3, 10], authentication: [6, 6], errors: [11, 11] }, code: `import { readFile } from "node:fs/promises";\nconst audio = await readFile("YOUR_FILE_PATH");\nconst response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=en", {\n  method: "POST",\n  headers: { Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`, "Content-Type": "audio/wav" },\n  body: audio,\n  signal: AbortSignal.timeout(30_000),\n});\nif (!response.ok) throw new Error(\`Deepgram status \${response.status}\`);` }),
  implementation("go", { title: "Go streaming file body", filename: "transcribe_file.go", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 2], "send-audio": [3, 7], authentication: [6, 6], cleanup: [2, 2] }, code: `audio, err := os.Open("YOUR_FILE_PATH")\nif err != nil { return err }\ndefer audio.Close()\nreq, err := http.NewRequestWithContext(ctx, http.MethodPost, listenURL, audio)\nreq.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))\nreq.Header.Set("Content-Type", "audio/wav")` }),
  implementation("csharp", { title: "C# file stream", filename: "FileTranscriber.cs", runtime: "server", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 2], "send-audio": [3, 6], cleanup: [1, 3] }, code: `await using var audio = File.OpenRead("YOUR_FILE_PATH");\nusing var content = new StreamContent(audio);\ncontent.Headers.ContentType = new("audio/wav");\nusing var response = await httpClient.PostAsync(listenUrl, content, cancellationToken);\nresponse.EnsureSuccessStatusCode();` }),
  implementation("powershell", { title: "PowerShell binary upload", filename: "transcribe-file.ps1", runtime: "cli", status: "executable", docs: SPEECH_DOCS, regions: { setup: [1, 1], authentication: [2, 2], "send-audio": [3, 3] }, code: `$Headers = @{ Authorization = "Token $env:DEEPGRAM_API_KEY" }\n$Audio = [System.IO.File]::ReadAllBytes("YOUR_FILE_PATH")\nInvoke-WebRequest -Method Post -Uri $ListenUrl -Headers $Headers -ContentType "audio/wav" -Body $Audio` }),
  implementation("shell", { title: "Bash curl binary upload", filename: "transcribe-file.sh", runtime: "cli", status: "executable", docs: SPEECH_DOCS, regions: { authentication: [2, 2], "send-audio": [1, 4] }, code: `curl --fail-with-body -X POST "$LISTEN_URL" \\\n  -H "Authorization: Token $DEEPGRAM_API_KEY" \\\n  -H "Content-Type: audio/wav" \\\n  --data-binary @"YOUR_FILE_PATH"` }),
  implementation("php", { title: "PHP temporary upload to binary body", filename: "upload.php", runtime: "server", status: "docs-verification-required", docs: SPEECH_DOCS, regions: { setup: [1, 3], "send-audio": [4, 4] }, code: `$upload = $_FILES["audio"] ?? null;\nif (!$upload || $upload["error"] !== UPLOAD_ERR_OK) { throw new RuntimeException("Upload failed"); }\n$bytes = file_get_contents($upload["tmp_name"]);\n// Send $bytes through a bounded cURL request with the verified MIME type.` }),
];

const liveImplementations: PolyglotImplementation[] = [
  implementation("typescript", { title: "Existing browser Live Mic boundary", filename: "src/components/browser-mic-card.tsx", runtime: "browser", status: "executable", docs: SPEECH_DOCS, regions: { authentication: [1, 2], request: [3, 3], "send-audio": [4, 5], "receive-event": [6, 6], cleanup: [7, 9] }, code: `const grant = await fetch("/api/deepgram/token", { method: "POST" });\nconst temporaryToken = await readGrantInMemory(grant);\nconst client = createVerifiedLiveClient(temporaryToken);\nclient.open();\nrecorder.addEventListener("dataavailable", ({ data }) => client.send(data));\nclient.onMessage((event) => handleDocumentedTranscriptEvent(event));\nreturn () => {\n  recorder.stop(); stream.getTracks().forEach((track) => track.stop()); client.close();\n};`, notes: ["Helper names summarize existing project code; they are not Deepgram SDK method names.", "The permanent API key never enters this browser file."] }),
  implementation("python", { title: "Python async lifecycle architecture", filename: "streaming_architecture.py", runtime: "concept", status: "docs-verification-required", docs: SPEECH_DOCS, regions: { request: [1, 1], "send-audio": [2, 2], "receive-event": [3, 3], cleanup: [4, 4] }, code: `# Choose and verify a WebSocket client for the customer's Python stack.\n# Run bounded audio-send and event-receive coroutines under one cancellation scope.\n# Parse only documented event fields; keep audio as bytes.\n# On cancellation: stop capture, cancel tasks, and close the socket.`, notes: ["No package or SDK method is claimed."] }),
  implementation("go", { title: "Go streaming loop architecture", filename: "streaming_architecture.go", runtime: "concept", status: "docs-verification-required", docs: SPEECH_DOCS, regions: { request: [1, 1], "send-audio": [2, 2], "receive-event": [3, 3], cleanup: [4, 4] }, code: `// Verify a WebSocket library and endpoint contract before implementation.\n// One goroutine owns writes; a bounded channel carries immutable audio chunks.\n// One goroutine owns reads; context cancellation stops both loops.\n// Wait for goroutines and close the connection during graceful shutdown.`, notes: ["No WebSocket package is invented or selected."] }),
  implementation("csharp", { title: "C# ClientWebSocket lifecycle", filename: "StreamingArchitecture.cs", runtime: "concept", status: "docs-verification-required", docs: SPEECH_DOCS, regions: { request: [1, 1], "send-audio": [2, 2], "receive-event": [3, 3], cleanup: [4, 4] }, code: `// Connect a ClientWebSocket with the verified authentication pattern.\n// Send audio with SendAsync and the shared CancellationToken.\n// Reassemble ReceiveAsync fragments before parsing documented JSON events.\n// Propagate cancellation and complete the close handshake.`, notes: ["Built-in runtime types are named; provider auth details remain docs-gated."] }),
  implementation("cpp", { title: "C++ native streaming boundary", filename: "streaming_architecture.cpp", runtime: "concept", status: "docs-verification-required", docs: SPEECH_DOCS, regions: { "send-audio": [1, 2], "receive-event": [3, 3], cleanup: [4, 4] }, code: `// Audio callback moves owned PCM blocks into a bounded queue and never performs network I/O.\n// A worker sends immutable bytes through a customer-selected, verified WebSocket library.\n// A receive worker parses documented events into owned application data.\n// RAII stop order: callback -> queue -> workers -> socket -> device.`, notes: ["No C++ SDK, WebSocket library, or audio library is assumed."] }),
];

const ttsImplementations = hostedUrlImplementations
  .filter((item) => ["python", "typescript", "go", "csharp", "powershell", "shell", "php"].includes(item.language))
  .map((base) => implementation(base.language, {
    title: `${base.language} raw REST TTS`,
    filename: base.language === "powershell" ? "speak.ps1" : base.language === "shell" ? "speak.sh" : `speak.${extension(base.language)}`,
    runtime: base.runtime,
    status: "executable",
    docs: TTS_DOCS,
    regions: { authentication: [1, 6], request: [1, 8], parsing: [7, 8], errors: [1, 8] },
    code: ttsCode(base.language),
    notes: ["The response is audio bytes, not transcript JSON.", "MP3 is explicitly requested."],
    overrides: { binaryHandling: `${PROFILES[base.language].binaryHandling}; write or stream returned audio bytes according to content type` },
  }));

const tokenImplementations = hostedUrlImplementations
  .filter((item) => ["python", "typescript", "go", "csharp", "powershell", "shell", "php"].includes(item.language))
  .map((base) => implementation(base.language, {
    title: `${base.language} temporary token grant`, filename: `grant-token.${extension(base.language)}`, runtime: base.runtime, status: "executable", docs: TOKEN_DOCS,
    regions: { authentication: [1, 8], request: [1, 8], parsing: [1, 8], cleanup: [1, 8] }, code: tokenCode(base.language),
    notes: ["Inspect expires_in only in examples.", "Never log, export, or persist access_token."],
  }));

const analysisImplementations = ["python", "typescript", "go", "csharp", "powershell", "shell", "php"].map((language) =>
  implementation(language as QuestlineLanguageId, {
    title: `${language} Text Intelligence REST`, filename: `analyze.${extension(language as QuestlineLanguageId)}`, runtime: language === "typescript" || language === "python" || language === "go" || language === "csharp" || language === "php" ? "server" : "cli", status: "docs-verification-required", docs: READ_DOCS,
    regions: { authentication: [1, 7], request: [1, 8], parsing: [1, 8], errors: [1, 8] }, code: analysisCode(language as QuestlineLanguageId),
    notes: ["Input is already text.", "Feature availability and response paths require official-doc verification."],
  }),
);

export const POLYGLOT_WORKFLOWS: PolyglotWorkflow[] = [
  { id: "transcribe-hosted-url", label: "Transcribe hosted URL", purpose: "Compare one canonical prerecorded JSON request across runtimes.", relatedApiOperationId: "stt-url", relatedCodeLabWorkflowId: "transcribe-url", implementations: hostedUrlImplementations },
  { id: "transcribe-local-file", label: "Transcribe local file", purpose: "Compare binary file ownership, MIME declaration, and cleanup.", relatedApiOperationId: "stt-file", relatedCodeLabWorkflowId: "upload-audio", implementations: fileImplementations },
  { id: "live-microphone", label: "Browser/live microphone", purpose: "Compare long-lived streaming lifecycle and concurrency without claiming unverified client packages.", relatedApiOperationId: "stt-live", relatedCodeLabWorkflowId: "live-mic", implementations: liveImplementations },
  { id: "generate-tts", label: "Generate TTS", purpose: "Send JSON text and handle audio bytes with an explicit MP3 request.", relatedApiOperationId: "tts-single", relatedCodeLabWorkflowId: "tts", implementations: ttsImplementations },
  { id: "temporary-token", label: "Request temporary token", purpose: "Grant a short-lived browser credential from a trusted runtime and keep it in memory only.", relatedApiOperationId: "auth-token", relatedCodeLabWorkflowId: "temporary-token", implementations: tokenImplementations },
  { id: "store-transcript", label: "Store transcript", purpose: "Move finalized transcript data into a queryable, retention-aware model.", relatedApiOperationId: "stt-url", relatedCodeLabWorkflowId: "transcribe-url", implementations: storageImplementations() },
  { id: "create-crm-payload", label: "Create CRM payload", purpose: "Map transcript context into an idempotent customer-owned integration payload.", relatedApiOperationId: "text-intelligence-analyze", relatedCodeLabWorkflowId: "text-intelligence", implementations: crmImplementations() },
  { id: "analyze-conversation", label: "Analyze conversation", purpose: "Compare raw REST Text Intelligence calls while preserving docs-verification status.", relatedApiOperationId: "text-intelligence-analyze", relatedCodeLabWorkflowId: "text-intelligence", implementations: analysisImplementations },
  { id: "handle-tool-call", label: "Handle tool call", purpose: "Validate structured arguments and return a local simulated result without executing external actions.", relatedApiOperationId: "voice-agent-converse", relatedCodeLabWorkflowId: "voice-agent", implementations: toolImplementations() },
  { id: "record-observability-event", label: "Record observability event", purpose: "Normalize local session, step, request, and outcome evidence without credentials or raw audio.", relatedApiOperationId: "stt-live", relatedCodeLabWorkflowId: "live-mic", implementations: observabilityImplementations() },
];

export function getPolyglotWorkflow(id: string) {
  return POLYGLOT_WORKFLOWS.find((workflow) => workflow.id === id) ?? POLYGLOT_WORKFLOWS[0];
}

function extension(language: QuestlineLanguageId) {
  const values: Partial<Record<QuestlineLanguageId, string>> = { python: "py", typescript: "ts", go: "go", csharp: "cs", powershell: "ps1", shell: "sh", php: "php", sql: "sql", cpp: "cpp" };
  return values[language] ?? "txt";
}

function ttsCode(language: QuestlineLanguageId) {
  if (language === "python") return `response = requests.post("https://api.deepgram.com/v1/speak?model=aura-2-harmonia-en&encoding=mp3", headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"}, json={"text": "Hello from the voice lab."}, timeout=30)\nresponse.raise_for_status()\nopen("output.mp3", "wb").write(response.content)`;
  if (language === "typescript") return `const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-harmonia-en&encoding=mp3", { method: "POST", headers: { Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`, "Content-Type": "application/json" }, body: JSON.stringify({ text: "Hello from the voice lab." }) });\nif (!response.ok) throw new Error(\`TTS status \${response.status}\`);\nconst audio = new Uint8Array(await response.arrayBuffer());`;
  if (language === "go") return `body := strings.NewReader(\`{"text":"Hello from the voice lab."}\`)\nreq, _ := http.NewRequestWithContext(ctx, http.MethodPost, speakURL+"&encoding=mp3", body)\nreq.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))\nres, err := http.DefaultClient.Do(req)\nif err != nil { return err }\ndefer res.Body.Close()`;
  if (language === "csharp") return `using var request = new HttpRequestMessage(HttpMethod.Post, speakUrl + "&encoding=mp3");\nrequest.Headers.Authorization = new("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));\nrequest.Content = JsonContent.Create(new { text = "Hello from the voice lab." });\nusing var response = await httpClient.SendAsync(request, cancellationToken);\nresponse.EnsureSuccessStatusCode();`;
  if (language === "powershell") return `$Headers = @{ Authorization = "Token $env:DEEPGRAM_API_KEY" }\n$Body = @{ text = "Hello from the voice lab." } | ConvertTo-Json\nInvoke-WebRequest -Method Post -Uri "$SpeakUrl&encoding=mp3" -Headers $Headers -ContentType "application/json" -Body $Body -OutFile output.mp3`;
  if (language === "shell") return `curl --fail-with-body -X POST "$SPEAK_URL&encoding=mp3" -H "Authorization: Token $DEEPGRAM_API_KEY" -H "Content-Type: application/json" -d '{"text":"Hello from the voice lab."}' -o output.mp3`;
  return `$curl = curl_init($speakUrl . "&encoding=mp3");\ncurl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ["Authorization: Token " . getenv("DEEPGRAM_API_KEY"), "Content-Type: application/json"], CURLOPT_POSTFIELDS => json_encode(["text" => "Hello from the voice lab."]), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30]);\n$audio = curl_exec($curl);`;
}

function tokenCode(language: QuestlineLanguageId) {
  if (language === "python") return `response = requests.post("https://api.deepgram.com/v1/auth/grant", headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"}, json={"ttl_seconds": 60}, timeout=10)\nresponse.raise_for_status()\nprint(response.json()["expires_in"])`;
  if (language === "typescript") return `const response = await fetch("https://api.deepgram.com/v1/auth/grant", { method: "POST", headers: { Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`, "Content-Type": "application/json" }, body: JSON.stringify({ ttl_seconds: 60 }) });\nconst grant = await response.json();\nconsole.log({ expires_in: grant.expires_in });`;
  if (language === "go") return `body := strings.NewReader(\`{"ttl_seconds":60}\`)\nreq, _ := http.NewRequest(http.MethodPost, "https://api.deepgram.com/v1/auth/grant", body)\nreq.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))\n// Decode expires_in; keep access_token in memory and never log it.`;
  if (language === "csharp") return `using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.deepgram.com/v1/auth/grant");\nrequest.Headers.Authorization = new("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));\nrequest.Content = JsonContent.Create(new { ttl_seconds = 60 });\n// Read expires_in; never log or persist access_token.`;
  if (language === "powershell") return `$Headers = @{ Authorization = "Token $env:DEEPGRAM_API_KEY" }\n$Grant = Invoke-RestMethod -Method Post -Uri "https://api.deepgram.com/v1/auth/grant" -Headers $Headers -ContentType "application/json" -Body '{"ttl_seconds":60}'\n$Grant.expires_in`;
  if (language === "shell") return `curl --fail-with-body -X POST "https://api.deepgram.com/v1/auth/grant" -H "Authorization: Token $DEEPGRAM_API_KEY" -H "Content-Type: application/json" -d '{"ttl_seconds":60}'\n# Do not pipe access_token into logs or persistent shell history.`;
  return `$curl = curl_init("https://api.deepgram.com/v1/auth/grant");\ncurl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ["Authorization: Token " . getenv("DEEPGRAM_API_KEY"), "Content-Type: application/json"], CURLOPT_POSTFIELDS => '{"ttl_seconds":60}', CURLOPT_RETURNTRANSFER => true]);\n// Parse expires_in; do not log or persist access_token.`;
}

function analysisCode(language: QuestlineLanguageId) {
  const endpoint = "https://api.deepgram.com/v1/read?language=en&summarize=true&topics=true&intents=true&sentiment=true";
  if (language === "python") return `response = requests.post("${endpoint}", headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"}, json={"text": transcript}, timeout=30)\nresponse.raise_for_status()\ndata = response.json()`;
  if (language === "typescript") return `const response = await fetch("${endpoint}", { method: "POST", headers: { Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`, "Content-Type": "application/json" }, body: JSON.stringify({ text: transcript }) });\nif (!response.ok) throw new Error(\`Read status \${response.status}\`);`;
  if (language === "go") return `body, _ := json.Marshal(map[string]string{"text": transcript})\nreq, _ := http.NewRequestWithContext(ctx, http.MethodPost, "${endpoint}", bytes.NewReader(body))\nreq.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))`;
  if (language === "csharp") return `using var request = new HttpRequestMessage(HttpMethod.Post, "${endpoint}");\nrequest.Headers.Authorization = new("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));\nrequest.Content = JsonContent.Create(new { text = transcript });`;
  if (language === "powershell") return `$Body = @{ text = $Transcript } | ConvertTo-Json\nInvoke-RestMethod -Method Post -Uri "${endpoint}" -Headers @{ Authorization = "Token $env:DEEPGRAM_API_KEY" } -ContentType "application/json" -Body $Body`;
  if (language === "shell") return `curl --fail-with-body -X POST "${endpoint}" -H "Authorization: Token $DEEPGRAM_API_KEY" -H "Content-Type: application/json" -d '{"text":"YOUR_TRANSCRIPT"}'`;
  return `$curl = curl_init("${endpoint}");\ncurl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ["Authorization: Token " . getenv("DEEPGRAM_API_KEY"), "Content-Type: application/json"], CURLOPT_POSTFIELDS => json_encode(["text" => $transcript]), CURLOPT_RETURNTRANSFER => true]);`;
}

function storageImplementations(): PolyglotImplementation[] {
  return [
    implementation("sql", { title: "Normalized transcript schema", filename: "migrations/001_transcripts.sql", runtime: "database", status: "conceptual", regions: { setup: [1, 12], testing: [13, 13] }, code: `CREATE TABLE transcript_sessions (\n  id text PRIMARY KEY, request_id text, language text NOT NULL, created_at timestamptz NOT NULL\n);\nCREATE TABLE transcript_words (\n  session_id text NOT NULL REFERENCES transcript_sessions(id) ON DELETE CASCADE,\n  position integer NOT NULL, word text NOT NULL, start_seconds numeric, end_seconds numeric,\n  speaker integer, PRIMARY KEY (session_id, position)\n);\nCREATE INDEX transcript_words_session_time_idx\n  ON transcript_words (session_id, start_seconds);`, notes: ["Retention must include child rows.", "Raw audio is not stored by this schema."] }),
    implementation("typescript", { title: "Store finalized segments only", filename: "src/server/transcripts.ts", runtime: "server", status: "conceptual", regions: { request: [1, 6], errors: [7, 7] }, code: `if (!event.is_final) return;\nawait repository.insertSegment({\n  sessionId,\n  requestId: event.metadata?.request_id ?? null,\n  transcript: event.channel.alternatives[0].transcript,\n});`, notes: ["Repository and schema are customer-owned concepts."] }),
    implementation("python", { title: "Transactional transcript write", filename: "repositories/transcripts.py", runtime: "server", status: "conceptual", regions: { request: [1, 5], cleanup: [1, 5] }, code: `with database.transaction() as tx:\n    tx.insert_session(session_id=session_id, request_id=request_id, language=language)\n    tx.insert_words(session_id=session_id, words=final_words)\n# The transaction commits or rolls back as one unit.`, notes: ["Database API is intentionally generic."] }),
  ];
}

function crmImplementations(): PolyglotImplementation[] {
  const codeByLanguage: Partial<Record<QuestlineLanguageId, string>> = {
    typescript: `const ticket = { external_id: sessionId, summary, transcript_url: controlledTranscriptUrl };\nvalidateCrmPayload(ticket);\nawait crmClient.upsertTicket(ticket, { idempotencyKey: sessionId });`,
    python: `ticket = {"external_id": session_id, "summary": summary, "transcript_url": controlled_url}\nvalidate_crm_payload(ticket)\ncrm.upsert_ticket(ticket, idempotency_key=session_id)`,
    go: `ticket := Ticket{ExternalID: sessionID, Summary: summary, TranscriptURL: controlledURL}\nif err := ticket.Validate(); err != nil { return err }\nreturn crm.UpsertTicket(ctx, ticket, sessionID)`,
    csharp: `var ticket = new Ticket(sessionId, summary, controlledTranscriptUrl);\nticket.Validate();\nawait crm.UpsertTicketAsync(ticket, idempotencyKey: sessionId, cancellationToken);`,
    php: `$ticket = ["external_id" => $sessionId, "summary" => $summary, "transcript_url" => $controlledUrl];\nvalidate_crm_payload($ticket);\n$crm->upsertTicket($ticket, $sessionId);`,
  };
  return Object.entries(codeByLanguage).map(([language, code]) => implementation(language as QuestlineLanguageId, { title: `${language} CRM adapter`, filename: `crm-adapter.${extension(language as QuestlineLanguageId)}`, runtime: "server", status: "conceptual", regions: { request: [1, 3], errors: [2, 2] }, code, notes: ["No connector or third-party credential is installed.", "Use minimum necessary fields and an idempotency key."] }));
}

function toolImplementations(): PolyglotImplementation[] {
  return [
    implementation("typescript", { title: "Validate local mock-tool arguments", filename: "src/tools/lookup-order.ts", runtime: "server", status: "simulated", regions: { parsing: [1, 4], request: [5, 5], errors: [2, 3] }, code: `const parsed = lookupOrderSchema.safeParse(request.arguments);\nif (!parsed.success) return { ok: false, error: "INVALID_ARGUMENTS" };\nif (requiresConfirmation(parsed.data)) return { ok: false, error: "CONFIRMATION_REQUIRED" };\nreturn executeLocalMock(parsed.data);`, notes: ["Schema and executor are local simulation concepts."] }),
    implementation("python", { title: "Validate before local mock execution", filename: "tools.py", runtime: "server", status: "simulated", regions: { parsing: [1, 3], request: [4, 4] }, code: `arguments = validate_lookup_order(function_call["arguments"])\nif arguments.requires_confirmation:\n    return {"ok": False, "error": "CONFIRMATION_REQUIRED"}\nreturn execute_local_mock(arguments)`, notes: ["No real order or account system is called."] }),
    implementation("csharp", { title: "Typed local mock result", filename: "Tools/LookupOrder.cs", runtime: "server", status: "simulated", regions: { parsing: [1, 2], request: [3, 3] }, code: `var arguments = JsonSerializer.Deserialize<LookupOrderArgs>(request.Arguments)\n    ?? throw new ValidationException("Missing arguments");\nreturn await localMock.LookupOrderAsync(arguments, cancellationToken);`, notes: ["The service is a deterministic local mock."] }),
  ];
}

function observabilityImplementations(): PolyglotImplementation[] {
  const codeByLanguage: Partial<Record<QuestlineLanguageId, string>> = {
    typescript: `recordTrace({ sessionId, stepId, requestId, type: "transcript.final", durationMs, payload: redactSecrets({ transcriptLength }) });`,
    python: `record_trace({"session_id": session_id, "step_id": step_id, "request_id": request_id, "type": "transcript.final", "duration_ms": duration_ms})`,
    go: `trace.Record(Event{SessionID: sessionID, StepID: stepID, RequestID: requestID, Type: "transcript.final", DurationMS: durationMS})`,
    csharp: `trace.Record(new TraceEvent(sessionId, stepId, requestId, "transcript.final", durationMs));`,
    sql: `SELECT session_id, event_type, percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms\nFROM trace_events WHERE occurred_at >= now() - interval '24 hours' GROUP BY session_id, event_type;`,
  };
  return Object.entries(codeByLanguage).map(([language, code]) => implementation(language as QuestlineLanguageId, { title: `${language} sanitized trace event`, filename: `observability.${extension(language as QuestlineLanguageId)}`, runtime: language === "sql" ? "database" : "server", status: "conceptual", regions: { request: [1, 2], parsing: [1, 2] }, code, notes: ["Authorization, API keys, temporary tokens, and raw audio are excluded.", "Deepgram request ID is recorded only when actually returned."] }));
}

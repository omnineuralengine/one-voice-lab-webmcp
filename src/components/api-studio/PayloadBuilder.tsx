"use client";

import type {
  ApiCodeLanguage,
  ApiOperation,
  ApiPayloadValue,
  ApiPayloadValues,
  GeneratedApiRequest,
} from "@/types/deepgram-api-studio";

export function PayloadBuilder({
  operation,
  values,
  file,
  running,
  runMessage,
  copiedLabel,
  onChange,
  onFileChange,
  onRun,
  onBuild,
  onCopy,
  onOpenRelated,
  onOpenCodeLab,
}: {
  operation: ApiOperation;
  values: ApiPayloadValues;
  file: File | null;
  running: boolean;
  runMessage: string;
  copiedLabel: string;
  onChange: (name: string, value: ApiPayloadValue) => void;
  onFileChange: (file: File | null) => void;
  onRun: () => void;
  onBuild: () => void;
  onCopy: (label: string, value: string) => void;
  onOpenRelated: () => void;
  onOpenCodeLab: () => void;
}) {
  const request = buildGeneratedRequest(operation, values, file);
  const snippets = generateApiCodeSnippets(operation, request);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/10 bg-[#071118]/70 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <ApiChip tone="cyan">{operation.method}</ApiChip>
              <ApiChip>{operation.transport}</ApiChip>
              <ApiChip>{operation.auth}</ApiChip>
              {operation.status !== "available" ? (
                <ApiChip tone={operation.status === "locked-by-design" ? "rose" : "violet"}>
                  {operation.status === "locked-by-design" ? "Locked by design" : "Manual verification required"}
                </ApiChip>
              ) : null}
            </div>
            <h3 className="mt-2 text-base font-semibold text-white">{operation.name}</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{operation.summary}</p>
          </div>
          {operation.docsUrl ? (
            <a
              href={operation.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100"
            >
              Official docs ↗
            </a>
          ) : null}
        </div>
        <div className="mt-3 rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-[11px] text-cyan-100">
          <span className="mr-2 text-violet-300">{operation.method}</span>
          <span className="break-all">{operation.endpoint}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/65">Payload controls</p>
              <p className="mt-1 text-[11px] text-slate-500">Query configuration, request body, and stream messages stay visually distinct.</p>
            </div>
            <span className="text-[10px] text-slate-600">{operation.parameters.length} controls</span>
          </div>
          {operation.parameters.length ? (
            <div className="grid gap-2 xl:grid-cols-2">
              {operation.parameters.map((parameter) => (
                <ParameterControl
                  key={parameter.name}
                  operation={operation}
                  parameter={parameter}
                  value={values[parameter.name] ?? parameter.defaultValue}
                  file={file}
                  onChange={onChange}
                  onFileChange={onFileChange}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-4 text-xs text-slate-500">
              This read-only or conceptual operation has no editable request payload.
            </div>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-white/10 bg-[#02060b]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">Generated Request</p>
              <p className="mt-0.5 text-[10px] text-slate-600">Authorization is always a redacted preview.</p>
            </div>
            <button
              type="button"
              onClick={() => onCopy("request", JSON.stringify(request, null, 2))}
              className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:text-white"
            >
              {copiedLabel === "request" ? "Copied" : "Copy JSON"}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto p-3 font-mono text-[10px] leading-4 text-slate-300">{JSON.stringify(request, null, 2)}</pre>
        </section>

        <section className="mt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Copy server-safe starter</p>
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.keys(snippets) as ApiCodeLanguage[]).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => onCopy(language, snippets[language])}
                className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-2 py-2 text-[10px] font-semibold text-slate-400 transition hover:border-violet-300/25 hover:text-violet-100"
              >
                {copiedLabel === language ? "Copied" : language === "curl" ? "curl" : language}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#061016]/90 p-3">
        {runMessage ? <p className="mb-2 text-[11px] text-slate-400">{runMessage}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {operation.executable ? (
            <button
              type="button"
              onClick={onRun}
              disabled={running || (operation.id === "stt-file" && !file)}
              className="rounded-md bg-cyan-200 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? "Running through local route…" : "Run Safe Request"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onBuild}
              className="rounded-md border border-violet-300/35 bg-violet-300/12 px-3 py-2 text-xs font-bold text-violet-100 hover:bg-violet-300/18"
            >
              Build Payload Only
            </button>
          )}
          {operation.relatedModule ? (
            <button type="button" onClick={onOpenRelated} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
              Open related module
            </button>
          ) : null}
          {operation.codeLabWorkflow ? (
            <button type="button" onClick={onOpenCodeLab} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
              Open current API payload in Code Lab
            </button>
          ) : null}
        </div>
        {!operation.executable ? (
          <p className="mt-2 text-[10px] leading-4 text-amber-200/65">No network call will run. Examples remain labeled shapes, and uncertain operations must be verified in the official API reference.</p>
        ) : null}
      </div>
    </div>
  );
}

function ParameterControl({
  operation,
  parameter,
  value,
  file,
  onChange,
  onFileChange,
}: {
  operation: ApiOperation;
  parameter: ApiOperation["parameters"][number];
  value: ApiPayloadValue;
  file: File | null;
  onChange: (name: string, value: ApiPayloadValue) => void;
  onFileChange: (file: File | null) => void;
}) {
  const wide = parameter.control === "textarea" || parameter.control === "json" || parameter.control === "file";
  return (
    <div className={`rounded-lg border border-white/[0.08] bg-black/20 p-3 ${wide ? "xl:col-span-2" : ""}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-200">{parameter.label}</span>
        <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-slate-600">{parameter.location}</span>
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-slate-500">{parameter.help}</span>
      <span className="mt-2 block">
        {parameter.control === "toggle" ? (
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            onClick={() => onChange(parameter.name, !Boolean(value))}
            className={`flex h-7 w-12 items-center rounded-full p-1 transition ${Boolean(value) ? "bg-cyan-300/80" : "bg-white/10"}`}
          >
            <span className={`size-5 rounded-full bg-white shadow transition-transform ${Boolean(value) ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        ) : null}
        {parameter.control === "select" ? (
          <select
            value={String(value)}
            aria-label={parameter.label}
            onChange={(event) => onChange(parameter.name, event.target.value)}
            className="h-9 w-full rounded-md border border-white/10 bg-[#071018] px-2 text-xs text-slate-200 outline-none focus:border-cyan-300/40"
          >
            {parameter.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : null}
        {parameter.control === "text" ? (
          <input
            value={String(value)}
            aria-label={parameter.label}
            placeholder={parameter.placeholder}
            onChange={(event) => onChange(parameter.name, event.target.value)}
            className="h-9 w-full rounded-md border border-white/10 bg-[#071018] px-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/40"
          />
        ) : null}
        {parameter.control === "number" ? (
          <input
            type="number"
            value={Number(value)}
            aria-label={parameter.label}
            min={operation.id === "auth-token" ? 1 : 0}
            onChange={(event) => onChange(parameter.name, Number(event.target.value))}
            className="h-9 w-full rounded-md border border-white/10 bg-[#071018] px-2 font-mono text-xs text-slate-200 outline-none focus:border-cyan-300/40"
          />
        ) : null}
        {parameter.control === "textarea" || parameter.control === "json" ? (
          <textarea
            value={String(value)}
            aria-label={parameter.label}
            rows={parameter.control === "json" ? 10 : 4}
            spellCheck={parameter.control !== "json"}
            onChange={(event) => onChange(parameter.name, event.target.value)}
            className={`w-full resize-y rounded-md border border-white/10 bg-[#03080d] p-2 text-xs leading-5 text-slate-200 outline-none focus:border-cyan-300/40 ${parameter.control === "json" ? "font-mono" : ""}`}
          />
        ) : null}
        {parameter.control === "file" ? (
          <input
            type="file"
            aria-label={parameter.label}
            accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.webm"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className="block w-full rounded-md border border-dashed border-white/15 bg-[#071018] p-2 text-xs text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-cyan-200 file:px-2 file:py-1 file:text-[10px] file:font-bold file:text-slate-950"
          />
        ) : null}
      </span>
      {parameter.control === "file" && file ? <span className="mt-2 block font-mono text-[10px] text-cyan-200">{file.name} · {formatFileSize(file.size)}</span> : null}
    </div>
  );
}

export function buildGeneratedRequest(operation: ApiOperation, values: ApiPayloadValues, file: File | null): GeneratedApiRequest {
  const query: Record<string, string> = {};
  const body: Record<string, unknown> = {};

  for (const parameter of operation.parameters) {
    const value = values[parameter.name] ?? parameter.defaultValue;
    if (parameter.control === "file") {
      body.file = file ? { name: file.name, type: file.type || "application/octet-stream", sizeBytes: file.size } : "Choose an audio file";
      body.binaryAudio = "***not included***";
      continue;
    }

    if (parameter.location === "query") {
      if (value === "" || value === "none") continue;
      if (parameter.name === "sample_rate" && values.encoding === "mp3") continue;
      query[parameter.name] = String(value);
      continue;
    }

    if (parameter.location === "stream" && parameter.control === "json") {
      body.streamMessage = parseJsonPreview(String(value));
      continue;
    }

    const key = operation.id === "auth-token" && parameter.name === "ttlSeconds" ? "ttl_seconds" : parameter.name;
    body[key] = value;
  }

  const url = appendQuery(operation.endpoint, query);
  const headers: Record<string, string> = {};
  if (operation.auth === "Server API key") headers.Authorization = "Token ***redacted***";
  if (operation.auth === "Temporary browser token") headers.Authorization = "Bearer ***temporary-token-redacted***";
  if (operation.transport === "REST JSON") headers["Content-Type"] = "application/json";
  if (operation.transport === "REST file upload") headers["Content-Type"] = file?.type || "audio/*";

  return {
    url,
    method: operation.method,
    query,
    headers,
    bodyPreview: Object.keys(body).length ? body : undefined,
  };
}

export function generateApiCodeSnippets(operation: ApiOperation, request: GeneratedApiRequest): Record<ApiCodeLanguage, string> {
  const url = request.url;
  const body = directBodyForCode(operation, request.bodyPreview);
  const bodyJson = JSON.stringify(body ?? {}, null, 2);
  const isWebSocket = operation.method === "WebSocket";
  const fileBody = operation.transport === "REST file upload";
  const isTts = operation.id === "tts-single";

  if (isWebSocket || operation.method === "Concept") {
    return {
      curl: `# WebSocket or concept surface: ${url}\n# Use a short-lived token or the official SDK. Never put DEEPGRAM_API_KEY in browser code.`,
      Python: `# Server/local concept starter\nimport os\n\nDEEPGRAM_API_KEY = os.environ["DEEPGRAM_API_KEY"]\nendpoint = "${url}"\n# Follow the documented WebSocket lifecycle before streaming audio.`,
      TypeScript: `// Trusted server or local runtime only\nconst apiKey = process.env.DEEPGRAM_API_KEY;\nconst endpoint = "${url}";\n// For browsers, exchange the key for a temporary token on your server.`,
      Go: `// Trusted server/local runtime only\napiKey := os.Getenv("DEEPGRAM_API_KEY")\nendpoint := "${url}"\n_ = apiKey\n_ = endpoint`,
      ".NET": `// Trusted server/local runtime only\nvar apiKey = Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY");\nvar endpoint = "${url}";\n// Issue a temporary token for browser realtime sessions.`,
    };
  }

  const curlBody = fileBody ? `--data-binary "@audio.wav"` : Object.keys(body ?? {}).length ? `-d '${JSON.stringify(body)}'` : "";
  const curlLines = [
    `curl -X ${operation.method} "${url}"`,
    `  -H "Authorization: Token $DEEPGRAM_API_KEY"`,
    `  -H "Content-Type: ${fileBody ? "audio/wav" : "application/json"}"`,
    curlBody ? `  ${curlBody}` : "",
    isTts ? `  --output "speech.bin"` : "",
  ].filter(Boolean);
  const curl = curlLines.join(" \\" + "\n");

  const pythonBody = fileBody
    ? `with open("audio.wav", "rb") as audio:\n    response = requests.${operation.method.toLowerCase()}(url, headers={**headers, "Content-Type": "audio/wav"}, data=audio)`
    : operation.method === "GET"
      ? `response = requests.get(url, headers=headers)`
      : `payload = json.loads(${JSON.stringify(JSON.stringify(body ?? {}))})\nresponse = requests.${operation.method.toLowerCase()}(url, headers=headers, json=payload)`;

  return {
    curl,
    Python: `import json\nimport os\nimport requests${isTts ? `\nfrom pathlib import Path` : ""}\n\nurl = "${url}"\nheaders = {"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"}\n${pythonBody}\nresponse.raise_for_status()\n${isTts ? `Path("speech.bin").write_bytes(response.content)` : `print(response.json())`}`,
    TypeScript: `const response = await fetch("${url}", {\n  method: "${operation.method}",\n  headers: {\n    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,${fileBody ? `\n    "Content-Type": "audio/wav",` : `\n    "Content-Type": "application/json",`}\n  },${operation.method === "GET" ? "" : fileBody ? `\n  body: audioBytes,` : `\n  body: JSON.stringify(${bodyJson}),`}\n});\n\nif (!response.ok) throw new Error(\`Deepgram HTTP \${response.status}\`);\nconst data = ${isTts ? "await response.arrayBuffer()" : "await response.json()"};`,
    Go: `apiKey := os.Getenv("DEEPGRAM_API_KEY")\nbody := []byte(${JSON.stringify(JSON.stringify(body ?? {}))})\nreq, _ := http.NewRequest("${operation.method}", "${url}", bytes.NewReader(body))\nreq.Header.Set("Authorization", "Token "+apiKey)\nreq.Header.Set("Content-Type", "${fileBody ? "audio/wav" : "application/json"}")\nresp, err := http.DefaultClient.Do(req)\nif err != nil { return err }\ndefer resp.Body.Close()${isTts ? `\nout, err := os.Create("speech.bin")\nif err != nil { return err }\ndefer out.Close()\n_, err = io.Copy(out, resp.Body)` : ""}`,
    ".NET": `var apiKey = Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY");\nusing var request = new HttpRequestMessage(HttpMethod.${operation.method === "GET" ? "Get" : "Post"}, "${url}");\nrequest.Headers.Authorization = new AuthenticationHeaderValue("Token", apiKey);${operation.method === "GET" ? "" : `\nrequest.Content = new StringContent(${JSON.stringify(JSON.stringify(body ?? {}))}, Encoding.UTF8, "application/json");`}\nusing var response = await httpClient.SendAsync(request);\nresponse.EnsureSuccessStatusCode();${isTts ? `\nvar audioBytes = await response.Content.ReadAsByteArrayAsync();\nawait File.WriteAllBytesAsync("speech.bin", audioBytes);` : ""}`,
  };
}

function directBodyForCode(operation: ApiOperation, preview: unknown) {
  if (!preview || typeof preview !== "object") return preview;
  const body = { ...(preview as Record<string, unknown>) };
  delete body.file;
  delete body.binaryAudio;
  if (operation.transport === "REST JSON") return body;
  return body;
}

function appendQuery(endpoint: string, query: Record<string, string>) {
  try {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  } catch {
    const entries = new URLSearchParams(query).toString();
    return entries ? `${endpoint}?${entries}` : endpoint;
  }
}

function parseJsonPreview(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { invalidJson: true, source: value };
  }
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ApiChip({ children, tone = "slate" }: { children: React.ReactNode; tone?: "cyan" | "violet" | "rose" | "slate" }) {
  const className = tone === "cyan"
    ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    : tone === "violet"
        ? "border-violet-300/25 bg-violet-300/10 text-violet-100"
        : tone === "rose"
          ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
        : "border-white/10 bg-white/[0.04] text-slate-400";
  return <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}>{children}</span>;
}

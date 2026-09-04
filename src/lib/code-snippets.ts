export type CodeSnippetLanguage = "Shell" | "Python" | "TypeScript" | "Go" | ".NET";

export type LabModuleId =
  | "overview"
  | "lab-evolution"
  | "connection"
  | "transcribe-url"
  | "upload-audio"
  | "audio-signal-lab"
  | "live-mic"
  | "tts"
  | "flux-tts"
  | "trusted-voice"
  | "sample-library"
  | "language-explorer"
  | "redaction-lab"
  | "api-studio"
  | "applied-voice-systems"
  | "applied-engineering-questline"
  | "live-observatory"
  | "code-lab";

export type CodeSnippet = {
  language: CodeSnippetLanguage;
  title: string;
  code: string;
};

export type ModuleCodePack = {
  note: string;
  snippets: CodeSnippet[];
};

const TRANSCRIBE_URL_SNIPPETS: CodeSnippet[] = [
  {
    language: "Shell",
    title: "curl hosted audio URL",
    code: `curl -X POST "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true" \\
  -H "Authorization: Token $DEEPGRAM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"YOUR_AUDIO_URL"}'`,
  },
  {
    language: "Python",
    title: "Python requests",
    code: `import os, requests

url = "https://api.deepgram.com/v1/listen"
params = {"model": "nova-3", "language": "en", "smart_format": "true"}
headers = {"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"}
payload = {"url": "YOUR_AUDIO_URL"}

response = requests.post(url, params=params, headers=headers, json=payload)
print(response.json()["results"]["channels"][0]["alternatives"][0]["transcript"])`,
  },
  {
    language: "TypeScript",
    title: "TypeScript fetch",
    code: `const response = await fetch(
  "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true",
  {
    method: "POST",
    headers: {
      Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: "YOUR_AUDIO_URL" }),
  },
);

const data = await response.json();
console.log(data.results.channels[0].alternatives[0].transcript);`,
  },
  {
    language: "Go",
    title: "Go http.Client",
    code: `package main

import (
  "bytes"
  "net/http"
  "os"
)

func main() {
  body := []byte(\`{"url":"YOUR_AUDIO_URL"}\`)
  req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", bytes.NewReader(body))
  req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  http.DefaultClient.Do(req)
}`,
  },
  {
    language: ".NET",
    title: "C# HttpClient",
    code: `using System.Net.Http.Headers;
using System.Text;

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));

var json = """{"url":"YOUR_AUDIO_URL"}""";
var response = await client.PostAsync(
  "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true",
  new StringContent(json, Encoding.UTF8, "application/json"));

Console.WriteLine(await response.Content.ReadAsStringAsync());`,
  },
];

const UPLOAD_SNIPPETS: CodeSnippet[] = [
  {
    language: "Shell",
    title: "curl local audio file",
    code: `curl -X POST "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true" \\
  -H "Authorization: Token $DEEPGRAM_API_KEY" \\
  -H "Content-Type: audio/wav" \\
  --data-binary @YOUR_FILE_PATH`,
  },
  {
    language: "Python",
    title: "Python file upload",
    code: `import os, requests

with open("YOUR_FILE_PATH", "rb") as audio:
    response = requests.post(
        "https://api.deepgram.com/v1/listen",
        params={"model": "nova-3", "language": "en", "smart_format": "true"},
        headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}", "Content-Type": "audio/wav"},
        data=audio,
    )
print(response.json())`,
  },
  {
    language: "TypeScript",
    title: "Node fetch bytes",
    code: `import { readFile } from "node:fs/promises";

const audio = await readFile("YOUR_FILE_PATH");
const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", {
  method: "POST",
  headers: {
    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,
    "Content-Type": "audio/wav",
  },
  body: audio,
});
console.log(await response.json());`,
  },
  {
    language: "Go",
    title: "Go file bytes",
    code: `audio, _ := os.ReadFile("YOUR_FILE_PATH")
req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", bytes.NewReader(audio))
req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
req.Header.Set("Content-Type", "audio/wav")
http.DefaultClient.Do(req)`,
  },
  {
    language: ".NET",
    title: "C# byte upload",
    code: `var audio = await File.ReadAllBytesAsync("YOUR_FILE_PATH");
using var content = new ByteArrayContent(audio);
content.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));
await client.PostAsync("https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", content);`,
  },
];

const TOKEN_SNIPPETS: CodeSnippet[] = [
  {
    language: "Shell",
    title: "Temporary token grant",
    code: `curl -X POST "https://api.deepgram.com/v1/auth/grant" \\
  -H "Authorization: Token $DEEPGRAM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"ttl_seconds":60}'`,
  },
  {
    language: "Python",
    title: "Python temporary token",
    code: `import os, requests

response = requests.post(
    "https://api.deepgram.com/v1/auth/grant",
    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},
    json={"ttl_seconds": 60},
)
token = response.json()
print({"ok": response.ok, "expires_in": token.get("expires_in")})`,
  },
  {
    language: "TypeScript",
    title: "Server route token grant",
    code: `export async function POST() {
  const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });

  const { access_token, expires_in } = await response.json();
  if (!response.ok || typeof access_token !== "string") {
    return Response.json(
      { ok: false, error: { message: "Temporary token grant failed." } },
      { status: response.status || 502 },
    );
  }

  const credentialPreview =
    access_token.length > 10
      ? access_token.slice(0, 4) + "..." + access_token.slice(-4)
      : "***redacted***";
  const inspector = {
    timeline: [{ label: "Temporary token granted" }],
    response: { credentialPreview, expires_in },
  };
  return Response.json(
    { ok: true, access_token, expires_in, inspector },
    { headers: { "Cache-Control": "no-store" } },
  );
}`,
  },
  {
    language: "Go",
    title: "Go token grant",
    code: `body := []byte(\`{"ttl_seconds":60}\`)
req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/auth/grant", bytes.NewReader(body))
req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
req.Header.Set("Content-Type", "application/json")
http.DefaultClient.Do(req)`,
  },
  {
    language: ".NET",
    title: "C# token grant",
    code: `var json = """{"ttl_seconds":60}""";
using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));
await client.PostAsync("https://api.deepgram.com/v1/auth/grant", new StringContent(json, Encoding.UTF8, "application/json"));`,
  },
];

const TTS_SNIPPETS: CodeSnippet[] = [
  {
    language: "Shell",
    title: "curl Speak",
    code: `curl -X POST "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3" \\
  -H "Authorization: Token $DEEPGRAM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -o output.mp3 \\
  -d '{"text":"Hello from Deepgram text to speech."}'`,
  },
  {
    language: "Python",
    title: "Python TTS",
    code: `import os, requests

response = requests.post(
    "https://api.deepgram.com/v1/speak",
    params={"model": "aura-2-thalia-en", "encoding": "mp3"},
    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},
    json={"text": "Hello from Deepgram text to speech."},
)
open("output.mp3", "wb").write(response.content)`,
  },
  {
    language: "TypeScript",
    title: "TypeScript TTS",
    code: `const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3", {
  method: "POST",
  headers: {
    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ text: "Hello from Deepgram text to speech." }),
});

const audio = await response.arrayBuffer();`,
  },
  {
    language: "Go",
    title: "Go TTS",
    code: `body := []byte(\`{"text":"Hello from Deepgram text to speech."}\`)
req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3", bytes.NewReader(body))
req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
req.Header.Set("Content-Type", "application/json")
http.DefaultClient.Do(req)`,
  },
  {
    language: ".NET",
    title: "C# TTS",
    code: `var json = """{"text":"Hello from Deepgram text to speech."}""";
using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));
var response = await client.PostAsync("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3", new StringContent(json, Encoding.UTF8, "application/json"));
var audio = await response.Content.ReadAsByteArrayAsync();`,
  },
];

const TRUSTED_VOICE_SNIPPETS: CodeSnippet[] = [
  {
    language: "Shell",
    title: "curl consent-based transactional voice",
    code: `curl -X POST "https://api.deepgram.com/v1/speak?model=aura-2-harmonia-en" \\
  -H "Authorization: Token $DEEPGRAM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -o trusted-message.mp3 \\
  -d '{"text":"Hello Jordan. This is an automated appointment reminder from Northside Clinic. Your visit with Dr. Rivera is tomorrow at 9:30 AM. Reply to the text message if you need to reschedule."}'`,
  },
  {
    language: "Python",
    title: "Python approved Aura voice",
    code: `import os, requests

message = (
    "Hello Jordan. This is an automated appointment reminder from Northside Clinic. "
    "Your visit with Dr. Rivera is tomorrow at 9:30 AM. Reply to the text message if you need to reschedule."
)

response = requests.post(
    "https://api.deepgram.com/v1/speak",
    params={"model": "aura-2-harmonia-en"},
    headers={
        "Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={"text": message},
)
response.raise_for_status()
open("trusted-message.mp3", "wb").write(response.content)`,
  },
  {
    language: "TypeScript",
    title: "TypeScript server-side TTS",
    code: `const message =
  "This is an automated message delivered using an approved synthetic voice. Hi Jordan. Please open your banking app or call the verified number on your card.";

const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-mars-en", {
  method: "POST",
  headers: {
    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ text: message }),
});

const audio = await response.arrayBuffer();`,
  },
  {
    language: "Go",
    title: "Go transactional message",
    code: `message := []byte(\`{"text":"This is an automated message delivered using an approved synthetic voice. Your prescription is ready for pickup. Check the verified pharmacy app for details."}\`)
req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en", bytes.NewReader(message))
req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
req.Header.Set("Content-Type", "application/json")
response, err := http.DefaultClient.Do(req)
if err != nil {
  panic(err)
}
defer response.Body.Close()`,
  },
  {
    language: ".NET",
    title: "C# Aura TTS",
    code: `using System.Net.Http.Headers;
using System.Text;

var message = "Hello Jordan. This is an automated reminder from Northside Clinic. Your appointment is tomorrow at 9:30 AM.";
var json = $$"""{"text":{{System.Text.Json.JsonSerializer.Serialize(message)}}}""";

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));

var response = await client.PostAsync(
  "https://api.deepgram.com/v1/speak?model=aura-2-harmonia-en",
  new StringContent(json, Encoding.UTF8, "application/json"));
var audio = await response.Content.ReadAsByteArrayAsync();`,
  },
];

export const MODULE_CODE_SNIPPETS: Record<LabModuleId, ModuleCodePack> = {
  overview: {
    note: "The lab is a local Next.js control room. Server routes protect DEEPGRAM_API_KEY and expose sanitized inspector envelopes.",
    snippets: TOKEN_SNIPPETS,
  },
  "lab-evolution": {
    note: "Lab Evolution reads repository-controlled evidence, module maturity, and recorded history. It does not run provider requests or claim unverified deployments, commits, checkpoints, or test results.",
    snippets: TOKEN_SNIPPETS,
  },
  connection: {
    note: "Health checks verify server-side key access without exposing the key to the browser.",
    snippets: TOKEN_SNIPPETS,
  },
  "transcribe-url": {
    note: "Hosted audio URL transcription sends JSON with a public audio URL to Deepgram prerecorded listen.",
    snippets: TRANSCRIBE_URL_SNIPPETS,
  },
  "upload-audio": {
    note: "Local file transcription sends audio bytes from the server to Deepgram. Binary audio is never dumped into inspector JSON.",
    snippets: UPLOAD_SNIPPETS,
  },
  "audio-signal-lab": {
    note: "Audio Signal Lab performs browser-native signal analysis, local fixtures, copied offline variants, and explicitly confirmed two-request comparisons. It never modifies Live Mic transport or persists raw audio by default.",
    snippets: [...UPLOAD_SNIPPETS.slice(0, 2), ...TOKEN_SNIPPETS.slice(0, 1)],
  },
  "live-mic": {
    note: "Browser mic requests a temporary JWT from the server, opens Deepgram with the bearer WebSocket subprotocol, and starts MediaRecorder only after the socket opens. If realtime fails, the 5-second fallback uploads audio through /api/deepgram/transcribe-file.",
    snippets: TOKEN_SNIPPETS,
  },
  tts: {
    note: "Text to Speech sends JSON text to Deepgram Speak and receives playable audio bytes.",
    snippets: TTS_SNIPPETS,
  },
  "flux-tts": {
    note: "Flux TTS Studio sends allowlisted batch requests through the guarded /api/deepgram/flux-tts application route. Streaming remains gated until its deployed browser auth and raw-audio path are verified.",
    snippets: TTS_SNIPPETS,
  },
  "trusted-voice": {
    note: "Familiar Care previews approved Aura voices only after the local TTS route revalidates consent, disclosure, sensitive-detail policy, fallback, and opt-out. Low-level provider snippets are syntax references, not a replacement for that policy gate.",
    snippets: TRUSTED_VOICE_SNIPPETS,
  },
  "sample-library": {
    note: "Sample audio generation uses Deepgram Speak locally to create repeatable MP3 demo assets.",
    snippets: TTS_SNIPPETS,
  },
  "language-explorer": {
    note: "Language selection is just a query parameter. Specific codes constrain recognition; multi enables supported multilingual audio.",
    snippets: TRANSCRIBE_URL_SNIPPETS,
  },
  "redaction-lab": {
    note: "Redaction Lab models transcript-governance policies and exact repeated redact query parameters. It never labels source audio as redacted and its fixtures make no live requests.",
    snippets: TRANSCRIBE_URL_SNIPPETS,
  },
  "api-studio": {
    note: "API Studio builds Deepgram requests by category, executes only guarded local routes, and keeps every credential out of generated code and inspector data.",
    snippets: [...TRANSCRIBE_URL_SNIPPETS.slice(0, 2), ...TOKEN_SNIPPETS.slice(0, 1), ...TTS_SNIPPETS.slice(0, 1)],
  },
  "applied-voice-systems": {
    note: "Applied Voice Systems connects discovery, architecture, experiments, traces, evaluation, resilience, and a sanitized client solution brief. Executable API work remains in guarded local routes and API Studio.",
    snippets: [...TRANSCRIBE_URL_SNIPPETS.slice(0, 1), ...TOKEN_SNIPPETS.slice(0, 1), ...TTS_SNIPPETS.slice(0, 1)],
  },
  "applied-engineering-questline": {
    note: "Applied Engineering Questline teaches runtime behavior, polyglot implementation, audio systems, debugging, testing, and client impact without executing learner-authored code. Live calls remain in guarded lab modules.",
    snippets: [...TRANSCRIBE_URL_SNIPPETS.slice(0, 2), ...TOKEN_SNIPPETS.slice(0, 1), ...TTS_SNIPPETS.slice(0, 1)],
  },
  "live-observatory": {
    note: "Live Observatory Lab separates deterministic synthetic fixtures from explicitly confirmed live requests, correlates sanitized events and request IDs, and enforces local Credit Guard limits.",
    snippets: [...TRANSCRIBE_URL_SNIPPETS.slice(0, 1), ...TOKEN_SNIPPETS.slice(0, 1), ...TTS_SNIPPETS.slice(0, 1)],
  },
  "code-lab": {
    note: "Code Lab collects language-specific examples for the active Deepgram workflow.",
    snippets: [...TRANSCRIBE_URL_SNIPPETS.slice(0, 2), ...UPLOAD_SNIPPETS.slice(0, 1), ...TTS_SNIPPETS.slice(0, 2)],
  },
};

import type { DeepgramEffectiveRequest, DeepgramEndpointDefinition } from "@/types/deepgram-endpoint-registry";

export type DeepgramCodeSnippets = Record<"curl" | "Python" | "TypeScript" | "Go" | ".NET", string>;

export function generateDeepgramCodeSnippets(endpoint: DeepgramEndpointDefinition, request: DeepgramEffectiveRequest): DeepgramCodeSnippets {
  if (endpoint.protocol === "wss") return websocketSnippets(endpoint, request.sanitizedUrl);
  const body = request.body === null || request.method === "GET" || request.method === "DELETE" ? null : JSON.stringify(request.body, null, 2);
  const audio = endpoint.responseType === "audio";
  return {
    curl: [
      `curl --request ${request.method} \\`,
      `  --url '${request.sanitizedUrl}' \\`,
      `  --header 'Authorization: Token '$DEEPGRAM_API_KEY${body ? " \\" : ""}`,
      ...(body ? [`  --header 'Content-Type: application/json' \\`, `  --data '${body.replaceAll("'", "'\\''")}'${audio ? " \\" : ""}`] : []),
      ...(audio ? [`  --output speech.bin`] : []),
    ].join("\n"),
    Python: [
      "import os",
      ...(audio ? ["from pathlib import Path"] : []),
      "import requests",
      "",
      `response = requests.request(`,
      `    "${request.method}",`,
      `    "${request.sanitizedUrl}",`,
      `    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},`,
      ...(body ? [`    json=${pythonLiteral(request.body)},`] : []),
      `    timeout=45,`,
      `)`,
      "response.raise_for_status()",
      audio ? `Path("speech.bin").write_bytes(response.content)` : "print(response.json())",
    ].join("\n"),
    TypeScript: [
      `const response = await fetch(${JSON.stringify(request.sanitizedUrl)}, {`,
      `  method: ${JSON.stringify(request.method)},`,
      `  headers: {`,
      `    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,`,
      ...(body ? [`    "Content-Type": "application/json",`] : []),
      `  },`,
      ...(body ? [`  body: JSON.stringify(${body}),`] : []),
      `});`,
      `if (!response.ok) throw new Error(\`Deepgram HTTP \${response.status}\`);`,
      audio ? "const audio = await response.arrayBuffer();" : "const data = await response.json();\nconsole.log(data);",
    ].join("\n"),
    Go: [
      "package main",
      "",
      "import (",
      ...(body ? [`  "bytes"`] : []),
      ...(audio ? [`  "io"`, `  "os"`] : [`  "fmt"`, `  "encoding/json"`, `  "os"`]),
      `  "net/http"`,
      ")",
      "",
      "func main() {",
      ...(body ? [`  body := []byte(${JSON.stringify(JSON.stringify(request.body))})`, `  req, _ := http.NewRequest("${request.method}", "${request.sanitizedUrl}", bytes.NewReader(body))`, `  req.Header.Set("Content-Type", "application/json")`] : [`  req, _ := http.NewRequest("${request.method}", "${request.sanitizedUrl}", nil)`]),
      `  req.Header.Set("Authorization", "Token " + os.Getenv("DEEPGRAM_API_KEY"))`,
      `  resp, err := http.DefaultClient.Do(req)`,
      `  if err != nil { panic(err) }`,
      `  defer resp.Body.Close()`,
      ...(audio ? [`  out, _ := os.Create("speech.bin")`, `  defer out.Close()`, `  _, _ = io.Copy(out, resp.Body)`] : [`  var data any`, `  _ = json.NewDecoder(resp.Body).Decode(&data)`, `  fmt.Println(data)`]),
      "}",
    ].join("\n"),
    ".NET": [
      "using System.Net.Http.Headers;",
      "using System.Text;",
      "",
      "using var client = new HttpClient();",
      `using var request = new HttpRequestMessage(HttpMethod.${dotnetMethod(request.method)}, ${JSON.stringify(request.sanitizedUrl)});`,
      `request.Headers.Authorization = new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));`,
      ...(body ? [`request.Content = new StringContent(${JSON.stringify(JSON.stringify(request.body))}, Encoding.UTF8, "application/json");`] : []),
      "using var response = await client.SendAsync(request);",
      "response.EnsureSuccessStatusCode();",
      audio ? `await File.WriteAllBytesAsync("speech.bin", await response.Content.ReadAsByteArrayAsync());` : `Console.WriteLine(await response.Content.ReadAsStringAsync());`,
    ].join("\n"),
  };
}

function websocketSnippets(endpoint: DeepgramEndpointDefinition, url: string): DeepgramCodeSnippets {
  const note = "Obtain a short-lived token from your own server. Never embed DEEPGRAM_API_KEY in browser code.";
  return {
    curl: `# ${note}\n# Browser WebSocket handoff: ${url}\n# Authorization uses Sec-WebSocket-Protocol: bearer, <TEMPORARY_TOKEN>`,
    Python: `# ${note}\nfrom websockets.sync.client import connect\n\nwith connect(${JSON.stringify(url)}, additional_headers={"Authorization": "Bearer <TEMPORARY_TOKEN>"}) as socket:\n    print("Connected to ${endpoint.officialName}")`,
    TypeScript: `// ${note}\nconst tokenResponse = await fetch("/api/deepgram/token", { method: "POST" });\nconst { access_token } = await tokenResponse.json();\nconst socket = new WebSocket(${JSON.stringify(url)}, ["bearer", access_token]);\nsocket.addEventListener("message", (event) => console.log(event.data));`,
    Go: `// ${note}\n// Connect to ${url} with Authorization: Bearer <TEMPORARY_TOKEN> using your chosen WebSocket library.`,
    ".NET": `// ${note}\nusing var socket = new ClientWebSocket();\nsocket.Options.SetRequestHeader("Authorization", "Bearer <TEMPORARY_TOKEN>");\nawait socket.ConnectAsync(new Uri(${JSON.stringify(url)}), CancellationToken.None);`,
  };
}

function pythonLiteral(value: unknown) {
  return JSON.stringify(value, null, 2).replaceAll("true", "True").replaceAll("false", "False").replaceAll("null", "None");
}
function dotnetMethod(method: string) {
  if (method === "DELETE") return "Delete";
  if (method === "PATCH") return "Patch";
  if (method === "PUT") return "Put";
  if (method === "POST") return "Post";
  return "Get";
}

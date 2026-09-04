import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:tls";

const GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
const AGENT_HOST = "agent.deepgram.com";
const AGENT_PATH = "/v1/agent/converse";
const TIMEOUT_MS = 15_000;
const SETTINGS = {
  type: "Settings",
  audio: {
    input: { encoding: "linear16", sample_rate: 16_000 },
    output: { encoding: "linear16", sample_rate: 24_000, container: "none" },
  },
  agent: {
    language: "en",
    listen: { provider: { type: "deepgram", model: "nova-3" } },
    think: { provider: { type: "nvidia", model: "nvidia/nemotron-3-nano-30b-a3b" } },
    speak: { provider: { type: "deepgram", model: "aura-2-asteria-en" } },
  },
};

loadLocalEnvironment();
const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
if (!apiKey) {
  console.error("DEEPGRAM_API_KEY is required in the environment or .env.local.");
  process.exit(1);
}

try {
  const grant = await requestTemporaryToken(apiKey);
  console.log(`Temporary token acquired (expires_in=${grant.expires_in}s; value redacted).`);
  await diagnoseHandshake(grant.access_token);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Voice Agent diagnostic failed.");
  process.exitCode = 1;
}

async function requestTemporaryToken(key) {
  const response = await fetch(GRANT_URL, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Token grant failed with HTTP ${response.status}.`);
  if (!body || typeof body.access_token !== "string" || !body.access_token || typeof body.expires_in !== "number" || body.expires_in <= 0) {
    throw new Error("Token grant response was missing a usable access_token or expires_in.");
  }
  return { access_token: body.access_token, expires_in: body.expires_in };
}

function diagnoseHandshake(accessToken) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: AGENT_HOST, port: 443, servername: AGENT_HOST });
    const websocketKey = randomBytes(16).toString("base64");
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    let settled = false;
    let settingsAccepted = false;
    const timeout = setTimeout(() => finish(new Error("Timed out waiting for SettingsApplied.")), TIMEOUT_MS);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!socket.destroyed) socket.end();
      if (error) reject(error);
      else resolve();
    }

    socket.once("secureConnect", () => {
      const request = [
        `GET ${AGENT_PATH} HTTP/1.1`,
        `Host: ${AGENT_HOST}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${websocketKey}`,
        "Sec-WebSocket-Version: 13",
        `Sec-WebSocket-Protocol: bearer, ${accessToken}`,
        "Origin: http://localhost:3000",
        "User-Agent: one-voice-lab-deepgram-diagnostic",
        "",
        "",
      ].join("\r\n");
      socket.write(request);
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const headerText = buffer.subarray(0, headerEnd).toString("utf8");
        buffer = buffer.subarray(headerEnd + 4);
        const { statusLine, headers } = parseHeaders(headerText);
        console.log(`Handshake: ${statusLine}`);
        console.log(`dg-error: ${headers.get("dg-error") || "not provided"}`);
        console.log(`dg-request-id: ${headers.get("dg-request-id") || "not provided"}`);
        if (!/^HTTP\/1\.1 101\b/.test(statusLine)) {
          finish(new Error("Voice Agent WebSocket upgrade failed."));
          return;
        }
        console.log(`Selected subprotocol: ${headers.get("sec-websocket-protocol") || "not provided"}`);
        upgraded = true;
        socket.write(encodeClientFrame(0x1, Buffer.from(JSON.stringify(SETTINGS))));
        console.log("Settings sent; waiting for SettingsApplied.");
      }
      if (upgraded) buffer = consumeFrames(buffer, (opcode, payload) => {
        if (opcode === 0x9) {
          socket.write(encodeClientFrame(0xA, payload));
          return;
        }
        if (opcode === 0x8) {
          const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
          const reason = payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
          finish(settingsAccepted ? undefined : new Error(`Socket closed before SettingsApplied (${code}${reason ? `: ${reason}` : ""}).`));
          return;
        }
        if (opcode !== 0x1) return;
        const message = JSON.parse(payload.toString("utf8"));
        console.log(`Event: ${message.type || "Unknown"}${message.request_id ? ` (request_id=${message.request_id})` : ""}`);
        if (message.type === "Error") {
          finish(new Error(`Deepgram error: ${message.description || message.message || message.code || "unknown"}`));
        } else if (message.type === "SettingsApplied") {
          settingsAccepted = true;
          socket.write(encodeClientFrame(0x8, Buffer.concat([writeUInt16(1000), Buffer.from("Diagnostic complete")] )));
          console.log("SettingsApplied received; diagnostic socket closed cleanly.");
          finish();
        }
      });
    });

    socket.once("error", (error) => finish(error));
    socket.once("end", () => {
      if (!settled) finish(settingsAccepted ? undefined : new Error("TLS connection ended before the diagnostic completed."));
    });
  });
}

function parseHeaders(text) {
  const [statusLine, ...lines] = text.split("\r\n");
  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator > 0) headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  return { statusLine, headers };
}

function consumeFrames(input, onFrame) {
  let offset = 0;
  while (input.length - offset >= 2) {
    const first = input[offset];
    const second = input[offset + 1];
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (input.length - offset < 4) break;
      length = input.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (input.length - offset < 10) break;
      const wideLength = input.readBigUInt64BE(offset + 2);
      if (wideLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("WebSocket frame was too large.");
      length = Number(wideLength);
      headerLength = 10;
    }
    if (input.length - offset < headerLength + length) break;
    onFrame(first & 0x0f, input.subarray(offset + headerLength, offset + headerLength + length));
    offset += headerLength + length;
  }
  return input.subarray(offset);
}

function encodeClientFrame(opcode, payload) {
  const mask = randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) masked[index] = payload[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function loadLocalEnvironment() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2").trim();
  }
}

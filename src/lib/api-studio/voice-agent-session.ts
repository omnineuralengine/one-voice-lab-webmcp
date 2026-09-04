export const DEEPGRAM_VOICE_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse";

export type TemporaryTokenGrant = {
  accessToken: string;
  expiresIn: number;
  acquiredAtMs: number;
  expiresAtMs: number;
};

export async function requestTemporaryToken(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<TemporaryTokenGrant> {
  const response = await fetcher("/api/deepgram/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttlSeconds: 60 }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = readRouteError(body) || `Temporary token request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return parseTemporaryTokenGrant(body, now());
}

export function parseTemporaryTokenGrant(value: unknown, acquiredAtMs = Date.now()): TemporaryTokenGrant {
  if (!isRecord(value) || typeof value.access_token !== "string" || !value.access_token.trim()) {
    throw new Error("Temporary token response is missing access_token.");
  }
  if (typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in)) {
    throw new Error("Temporary token response is missing a valid expires_in.");
  }
  if (value.expires_in <= 0) throw new Error("Temporary token is expired.");
  return {
    accessToken: value.access_token,
    expiresIn: value.expires_in,
    acquiredAtMs,
    expiresAtMs: acquiredAtMs + value.expires_in * 1_000,
  };
}

export function deepgramBearerSubprotocols(accessToken: string): ["bearer", string] {
  const token = accessToken.trim();
  if (!token) throw new Error("A temporary Bearer token is required for the Voice Agent WebSocket.");
  return ["bearer", token];
}

export function validateVoiceAgentSettings(value: unknown): string[] {
  if (!isRecord(value)) return ["Settings must be a JSON object."];
  const issues: string[] = [];
  if (value.type !== "Settings") issues.push('Settings.type must be "Settings".');
  const audio = isRecord(value.audio) ? value.audio : null;
  const input = audio && isRecord(audio.input) ? audio.input : null;
  const output = audio && isRecord(audio.output) ? audio.output : null;
  if (!input || typeof input.encoding !== "string" || typeof input.sample_rate !== "number") {
    issues.push("Settings.audio.input must include encoding and sample_rate.");
  }
  if (!output || typeof output.encoding !== "string" || typeof output.sample_rate !== "number" || typeof output.container !== "string") {
    issues.push("Settings.audio.output must include encoding, sample_rate, and container.");
  }
  const agent = isRecord(value.agent) ? value.agent : null;
  if (!agent) return [...issues, "Settings.agent must be an object."];
  for (const stage of ["listen", "think", "speak"] as const) {
    const configuration = isRecord(agent[stage]) ? agent[stage] : null;
    const provider = configuration && isRecord(configuration.provider) ? configuration.provider : null;
    if (!provider || typeof provider.type !== "string" || typeof provider.model !== "string") {
      issues.push(`Settings.agent.${stage}.provider must include type and model.`);
    }
  }
  return issues;
}

function readRouteError(value: unknown) {
  if (!isRecord(value) || !isRecord(value.error)) return "";
  return typeof value.error.message === "string" ? value.error.message : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

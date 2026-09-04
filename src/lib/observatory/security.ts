import { redactSecrets } from "@/lib/inspection";

const HIGH_CONFIDENCE_SECRET = /(?:Authorization\s*[:=]\s*(?:Token|Bearer)\s+(?!\*{3}|\$?DEEPGRAM_API_KEY|YOUR_API_KEY)[A-Za-z0-9._~-]{16,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|DEEPGRAM_API_KEY\s*=\s*(?!DEEPGRAM_API_KEY|YOUR_API_KEY|\*{3})[^\s"']{16,})/i;

export function sanitizeObservatoryArtifact<T>(value: T): T {
  return redactSecrets(value);
}

export function assertObservatoryArtifactSafe(value: unknown) {
  const serialized = JSON.stringify(sanitizeObservatoryArtifact(value));
  if (HIGH_CONFIDENCE_SECRET.test(serialized)) {
    throw new Error("Export blocked because a high-confidence credential pattern remained after sanitization.");
  }
  return serialized;
}

export function safeDownloadName(runId: string, extension: "json" | "md") {
  return `live-observatory-${runId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}.${extension}`;
}

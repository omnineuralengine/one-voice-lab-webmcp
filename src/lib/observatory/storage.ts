import { assertObservatoryArtifactSafe, sanitizeObservatoryArtifact } from "@/lib/observatory/security";
import type { ObservatoryRun, ObservatorySavedRun } from "@/types/observatory";

export const OBSERVATORY_HISTORY_KEY = "deepgram-observatory-runs:v1";

export function loadObservatoryHistory(): ObservatorySavedRun[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(OBSERVATORY_HISTORY_KEY) || "[]") as unknown;
    return Array.isArray(value) ? sanitizeObservatoryArtifact(value).slice(0, 25) as ObservatorySavedRun[] : [];
  } catch {
    return [];
  }
}

export function saveObservatoryRun(run: ObservatoryRun, includeTranscript: boolean) {
  const saved: ObservatorySavedRun = sanitizeObservatoryArtifact({
    ...run,
    inspector: undefined,
    transcript: includeTranscript ? run.transcript : undefined,
    comparisonTranscript: includeTranscript ? run.comparisonTranscript : undefined,
    referenceTranscript: includeTranscript ? run.referenceTranscript : undefined,
    events: run.events.map((event) => {
      const { sanitizedPayload, ...metadata } = event;
      void sanitizedPayload;
      return !includeTranscript && /transcript/i.test(event.eventType)
        ? { ...metadata, value: "[transcript omitted]" }
        : metadata;
    }),
    savedAt: new Date().toISOString(),
    transcriptIncluded: includeTranscript,
    retention: includeTranscript ? "metadata-and-sanitized-transcript" : "metadata-only",
  });
  assertObservatoryArtifactSafe(saved);
  const next = [saved, ...loadObservatoryHistory().filter((item) => item.runId !== saved.runId)].slice(0, 25);
  window.localStorage.setItem(OBSERVATORY_HISTORY_KEY, JSON.stringify(next));
  return saved;
}

export function deleteObservatoryTranscripts() {
  const next = loadObservatoryHistory().map((item) => ({ ...item, transcript: undefined, comparisonTranscript: undefined, referenceTranscript: undefined, transcriptIncluded: false, retention: "metadata-only" as const }));
  window.localStorage.setItem(OBSERVATORY_HISTORY_KEY, JSON.stringify(next));
}

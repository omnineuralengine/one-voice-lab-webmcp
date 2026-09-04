import {
  EVALUATION_MAX_TEXT_LENGTH,
  evaluationEvidenceBundleSchema,
  evaluationStreamEventSchema,
  type EvaluationExecutionMode,
  type EvaluationEvidenceBundle,
  type EvaluationStreamEvent,
} from "@/lib/evaluation/schema";
import { providerIdSchema, type ProviderId } from "@/lib/providers/types";

import {
  type AdvancedControl,
  type CatalogOption,
  type EvaluateCapabilities,
  type EvaluateCatalog,
  type EvaluateProviderCapability,
} from "@/components/evaluate/types";

export async function fetchEvaluationCapabilities(signal?: AbortSignal): Promise<EvaluateCapabilities> {
  const response = await fetch("/api/evaluate/capabilities", { cache: "no-store", signal });
  const body = await readJson(response);
  if (!response.ok) throw new Error(readError(body, "Evaluation capabilities are unavailable."));
  return normalizeCapabilities(unwrapData(body));
}

export async function fetchEvaluationCatalog(
  providerId: ProviderId,
  mode: EvaluationExecutionMode,
  signal?: AbortSignal,
): Promise<EvaluateCatalog> {
  const response = await fetch(`/api/evaluate/catalogs?provider=${encodeURIComponent(providerId)}&mode=${encodeURIComponent(mode)}`, {
    cache: "no-store",
    signal,
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(readError(body, `${providerName(providerId)} catalog is unavailable.`));
  return normalizeCatalog(unwrapData(body), providerId);
}

export async function runEvaluation(
  request: unknown,
  signal: AbortSignal,
  onEvent: (event: EvaluationStreamEvent) => void,
): Promise<EvaluationEvidenceBundle> {
  const response = await fetch("/api/evaluate/run", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, application/x-ndjson" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(readError(body, "The evaluation could not start."));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-ndjson")) {
    return readNdjsonRun(response, onEvent);
  }

  const raw = unwrapData(await readJson(response));
  const record = asRecord(raw);
  const events = Array.isArray(record.events)
    ? record.events.map((event) => evaluationStreamEventSchema.parse(event))
    : [];
  events.forEach(onEvent);
  return evaluationEvidenceBundleSchema.parse(record.bundle);
}

export function providerName(providerId: ProviderId): string {
  return providerId
    .split("-")
    .map((part) => part.length <= 3 ? part.toUpperCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizeCapabilities(value: unknown): EvaluateCapabilities {
  const record = asRecord(value);
  const providersValue = Array.isArray(record.providers) ? record.providers : [];
  const providers = providersValue
    .map(normalizeProviderCapability)
    .filter((provider): provider is EvaluateProviderCapability => provider !== null);

  return {
    liveEvaluationsEnabled: booleanValue(
      record.liveEvaluationsEnabled ?? record.liveEvaluationEnabled ?? record.liveEnabled,
    ),
    anonymousLiveEvaluationsEnabled: booleanValue(
      record.anonymousLiveEvaluationsEnabled ?? record.anonymousLiveEnabled,
    ),
    localLiveAvailable: booleanValue(record.localLiveAvailable),
    maximumTextLength: finiteNumber(record.maximumTextLength) ?? EVALUATION_MAX_TEXT_LENGTH,
    providers,
  };
}

function normalizeProviderCapability(value: unknown): EvaluateProviderCapability | null {
  const record = asRecord(value);
  const rawId = stringValue(record.id ?? record.providerId);
  if (!isProviderId(rawId)) return null;
  const readiness = asRecord(record.readiness);
  const rawImplementation = normalizeImplementation(stringValue(
    record.implementation ?? record.implementationStatus ?? record.behavior ?? record.status,
  ));
  const implementation = isImplementation(rawImplementation) ? rawImplementation : "unavailable";
  return {
    id: rawId,
    displayName: stringValue(record.displayName) || providerName(rawId),
    implementation,
    readiness: {
      listed: booleanValue(readiness.listed ?? record.listed),
      configured: booleanValue(readiness.configured ?? record.configured),
      adapterBacked: booleanValue(readiness.adapterBacked ?? record.adapterBacked),
      liveEnabled: booleanValue(
        record.protectedLiveAvailable ?? readiness.protectedLiveAvailable ?? readiness.liveEnabled ?? record.liveEnabled,
      ),
    },
    protectedLiveAvailable: booleanValue(record.protectedLiveAvailable ?? readiness.protectedLiveAvailable),
    fixtureAvailable: booleanValue(record.fixtureAvailable ?? record.simulatedAvailable),
    localLiveAvailable: booleanValue(record.localLiveAvailable),
    limitations: stringArray(record.limitations),
  };
}

function normalizeCatalog(value: unknown, providerId: ProviderId): EvaluateCatalog {
  const record = asRecord(value);
  const normalized = asRecord(record.normalizedOutput ?? record.normalizedAudio);
  const source = stringValue(record.source);
  return {
    providerId,
    source: isCatalogSource(source) ? source : "unavailable",
    message: stringValue(record.message) || "Catalog provenance was not supplied.",
    hasMoreVoices: booleanValue(record.hasMoreVoices),
    nextVoicePageToken: stringValue(record.nextVoicePageToken) || null,
    models: normalizeOptions(record.models),
    voices: normalizeOptions(record.voices),
    separateVoiceRequired: booleanValue(record.separateVoiceRequired),
    outputFormat: stringValue(record.outputFormat ?? record.standardizedOutputFormat),
    normalizedOutput: normalizeOutput(normalized),
    advancedControls: Array.isArray(record.advancedControls)
      ? record.advancedControls.map(normalizeAdvancedControl).filter((control): control is AdvancedControl => control !== null)
      : [],
    limitations: stringArray(record.limitations),
  };
}

function isCatalogSource(value: string): value is EvaluateCatalog["source"] {
  return ["deterministic-fixture", "validated-static", "provider-discovery", "unavailable"].includes(value);
}

async function readNdjsonRun(
  response: Response,
  onEvent: (event: EvaluationStreamEvent) => void,
): Promise<EvaluationEvidenceBundle> {
  if (!response.body) throw new Error("The evaluation stream ended before any results arrived.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let bundle: EvaluationEvidenceBundle | null = null;
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const raw = JSON.parse(line) as unknown;
      const event = parseStreamEvent(raw);
      onEvent(event);
      if (event.type === "run-complete") {
        const maybeBundle = asRecord(raw).bundle;
        if (maybeBundle) bundle = evaluationEvidenceBundleSchema.parse(maybeBundle);
      }
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const raw = JSON.parse(buffer) as unknown;
    const event = parseStreamEvent(raw);
    onEvent(event);
    if (event.type === "run-complete" && asRecord(raw).bundle) {
      bundle = evaluationEvidenceBundleSchema.parse(asRecord(raw).bundle);
    }
  }
  if (!bundle) throw new Error("The evaluation stream ended without its sanitized evidence bundle.");
  return bundle;
}

function parseStreamEvent(raw: unknown): EvaluationStreamEvent {
  const direct = evaluationStreamEventSchema.safeParse(raw);
  if (direct.success) return direct.data;
  const record = { ...asRecord(raw) };
  delete record.bundle;
  return evaluationStreamEventSchema.parse(record);
}

function normalizeOptions(value: unknown): CatalogOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return { id: entry, name: entry };
    const record = asRecord(entry);
    const id = stringValue(record.id ?? record.value);
    if (!id) return null;
    return {
      id,
      name: stringValue(record.name ?? record.label) || id,
      description: stringValue(record.description) || undefined,
    };
  }).filter((entry): entry is CatalogOption => entry !== null);
}

function normalizeAdvancedControl(value: unknown): AdvancedControl | null {
  const record = asRecord(value);
  const id = stringValue(record.id);
  const label = stringValue(record.label);
  const kind = stringValue(record.kind);
  if (!id || !label || !["select", "number", "boolean", "text"].includes(kind)) return null;
  return {
    id,
    label,
    description: stringValue(record.description) || "Provider-native control.",
    kind: kind as AdvancedControl["kind"],
    options: normalizeOptions(record.options),
    min: finiteNumber(record.min) ?? undefined,
    max: finiteNumber(record.max) ?? undefined,
    step: finiteNumber(record.step) ?? undefined,
    defaultValue: primitiveValue(record.defaultValue),
    comparisonNote: stringValue(record.comparisonNote) || "This provider-native setting is not normalized across providers.",
  };
}

function normalizeOutput(value: Record<string, unknown>): EvaluateCatalog["normalizedOutput"] {
  const encoding = stringValue(value.encoding);
  const sampleRate = finiteNumber(value.sampleRate);
  const channels = finiteNumber(value.channels);
  const mimeType = stringValue(value.mimeType);
  if (!encoding || sampleRate === null || channels === null || !mimeType || typeof value.serverWrapped !== "boolean") return null;
  return { encoding, sampleRate, channels, mimeType, serverWrapped: value.serverWrapped };
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value);
  return record.data ?? value;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function readError(value: unknown, fallback: string): string {
  const record = asRecord(value);
  const error = asRecord(record.error);
  return stringValue(error.message ?? record.message) || fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function primitiveValue(value: unknown): string | number | boolean | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function isProviderId(value: string): value is ProviderId {
  return providerIdSchema.safeParse(value).success;
}

function isImplementation(value: string): value is EvaluateProviderCapability["implementation"] {
  return ["implemented", "prototype", "simulated", "proposed", "unsupported", "unavailable"].includes(value);
}

function normalizeImplementation(value: string): string {
  const normalized = value.toLowerCase();
  return {
    working: "implemented",
    partial: "prototype",
    "demo-only": "simulated",
    planned: "proposed",
  }[normalized] ?? normalized;
}

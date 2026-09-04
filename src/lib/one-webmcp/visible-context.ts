import type { LabModuleId } from "@/lib/code-snippets";

export const ONE_VISIBLE_WORKSPACE_EVENT = "one:webmcp-visible-workspace";
export const ONE_VISIBLE_WORKSPACE_PROVIDER_ID = "deepgram" as const;

const internallyPublishedWorkspaceDetails = new WeakMap<Event, OneVisibleWorkspaceEventDetail>();

export const ONE_VISIBLE_WORKSPACE_MODULE_IDS = [
  "overview",
  "lab-evolution",
  "connection",
  "transcribe-url",
  "upload-audio",
  "audio-signal-lab",
  "live-mic",
  "tts",
  "flux-tts",
  "trusted-voice",
  "sample-library",
  "language-explorer",
  "redaction-lab",
  "api-studio",
  "applied-voice-systems",
  "applied-engineering-questline",
  "live-observatory",
  "code-lab",
] as const satisfies readonly LabModuleId[];

const moduleIds = new Set<string>(ONE_VISIBLE_WORKSPACE_MODULE_IDS);
const providerSpecificEvidenceModuleIds = new Set<LabModuleId>([
  "overview",
  "connection",
  "transcribe-url",
  "upload-audio",
  "live-mic",
  "tts",
  "flux-tts",
  "trusted-voice",
  "language-explorer",
  "api-studio",
  "live-observatory",
  "code-lab",
]);

export type OneVisibleWorkspace = Readonly<{
  active: true;
  moduleId: LabModuleId;
  providerId: "deepgram";
  evidenceScope: "provider-specific" | "provider-neutral";
}>;

export type OneVisibleWorkspaceEventDetail = OneVisibleWorkspace | Readonly<{ active: false }>;

export function isOneVisibleWorkspaceModuleId(value: unknown): value is LabModuleId {
  return typeof value === "string" && moduleIds.has(value);
}

export function evidenceScopeForOneVisibleWorkspaceModule(moduleId: LabModuleId) {
  return providerSpecificEvidenceModuleIds.has(moduleId)
    ? "provider-specific" as const
    : "provider-neutral" as const;
}

export function readOneVisibleWorkspaceEvent(event: Event): OneVisibleWorkspaceEventDetail | null {
  if (!(event instanceof CustomEvent) || event.type !== ONE_VISIBLE_WORKSPACE_EVENT) return null;
  const detail = internallyPublishedWorkspaceDetails.get(event);
  if (!detail) return null;
  internallyPublishedWorkspaceDetails.delete(event);
  return detail;
}

export function publishOneVisibleWorkspace(moduleId: LabModuleId) {
  if (!isOneVisibleWorkspaceModuleId(moduleId)) {
    throw new TypeError("ONE visible workspace events require a known application module.");
  }
  dispatchOneVisibleWorkspaceEvent(Object.freeze({
    active: true,
    moduleId,
    providerId: ONE_VISIBLE_WORKSPACE_PROVIDER_ID,
    evidenceScope: evidenceScopeForOneVisibleWorkspaceModule(moduleId),
  }));
}

export function clearOneVisibleWorkspace() {
  dispatchOneVisibleWorkspaceEvent(Object.freeze({ active: false }));
}

function dispatchOneVisibleWorkspaceEvent(detail: OneVisibleWorkspaceEventDetail) {
  const event = new CustomEvent<OneVisibleWorkspaceEventDetail>(
    ONE_VISIBLE_WORKSPACE_EVENT,
    { detail },
  );
  internallyPublishedWorkspaceDetails.set(event, detail);
  window.dispatchEvent(event);
}

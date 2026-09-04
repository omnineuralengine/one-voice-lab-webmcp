import { resolveDiscoveryProfile } from "@/lib/architecture-studio/recommendation-engine";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import type {
  ArchitectureEdge,
  ArchitectureModuleOverride,
  ArchitectureNode,
  ArchitectureNodeOwner,
  ArchitectureTopology,
  LabRecommendation,
  PublicStudioSession,
  StudioRecommendationPath,
  StudioSession,
} from "@/types/architecture-studio";

export type ArchitectureModuleDefinition = {
  id: string;
  label: string;
  detail: string;
  owner: ArchitectureNodeOwner;
  layer: number;
  order: number;
  latencyCheckpoint?: boolean;
};

export const ARCHITECTURE_MODULE_LIBRARY: ArchitectureModuleDefinition[] = [
  { id: "audio-preprocessing", label: "Audio preprocessing", detail: "Normalize, validate, and observe incoming audio", owner: "customer", layer: 4, order: 1, latencyCheckpoint: true },
  { id: "deepgram-stt", label: "Deepgram streaming STT", detail: "Nova-family recognition candidate", owner: "deepgram", layer: 5, order: 0, latencyCheckpoint: true },
  { id: "deepgram-flux", label: "Deepgram Flux", detail: "Conversational ASR and turn events", owner: "deepgram", layer: 5, order: 0, latencyCheckpoint: true },
  { id: "transcript-processing", label: "Transcript processing", detail: "Diarization, formatting, redaction, and routing", owner: "deepgram", layer: 6, order: 2 },
  { id: "orchestrator", label: "Agent orchestration", detail: "State, tools, policies, and recovery", owner: "customer", layer: 6, order: 0, latencyCheckpoint: true },
  { id: "llm", label: "LLM", detail: "Customer-selected reasoning provider", owner: "third-party", layer: 7, order: 0, latencyCheckpoint: true },
  { id: "deepgram-tts", label: "Deepgram TTS", detail: "Streaming speech-output candidate", owner: "deepgram", layer: 6, order: 1, latencyCheckpoint: true },
  { id: "fallback-recovery", label: "Fallback + recovery", detail: "Retry, safe failure, and handoff policy", owner: "customer", layer: 7, order: 3 },
  { id: "human-agent", label: "Human agent", detail: "Context-preserving escalation", owner: "customer", layer: 7, order: 4 },
  { id: "observability", label: "Observability + evaluation", detail: "Stage latency, quality, errors, and handoffs", owner: "customer", layer: 8, order: 4 },
  { id: "storage", label: "Storage / analytics", detail: "Governed transcript and evaluation evidence", owner: "customer", layer: 8, order: 5 },
];

export function buildArchitectureTopology(
  session: StudioSession | PublicStudioSession,
  path: StudioRecommendationPath,
): ArchitectureTopology {
  const { values } = resolveDiscoveryProfile(session);
  const packageRecommendation = recommendPackage(session);
  const recommendedModuleIds = new Set(packageRecommendation.components.map((component) => component.architectureModuleId));
  const media = asList(values["media-path"]);
  const systems = asList(values["business-systems"]);
  const providers = asList(values["existing-providers"]);
  const ccaasPlatform = String(values["ccaas-platform"] ?? "existing-platform");
  const telephonyProvider = String(values["telephony-provider"] ?? "existing-ingress");
  const observabilityStack = asList(values["observability-stack"]);
  const deployment = String(values["deployment-preference"] ?? "cloud-api");
  const isPrivate = path === "private-deployment" || ["private-cloud", "self-hosted", "on-prem", "hybrid"].includes(deployment);
  const isAgent = path === "composable-voice" || path === "managed-voice-agent" || recommendedModuleIds.has("deepgram-flux") || recommendedModuleIds.has("orchestrator");
  const isManaged = path === "managed-voice-agent";
  const usesFlux = !isManaged && recommendedModuleIds.has("deepgram-flux");
  const isBatch = String(values["processing-mode"] ?? "") === "prerecorded";
  const needsPreprocessing = asList(values["audio-conditions"]).some((item) => ["noise", "packet-loss", "far-field", "overlap"].includes(item));

  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];
  const addNode = (node: ArchitectureNode) => { if (!nodes.some((item) => item.id === node.id)) nodes.push(node); };
  const addEdge = (edge: ArchitectureEdge) => { if (!edges.some((item) => item.id === edge.id)) edges.push(edge); };

  addNode({ id: "caller", label: isBatch ? "Recorded conversation" : "Caller", detail: isBatch ? "Representative or archived audio" : "Inbound / outbound customer", owner: "customer", layer: 0, order: 0 });
  if (!isBatch) {
    if (media.includes("pstn") || media.includes("sip") || media.includes("siprec") || media.length === 0) {
      addNode({ id: "telephony", label: media.includes("sip") || media.includes("siprec") ? "SIP trunk / telephony" : "PSTN / telephony", detail: `${displayValue(telephonyProvider)} retained`, owner: telephonyProvider === "custom-sip" ? "customer" : "third-party", layer: 1, order: 0, latencyCheckpoint: true });
      addEdge({ id: "caller-telephony", from: "caller", to: "telephony", label: "audio", type: "audio" });
    }
    addNode({ id: "ccaas", label: "CCaaS platform", detail: displayValue(ccaasPlatform), owner: ccaasPlatform === "custom" ? "customer" : "third-party", layer: 2, order: 0, latencyCheckpoint: true });
    addEdge({ id: "ingress-ccaas", from: nodes.some((node) => node.id === "telephony") ? "telephony" : "caller", to: "ccaas", label: "call media", type: "audio" });
  }

  if (isBatch) {
    addNode({ id: "media-gateway", label: "Recording intake", detail: "Validated files, queue, and retry", owner: "customer", layer: 2, order: 0, latencyCheckpoint: true });
    addEdge({ id: "recording-intake", from: "caller", to: "media-gateway", label: "audio file", type: "audio" });
  } else {
    addNode({ id: "media-gateway", label: media.includes("websocket") ? "WebSocket media gateway" : "Media gateway", detail: "Codec framing, connection lifecycle, backpressure", owner: "customer", layer: 3, order: 0, latencyCheckpoint: true });
    addEdge({ id: "ccaas-gateway", from: "ccaas", to: "media-gateway", label: media.includes("websocket") ? "WebSocket audio" : "streamed audio", type: "audio" });
  }

  if (needsPreprocessing) {
    addNode({ ...moduleNode("audio-preprocessing"), layer: 4, order: 1 });
    addEdge({ id: "gateway-preprocessing", from: "media-gateway", to: "audio-preprocessing", label: "validated audio", type: "audio" });
  }

  const speechInputNode = needsPreprocessing ? "audio-preprocessing" : "media-gateway";

  if (isManaged) {
    addNode({ id: "deepgram-agent", label: "Deepgram Voice Agent API", detail: "Managed conversational pipeline to validate", owner: "deepgram", layer: 5, order: 0, latencyCheckpoint: true });
    addEdge({ id: "gateway-agent", from: speechInputNode, to: "deepgram-agent", label: "audio + control", type: "audio" });
  } else if (usesFlux) {
    addNode(moduleNode("deepgram-flux"));
    addEdge({ id: "gateway-flux", from: speechInputNode, to: "deepgram-flux", label: "streaming audio", type: "audio" });
  } else {
    addNode({ ...moduleNode("deepgram-stt"), label: "Deepgram speech-to-text", detail: isBatch ? "Prerecorded evaluation path" : "Nova-family streaming candidate" });
    addEdge({ id: "gateway-stt", from: speechInputNode, to: "deepgram-stt", label: "audio", type: "audio" });
  }

  if (isAgent) {
    addNode({ id: "orchestrator", label: isManaged ? "Agent orchestration" : "Customer orchestration", detail: isManaged ? "Configured in managed pipeline" : "Existing framework retained", owner: isManaged ? "deepgram" : "customer", layer: 6, order: 0, latencyCheckpoint: true });
    addNode({ id: "llm", label: "LLM", detail: providers.includes("llm") ? "Existing provider retained" : "Provider selected during evaluation", owner: "third-party", layer: 7, order: 0, latencyCheckpoint: true });
    addNode({ id: "tools", label: "Tool / function layer", detail: "Authorization, idempotency, confirmation, recovery", owner: "customer", layer: 7, order: 1, latencyCheckpoint: true });
    const speechNode = isManaged ? "deepgram-agent" : usesFlux ? "deepgram-flux" : "deepgram-stt";
    addEdge({ id: "speech-orchestrator", from: speechNode, to: "orchestrator", label: "turn + transcript", type: "transcript" });
    addEdge({ id: "orchestrator-llm", from: "orchestrator", to: "llm", label: "context", type: "control" });
    addEdge({ id: "orchestrator-tools", from: "orchestrator", to: "tools", label: "bounded action", type: "business-data" });
    addNode({ id: "deepgram-tts", label: "Deepgram TTS", detail: "Streaming speech output candidate", owner: "deepgram", layer: 6, order: 1, latencyCheckpoint: true });
    addEdge({ id: "orchestrator-tts", from: "orchestrator", to: "deepgram-tts", label: "response text", type: "control" });
    addEdge({ id: "tts-gateway", from: "deepgram-tts", to: "media-gateway", label: "return audio", type: "audio" });
  }

  const speechNode = isManaged ? "deepgram-agent" : usesFlux ? "deepgram-flux" : "deepgram-stt";
  const transcriptOutputNode = recommendedModuleIds.has("transcript-processing") ? "transcript-processing" : speechNode;
  if (transcriptOutputNode === "transcript-processing") {
    addNode(moduleNode("transcript-processing"));
    addEdge({ id: "speech-transcript-processing", from: speechNode, to: "transcript-processing", label: "configured transcript", type: "transcript" });
  }
  addNode({ id: "analytics", label: "Analytics pipeline", detail: "Redacted transcript events and quality evidence", owner: "customer", layer: 7, order: 2 });
  addNode({ id: "observability", label: "Observability", detail: observabilityStack.length ? observabilityStack.map(displayValue).join(" + ") : "Correlation IDs, stage latency, errors, handoffs", owner: "customer", layer: 8, order: 4 });
  addEdge({ id: "speech-analytics", from: transcriptOutputNode, to: "analytics", label: "transcript events", type: "transcript" });
  addEdge({ id: "analytics-observability", from: "analytics", to: "observability", label: "safe telemetry", type: "control" });

  if (systems.some((item) => ["salesforce", "custom-crm"].includes(item)) || (isAgent && !systems.includes("customer-database"))) {
    addNode({ id: "crm", label: systems.includes("salesforce") ? "Salesforce CRM" : "CRM", detail: "Existing system retained", owner: "customer", layer: 8, order: 0 });
    addEdge({ id: "tools-crm", from: isAgent ? "tools" : "analytics", to: "crm", label: isAgent ? "authorized business data" : "conversation record", type: "business-data" });
  }
  if (systems.some((item) => ["snowflake", "databricks"].includes(item)) || path === "speech-intelligence") {
    addNode({ id: "warehouse", label: systems.includes("snowflake") ? "Snowflake" : systems.includes("databricks") ? "Databricks" : "Data warehouse", detail: "Customer analytics destination", owner: "customer", layer: 8, order: 1 });
    addEdge({ id: "analytics-warehouse", from: "analytics", to: "warehouse", label: "governed transcript data", type: "business-data" });
  }
  if (systems.some((item) => ["zendesk", "servicenow"].includes(item))) {
    addNode({ id: "ticketing", label: systems.includes("zendesk") ? "Zendesk ticketing" : "ServiceNow", detail: "Existing case workflow retained", owner: "customer", layer: 8, order: 2 });
    addEdge({ id: "workflow-ticketing", from: isAgent ? "tools" : "analytics", to: "ticketing", label: isAgent ? "authorized ticket action" : "conversation record", type: "business-data" });
  }
  if (systems.includes("customer-database")) {
    addNode({ id: "customer-data", label: "Customer database", detail: "Authoritative customer-owned data", owner: "customer", layer: 8, order: 3 });
    addEdge({ id: "workflow-customer-data", from: isAgent ? "tools" : "analytics", to: "customer-data", label: isAgent ? "bounded read / write" : "governed record", type: "business-data" });
  }
  if (asList(values["turn-taking"]).includes("human-handoff") || asList(values["failure-behavior"]).includes("human")) {
    addNode({ id: "human-agent", label: "Human agent", detail: "Context-preserving escalation", owner: "customer", layer: 5, order: 3 });
    addEdge({ id: "orchestration-human", from: isAgent ? "orchestrator" : "ccaas", to: "human-agent", label: "handoff + context", type: "control" });
  }
  if (isAgent || asList(values["failure-behavior"]).length > 0) {
    addNode(moduleNode("fallback-recovery"));
    addEdge({ id: "orchestration-recovery", from: isAgent ? "orchestrator" : "ccaas", to: "fallback-recovery", label: "failure policy", type: "control" });
  }

  const overridden = applyArchitectureOverrides(nodes, edges, session.architectureOverrides ?? []);

  const boundaries: ArchitectureTopology["boundaries"] = [];
  if (isPrivate) {
    boundaries.push({ id: "private", label: "Customer-controlled deployment boundary — validate scope", nodeIds: overridden.nodes.filter((node) => node.owner === "deepgram").map((node) => node.id), tone: "private" });
  }
  if (asList(values["contact-regions"]).length > 1) {
    boundaries.push({ id: "regional", label: "Regional routing / residency boundary — validate", nodeIds: ["media-gateway", speechNode, "analytics"], tone: "regional" });
  }

  return { nodes: overridden.nodes, edges: overridden.edges, boundaries };
}

export function recommendLabs(session: StudioSession | PublicStudioSession, path: StudioRecommendationPath): LabRecommendation[] {
  const { values } = resolveDiscoveryProfile(session);
  const labs: LabRecommendation[] = [];
  const add = (lab: LabRecommendation) => { if (!labs.some((item) => item.id === lab.id)) labs.push(lab); };
  const launch = (module: string) => `/?module=${encodeURIComponent(module)}&from=architecture-studio`;

  if (String(values["processing-mode"] ?? "") === "prerecorded") {
    add({ id: "upload-audio", label: "Uploaded-audio transcription", reason: "Run representative recordings through the guarded prerecorded path.", href: launch("upload-audio"), status: "available" });
  } else {
    add({ id: "live-mic", label: "Streaming transcription", reason: "Inspect the live browser audio and transcript event path.", href: launch("live-mic"), status: "available" });
  }
  if (asList(values["audio-conditions"]).some((item) => ["noise", "packet-loss", "far-field"].includes(item))) {
    add({ id: "audio-signal", label: "Audio Signal Lab", reason: "Separate capture and signal-quality failures from model behavior.", href: launch("audio-signal-lab"), status: "available" });
  }
  if (asList(values["languages"]).length > 1) {
    add({ id: "languages", label: "Language Explorer", reason: "Verify model and language configuration before the multilingual evaluation.", href: launch("language-explorer"), status: "available" });
  }
  if (asList(values["transcript-features"]).includes("redaction")) {
    add({ id: "redaction", label: "Redaction Lab", reason: "Distinguish transcript masking from audio and downstream governance.", href: launch("redaction-lab"), status: "available" });
  }
  if (path === "composable-voice" || path === "managed-voice-agent") {
    add({ id: "observatory", label: "Live Observatory", reason: "Use event provenance and stage timings to explain the realtime loop.", href: launch("live-observatory"), status: "available" });
    add({ id: "voice-agent-live", label: "Live Voice Agent interaction", reason: "A fully executable voice-agent conversation is not installed in this lab yet.", status: "planned" });
  }
  if (path === "managed-voice-agent" || path === "composable-voice") {
    add({ id: "tts", label: "Text to Speech", reason: "Demonstrate the speech-output boundary without implying the entire pipeline must change.", href: launch("tts"), status: "available" });
  }
  if (path === "private-deployment") {
    add({ id: "self-hosted", label: "Self-hosted architecture explanation", reason: "Review deployment ownership and assumptions in Applied Voice Systems.", href: launch("applied-voice-systems"), status: "available" });
  }
  add({ id: "api-studio", label: "API Studio", reason: "Inspect request and response boundaries for the selected speech path.", href: launch("api-studio"), status: "available" });
  return labs.slice(0, 6);
}

export function generatedLabBacklog(labs: LabRecommendation[]) {
  return labs.filter((lab) => lab.status === "planned").map((lab) => ({ id: lab.id, label: lab.label, reason: lab.reason }));
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)];
}

function displayValue(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function moduleNode(moduleId: string): ArchitectureNode {
  const definition = ARCHITECTURE_MODULE_LIBRARY.find((item) => item.id === moduleId);
  if (!definition) throw new Error(`Unknown architecture module: ${moduleId}`);
  return { ...definition, origin: "engine", decisionStatus: "undecided" };
}

function applyArchitectureOverrides(
  generatedNodes: ArchitectureNode[],
  generatedEdges: ArchitectureEdge[],
  overrides: ArchitectureModuleOverride[],
) {
  let nodes = generatedNodes.map((node) => ({ ...node, origin: node.origin ?? "engine" as const }));
  let edges = [...generatedEdges];

  for (const override of overrides) {
    if (override.presence === "excluded") {
      nodes = nodes.filter((node) => node.id !== override.moduleId);
      edges = edges.filter((edge) => edge.from !== override.moduleId && edge.to !== override.moduleId);
      continue;
    }

    const existingIndex = nodes.findIndex((node) => node.id === override.moduleId);
    if (existingIndex < 0 && override.presence === "included") {
      const definition = ARCHITECTURE_MODULE_LIBRARY.find((item) => item.id === override.moduleId);
      if (!definition) continue;
      nodes.push({ ...definition, origin: "operator", decisionStatus: override.decisionStatus, operatorNote: override.note });
      edges.push(...edgesForAddedModule(override.moduleId, nodes));
      continue;
    }

    if (existingIndex >= 0) {
      nodes[existingIndex] = {
        ...nodes[existingIndex],
        origin: "operator",
        decisionStatus: override.decisionStatus,
        operatorNote: override.note,
      };
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: edges.filter((edge, index, all) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && all.findIndex((item) => item.id === edge.id) === index),
  };
}

function edgesForAddedModule(moduleId: string, nodes: ArchitectureNode[]): ArchitectureEdge[] {
  const ids = new Set(nodes.map((node) => node.id));
  const speechNode = ids.has("deepgram-flux") ? "deepgram-flux" : ids.has("deepgram-stt") ? "deepgram-stt" : "deepgram-agent";
  const candidates: Record<string, ArchitectureEdge[]> = {
    "audio-preprocessing": [
      { id: "override-gateway-preprocessing", from: "media-gateway", to: "audio-preprocessing", label: "validated audio", type: "audio" },
      { id: "override-preprocessing-speech", from: "audio-preprocessing", to: speechNode, label: "conditioned audio", type: "audio" },
    ],
    "deepgram-stt": [{ id: "override-gateway-stt", from: "media-gateway", to: "deepgram-stt", label: "streaming audio", type: "audio" }],
    "deepgram-flux": [{ id: "override-gateway-flux", from: "media-gateway", to: "deepgram-flux", label: "streaming audio", type: "audio" }],
    "transcript-processing": [
      { id: "override-speech-transcript-processing", from: speechNode, to: "transcript-processing", label: "configured transcript", type: "transcript" },
      { id: "override-transcript-processing-analytics", from: "transcript-processing", to: "analytics", label: "transcript events", type: "transcript" },
    ],
    orchestrator: [{ id: "override-speech-orchestrator", from: speechNode, to: "orchestrator", label: "turn + transcript", type: "transcript" }],
    llm: [{ id: "override-orchestrator-llm", from: "orchestrator", to: "llm", label: "context", type: "control" }],
    "deepgram-tts": [
      { id: "override-orchestrator-tts", from: "orchestrator", to: "deepgram-tts", label: "response text", type: "control" },
      { id: "override-tts-gateway", from: "deepgram-tts", to: "media-gateway", label: "return audio", type: "audio" },
    ],
    "fallback-recovery": [{ id: "override-orchestrator-recovery", from: ids.has("orchestrator") ? "orchestrator" : "ccaas", to: "fallback-recovery", label: "failure policy", type: "control" }],
    "human-agent": [{ id: "override-human-handoff", from: ids.has("orchestrator") ? "orchestrator" : "ccaas", to: "human-agent", label: "handoff + context", type: "control" }],
    observability: [{ id: "override-analytics-observability", from: ids.has("analytics") ? "analytics" : speechNode, to: "observability", label: "safe telemetry", type: "control" }],
    storage: [{ id: "override-analytics-storage", from: ids.has("analytics") ? "analytics" : speechNode, to: "storage", label: "governed evidence", type: "business-data" }],
  };
  return (candidates[moduleId] ?? []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
}

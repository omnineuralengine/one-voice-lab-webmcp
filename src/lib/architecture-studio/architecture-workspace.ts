import { buildArchitectureTopology } from "@/lib/architecture-studio/architecture";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import { recommendArchitecture } from "@/lib/architecture-studio/recommendation-engine";
import type {
  ArchitectureCanvasSnapshot,
  ArchitectureComparison,
  ArchitectureNodeType,
  ArchitectureRevision,
  CanvasArchitectureConnection,
  CanvasArchitectureNode,
  CanvasNodeOwner,
} from "@/types/architecture-studio-diagnostics";
import type { ArchitectureNode, PublicStudioSession, StudioSession } from "@/types/architecture-studio";

type SessionLike = StudioSession | PublicStudioSession;

export type ArchitectureNodeTemplate = {
  type: ArchitectureNodeType;
  displayName: string;
  vendor: string;
  owner: CanvasNodeOwner;
  properties: Record<string, string>;
  risks: string[];
};

export const ARCHITECTURE_NODE_TEMPLATES: ArchitectureNodeTemplate[] = [
  template("audio-source", "Caller / audio source", "Customer", "customer-managed", { medium: "voice" }, ["Capture conditions may vary by caller."]),
  template("device-microphone", "Device / microphone", "Caller device", "customer-managed", { capture: "microphone" }, ["Gain, clipping, echo, and device quality affect every downstream layer."]),
  template("pstn", "PSTN", "Telephony network", "third-party", { transport: "PSTN" }, ["Narrowband audio and carrier routing can affect quality and latency."]),
  template("sip", "SIP / RTP", "Telephony provider", "third-party", { protocol: "SIP/RTP" }, ["Session and media paths may fail independently."]),
  template("webrtc", "WebRTC", "Browser / RTC provider", "third-party", { protocol: "WebRTC" }, ["Browser capture, negotiation, and packet loss require observation."]),
  template("telephony-carrier", "Telephony carrier", "Existing carrier", "third-party", { medium: "voice" }, ["Carrier media and regional routing sit outside application control."]),
  template("ccaas-platform", "CCaaS platform", "Existing CCaaS", "third-party", { role: "call control" }, ["Media export and call-control ownership vary by platform."]),
  template("media-gateway", "Media gateway", "Customer", "customer-managed", { transport: "WebSocket" }, ["Framing, backpressure, reconnect, and codec conversion are customer-owned."]),
  template("audio-preprocessing", "Audio preprocessing", "Customer", "customer-managed", { behavior: "measured, reversible" }, ["Transforms can improve or remove speech information and add latency."]),
  template("noise-suppression", "Noise suppression", "Customer / device", "customer-managed", { mode: "conservative" }, ["Aggressive suppression can erase low-energy speech."]),
  template("voice-activity-detection", "Voice activity detection", "Customer / platform", "customer-managed", { role: "speech activity signal" }, ["False starts and false stops can distort turn behavior."]),
  template("deepgram-streaming-stt", "Deepgram streaming STT", "Deepgram", "deepgram-managed", { mode: "streaming" }, ["Model, language, media format, and reconnect behavior require representative validation."]),
  template("deepgram-batch-stt", "Deepgram batch STT", "Deepgram", "deepgram-managed", { mode: "prerecorded" }, ["Queueing, storage, replay, and retention remain integration concerns."]),
  template("deepgram-flux", "Deepgram Flux", "Deepgram", "deepgram-managed", { role: "conversational ASR + turn events" }, ["Turn behavior depends on audio, configuration, playback, and orchestration timing."]),
  template("agent-orchestration", "Agent orchestration", "Customer", "customer-managed", { role: "state and policy" }, ["State, cancellation, retries, and recovery must remain coherent across failures."]),
  template("llm", "LLM", "Existing provider", "third-party", { role: "reasoning" }, ["Latency and generated content require separate controls and evaluation."]),
  template("business-logic", "Business logic / tools", "Customer", "customer-managed", { role: "bounded actions" }, ["Authorization, idempotency, confirmation, and rollback are required for actions."]),
  template("crm", "CRM", "Existing CRM", "customer-managed", { role: "customer context" }, ["Lookup failures can delay the agent without degrading speech services."]),
  template("knowledge-system", "Knowledge system", "Customer", "customer-managed", { role: "retrieval" }, ["Retrieval quality and latency are separate from transcription quality."]),
  template("deepgram-tts", "Deepgram TTS", "Deepgram", "deepgram-managed", { mode: "streaming" }, ["Startup latency, voice fit, buffering, and cancellation require end-to-end testing."]),
  template("audio-playback", "Audio playback", "CCaaS / client", "customer-managed", { role: "caller response" }, ["Playback buffering and cancellation determine perceived interruption behavior."]),
  template("observability", "Observability", "Customer", "customer-managed", { telemetry: "content-safe" }, ["Missing correlation IDs reduce diagnostic confidence."]),
  template("evaluation", "Evaluation", "Customer + Deepgram", "customer-managed", { role: "evidence and acceptance gates" }, ["Aggregate metrics can hide critical failure slices."]),
  template("storage", "Storage / analytics", "Customer", "customer-managed", { retention: "to validate" }, ["Retention and access boundaries must match governance requirements."]),
  template("human-agent", "Human agent", "Customer", "customer-managed", { role: "safe escalation" }, ["Handoff must preserve context and avoid duplicate actions."]),
  template("fallback-provider", "Fallback provider / recovery", "Customer-selected", "third-party", { role: "continuity" }, ["A fallback that is not exercised can fail when needed."]),
  template("custom-integration", "Custom integration", "Customer", "customer-managed", { role: "custom" }, ["Ownership, protocol, and failure behavior require explicit definition."]),
];

export function buildGeneratedCanvasSnapshot(session: SessionLike): ArchitectureCanvasSnapshot {
  const recommendation = recommendArchitecture(session);
  const packageRecommendation = recommendPackage(session);
  const topology = buildArchitectureTopology(session, recommendation.primaryPath);
  const nodes = topology.nodes.map((node) => mapGeneratedNode(node, packageRecommendation.components));
  const connections = topology.edges.map((edge) => ({
    id: edge.id,
    fromNodeId: edge.from,
    toNodeId: edge.to,
    flow: edge.type,
    protocol: protocolFromLabel(edge.label),
    direction: "one-way" as const,
    mode: /file|batch|record/i.test(edge.label) ? "batch" as const : "streaming" as const,
    transport: /websocket/i.test(edge.label) ? "WebSocket" : undefined,
    origin: "engine-generated" as const,
    enabled: true,
    operatorNotes: "",
  }));

  augmentRealtimeJourney(nodes, connections);
  return { generatedAt: session.updatedAt, nodes, connections };
}

export function applyArchitectureRevisions(snapshot: ArchitectureCanvasSnapshot, revisions: ArchitectureRevision[]): ArchitectureCanvasSnapshot {
  let nodes = snapshot.nodes.map(cloneNode);
  let connections = snapshot.connections.map((connection) => ({ ...connection }));
  for (const revision of revisions) {
    if (["node-added", "node-duplicated"].includes(revision.kind)) {
      const node = revision.after as CanvasArchitectureNode | undefined;
      if (node && !nodes.some((item) => item.id === node.id)) nodes.push(cloneNode(node));
      continue;
    }
    if (revision.kind === "node-removed") {
      nodes = nodes.filter((node) => node.id !== revision.targetId);
      connections = connections.filter((connection) => connection.fromNodeId !== revision.targetId && connection.toNodeId !== revision.targetId);
      continue;
    }
    if (["node-updated", "node-moved", "node-disabled"].includes(revision.kind)) {
      nodes = nodes.map((node) => node.id === revision.targetId ? mergeNode(node, revision.after ?? {}) : node);
      continue;
    }
    if (revision.kind === "connection-added") {
      const connection = revision.after as CanvasArchitectureConnection | undefined;
      if (connection && !connections.some((item) => item.id === connection.id)) connections.push({ ...connection });
      continue;
    }
    if (revision.kind === "connection-removed") {
      connections = connections.filter((connection) => connection.id !== revision.targetId);
      continue;
    }
    if (revision.kind === "connection-updated") {
      connections = connections.map((connection) => connection.id === revision.targetId ? { ...connection, ...revision.after } : connection);
    }
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  return { generatedAt: snapshot.generatedAt, nodes, connections: connections.filter((connection) => nodeIds.has(connection.fromNodeId) && nodeIds.has(connection.toNodeId)) };
}

export function compareArchitectures(generated: ArchitectureCanvasSnapshot, current: ArchitectureCanvasSnapshot): ArchitectureComparison {
  const generatedNodes = new Map(generated.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const generatedConnections = new Map(generated.connections.map((connection) => [connection.id, connection]));
  const currentConnections = new Map(current.connections.map((connection) => [connection.id, connection]));
  return {
    addedNodeIds: current.nodes.filter((node) => !generatedNodes.has(node.id)).map((node) => node.id),
    removedNodeIds: generated.nodes.filter((node) => !currentNodes.has(node.id)).map((node) => node.id),
    changedNodeIds: current.nodes.filter((node) => generatedNodes.has(node.id) && comparableNode(node) !== comparableNode(generatedNodes.get(node.id)!)).map((node) => node.id),
    addedConnectionIds: current.connections.filter((connection) => !generatedConnections.has(connection.id)).map((connection) => connection.id),
    removedConnectionIds: generated.connections.filter((connection) => !currentConnections.has(connection.id)).map((connection) => connection.id),
    changedConnectionIds: current.connections.filter((connection) => generatedConnections.has(connection.id) && JSON.stringify(connection) !== JSON.stringify(generatedConnections.get(connection.id))).map((connection) => connection.id),
  };
}

export function architectureNodeTemplate(type: ArchitectureNodeType) {
  return ARCHITECTURE_NODE_TEMPLATES.find((templateItem) => templateItem.type === type)!;
}

function mapGeneratedNode(node: ArchitectureNode, components: ReturnType<typeof recommendPackage>["components"]): CanvasArchitectureNode {
  const evidence = components.filter((component) => component.architectureModuleId === node.id);
  const owner = mapOwner(node.owner);
  return {
    id: node.id,
    type: nodeType(node),
    displayName: node.label,
    vendor: node.owner === "deepgram" ? "Deepgram" : node.owner === "third-party" ? node.detail : "Customer / existing stack",
    status: node.decisionStatus === "rejected" ? "disabled" : "healthy",
    origin: "engine-generated",
    decisionState: node.origin === "operator" ? "overridden" : node.decisionStatus ?? "undecided",
    owner,
    enabled: node.decisionStatus !== "rejected",
    position: technicalPosition(node.layer, node.order),
    properties: { architectureDetail: node.detail, latencyCheckpoint: node.latencyCheckpoint ? "yes" : "no" },
    operatorNotes: node.operatorNote ?? "",
    customerRequirements: evidence.map((component) => component.customerRequirement),
    risks: evidence.map((component) => component.tradeoffOrLimitation),
    recommendationEvidenceIds: evidence.map((component) => component.id),
    originalRecommendation: {
      displayName: node.label,
      vendor: node.owner === "deepgram" ? "Deepgram" : node.detail,
      owner,
      rationale: evidence.map((component) => component.whyItFits).join(" ") || "Generated from the current discovery profile and best-fit topology.",
    },
  };
}

function augmentRealtimeJourney(nodes: CanvasArchitectureNode[], connections: CanvasArchitectureConnection[]) {
  const caller = nodes.find((node) => node.id === "caller");
  if (!caller || caller.type !== "audio-source") return;
  const originalOutgoing = connections.filter((connection) => connection.fromNodeId === caller.id);
  if (originalOutgoing.length) {
    const device = createTemplateNode("device-microphone", "caller-device", { x: caller.position.x + 210, y: caller.position.y });
    nodes.filter((node) => node.id !== caller.id).forEach((node) => { node.position = { ...node.position, x: node.position.x + 180 }; });
    nodes.push(device);
    originalOutgoing.forEach((connection) => { connection.fromNodeId = device.id; connection.id = `device-${connection.id}`; });
    connections.push({ id: "caller-device-audio", fromNodeId: caller.id, toNodeId: device.id, flow: "audio", protocol: "Acoustic audio", direction: "one-way", mode: "streaming", origin: "engine-generated", enabled: true, operatorNotes: "" });
  }
  const ttsReturn = connections.find((connection) => connection.fromNodeId === "deepgram-tts" && connection.toNodeId === "media-gateway");
  const tts = nodes.find((node) => node.id === "deepgram-tts");
  if (ttsReturn && tts) {
    const playback = createTemplateNode("audio-playback", "audio-playback", { x: tts.position.x + 220, y: tts.position.y + 110 });
    nodes.push(playback);
    ttsReturn.toNodeId = playback.id;
    ttsReturn.id = "tts-audio-playback";
    connections.push({ id: "playback-media-return", fromNodeId: playback.id, toNodeId: "media-gateway", flow: "audio", protocol: "Playback stream", direction: "one-way", mode: "streaming", origin: "engine-generated", enabled: true, operatorNotes: "" });
  }
}

export function createTemplateNode(type: ArchitectureNodeType, id: string, position: { x: number; y: number }): CanvasArchitectureNode {
  const nodeTemplate = architectureNodeTemplate(type);
  return {
    id,
    type,
    displayName: nodeTemplate.displayName,
    vendor: nodeTemplate.vendor,
    status: "healthy",
    origin: "manually-added",
    decisionState: "undecided",
    owner: nodeTemplate.owner,
    enabled: true,
    position,
    properties: { ...nodeTemplate.properties },
    operatorNotes: "",
    customerRequirements: [],
    risks: [...nodeTemplate.risks],
    recommendationEvidenceIds: [],
  };
}

function nodeType(node: ArchitectureNode): ArchitectureNodeType {
  if (node.id === "caller") return /recorded/i.test(node.label) ? "audio-source" : "audio-source";
  if (node.id === "telephony") return /sip/i.test(node.label) ? "sip" : "telephony-carrier";
  if (node.id === "ccaas") return "ccaas-platform";
  if (node.id === "media-gateway") return "media-gateway";
  if (node.id === "audio-preprocessing") return "audio-preprocessing";
  if (node.id === "deepgram-stt") return /prerecorded/i.test(node.detail) ? "deepgram-batch-stt" : "deepgram-streaming-stt";
  if (node.id === "deepgram-flux") return "deepgram-flux";
  if (node.id === "deepgram-agent" || node.id === "orchestrator") return "agent-orchestration";
  if (node.id === "llm") return "llm";
  if (node.id === "tools") return "business-logic";
  if (node.id === "crm") return "crm";
  if (node.id === "deepgram-tts") return "deepgram-tts";
  if (node.id === "observability") return "observability";
  if (node.id === "analytics") return "evaluation";
  if (["warehouse", "customer-data", "storage"].includes(node.id)) return "storage";
  if (node.id === "human-agent") return "human-agent";
  if (node.id === "fallback-recovery") return "fallback-provider";
  return "custom-integration";
}

function mapOwner(owner: ArchitectureNode["owner"]): CanvasNodeOwner {
  return owner === "deepgram" ? "deepgram-managed" : owner === "third-party" ? "third-party" : "customer-managed";
}

function technicalPosition(layer: number, order: number) {
  return { x: layer === 0 ? 40 : 250 + layer * 220, y: 70 + order * 120 };
}

function protocolFromLabel(label: string) {
  if (/websocket/i.test(label)) return "WebSocket";
  if (/sip/i.test(label)) return "SIP/RTP";
  if (/audio/i.test(label)) return "Audio stream";
  if (/transcript/i.test(label)) return "Transcript events";
  return label;
}

function mergeNode(node: CanvasArchitectureNode, changes: Partial<CanvasArchitectureNode & CanvasArchitectureConnection>): CanvasArchitectureNode {
  return {
    ...node,
    ...changes,
    position: changes.position ? { ...changes.position } : node.position,
    properties: changes.properties ? { ...changes.properties } : node.properties,
    decisionState: node.origin === "engine-generated" ? "overridden" : (changes.decisionState as CanvasArchitectureNode["decisionState"] | undefined) ?? node.decisionState,
  };
}

function cloneNode(node: CanvasArchitectureNode): CanvasArchitectureNode {
  return { ...node, position: { ...node.position }, properties: { ...node.properties }, customerRequirements: [...node.customerRequirements], risks: [...node.risks], recommendationEvidenceIds: [...node.recommendationEvidenceIds], originalRecommendation: node.originalRecommendation ? { ...node.originalRecommendation } : undefined };
}

function comparableNode(node: CanvasArchitectureNode) {
  return JSON.stringify({ displayName: node.displayName, vendor: node.vendor, status: node.status, decisionState: node.decisionState, owner: node.owner, enabled: node.enabled, position: node.position, properties: node.properties, operatorNotes: node.operatorNotes });
}

function template(type: ArchitectureNodeType, displayName: string, vendor: string, owner: CanvasNodeOwner, properties: Record<string, string>, risks: string[]): ArchitectureNodeTemplate {
  return { type, displayName, vendor, owner, properties, risks };
}

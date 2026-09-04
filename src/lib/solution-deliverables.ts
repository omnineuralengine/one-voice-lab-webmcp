import {
  auditCaseExport,
  evaluateClaimSafety,
  exportSolutionCase,
  redactCaseText,
  type ExportProfile,
} from "@/lib/live-solution-case";
import type { CaseItem, SolutionCaseBundle } from "@/types/live-solution-case";
import { isOfficialDeepgramDocsUrl } from "@/lib/live-solution-docs";
import {
  type DeliverableManualEdits,
  type DeliverableProfile,
  type DeliverableSourceReference,
  type SolutionNarrative,
  solutionNarrativeSchema,
} from "@/types/solution-deliverables";

export const DELIVERABLE_GENERATOR_VERSION = "1.0.0";
export const MAX_MERMAID_NODES = 40,
  MAX_MERMAID_EDGES = 80;
const unsafeMermaid =
  /(%%\s*\{\s*init|\bclick\b|javascript:|data:text\/html|<\/?(?:script|iframe|object|embed|style)|\bcallback\b)/i;
const deliverableSecret =
  /(?:\bdg_[A-Za-z0-9_-]{12,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b|\bgh[pousr]_[A-Za-z0-9]{12,}\b|\bAKIA[A-Z0-9]{16}\b|\bAIza[A-Za-z0-9_-]{24,}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bbearer\s+[A-Za-z0-9._~-]{12,}|\b(?:api[_-]?key|authorization|access[_-]?token|auth[_-]?token|client[_-]?secret|password|cookie|session(?:[_-]?(?:id|token|cookie))?)\s*[:=]\s*["']?[^\s"']{8,})/i;
const deliverableLocalPath =
  /(?:^|[\s"'(])(?:[A-Za-z]:\\[^\s"']+|\/(?:Users|home|var|tmp|etc|opt|private|mnt|Volumes)\/[^\s"']+)/i;

export function scanDeliverableText(value: string) {
  return {
    hasSecret: deliverableSecret.test(value),
    hasLocalPath: deliverableLocalPath.test(value),
  };
}
type Sourced = { text: string; sourceItemIds: string[]; status?: string };
const manualText = (text: string): Sourced => ({
  text: `User-edited draft — ${redactCaseText(text, 1800)}`,
  sourceItemIds: [],
  status: "user-edited",
});
const sourced = (item: CaseItem): Sourced => ({
  text: redactCaseText(item.body),
  sourceItemIds: [item.id],
  status: String(item.structuredData.decisionStatus ?? item.status),
});
function dedupeSourcedEntries(entries: Sourced[]) {
  const byText = new Map<string, Sourced>();
  for (const entry of entries) {
    const key = normalizeClaim(entry.text);
    const existing = byText.get(key);
    if (existing) {
      existing.sourceItemIds = [
        ...new Set([...existing.sourceItemIds, ...entry.sourceItemIds]),
      ];
      continue;
    }
    byText.set(key, { ...entry, sourceItemIds: [...entry.sourceItemIds] });
  }
  return [...byText.values()];
}
const active = (bundle: SolutionCaseBundle) =>
  bundle.items.filter(
    (i) =>
      !i.isArchived &&
      !i.supersededAt &&
      i.verificationState !== "rejected" &&
      i.visibility !== "private",
  );

function approvedItems(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile,
) {
  const customer = profile !== "internal-solution-review";
  const profileKinds: Partial<Record<DeliverableProfile, Set<CaseItem["kind"]>>> = {
    "poc-kickoff-pack": new Set([
      "business-outcome",
      "customer-statement",
      "requirement",
      "constraint",
      "decision",
      "architecture-option",
      "risk",
      "open-question",
      "validation-result",
      "success-criterion",
      "action",
      "observed-technical-evidence",
      "official-deepgram-evidence",
      "external-public-evidence",
    ]),
    "executive-takeaway": new Set([
      "business-outcome",
      "customer-statement",
      "requirement",
      "constraint",
      "decision",
      "architecture-option",
      "risk",
      "open-question",
      "success-criterion",
      "action",
      "official-deepgram-evidence",
    ]),
  };
  const allowedKinds = profileKinds[profile];
  return active(bundle).filter(
    (item) => {
      const safety = evaluateClaimSafety(item).state;
      const universallyUnsafe =
        item.sensitivity === "secret" ||
        item.redactionStatus === "contains-secret" ||
        safety === "private-only";
      return (
      !universallyUnsafe &&
      (!allowedKinds || allowedKinds.has(item.kind)) &&
      (item.kind !== "official-deepgram-evidence" ||
        isOfficialDeepgramDocsUrl(
          String(item.structuredData.canonicalSourceUrl ?? ""),
        )) &&
       (customer
         ? item.includeInCustomerExport &&
           item.exportPolicy !== "exclude" &&
           safety !== "do-not-claim"
         : item.includeInInternalExport && item.exportPolicy !== "exclude")
      );
    },
  );
}

function editValues(edits: DeliverableManualEdits = {}) {
  return [
    edits.title,
    edits.executiveSummary,
    edits.sectionWording,
    ...(edits.slideTitles ?? []),
    ...(edits.slideTakeaways ?? []),
    ...(edits.openQuestions ?? []),
    ...(edits.nextActions ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function sanitizeEdit(value: string, max = 1200) {
  return redactCaseText(value, max).replace(/\s+/g, " ").trim();
}

export function sanitizeDeliverableManualEdits(
  edits: DeliverableManualEdits = {},
): DeliverableManualEdits {
  const list = (values: string[] | undefined, max: number) =>
    values?.map((value) => sanitizeEdit(value, max)).filter(Boolean);
  return {
    title: edits.title ? sanitizeEdit(edits.title, 160) : undefined,
    executiveSummary: edits.executiveSummary
      ? sanitizeEdit(edits.executiveSummary)
      : undefined,
    sectionWording: edits.sectionWording
      ? sanitizeEdit(edits.sectionWording, 1800)
      : undefined,
    slideTitles: list(edits.slideTitles, 160),
    slideTakeaways: list(edits.slideTakeaways, 500),
    openQuestions: list(edits.openQuestions, 500),
    nextActions: list(edits.nextActions, 500),
  };
}

export function auditDeliverableManualEdits(
  bundle: SolutionCaseBundle,
  edits: DeliverableManualEdits = {},
) {
  const rawValues = editValues(edits);
  const safeItems = approvedItems(bundle, "customer-solution-pack");
  const corpus = safeItems.map((item) => normalizeClaim(item.body));
  const substantive: [string, string[]][] = [
    ["title", edits.title ? [edits.title] : []],
    ["executiveSummary", edits.executiveSummary ? [edits.executiveSummary] : []],
    ["sectionWording", edits.sectionWording ? [edits.sectionWording] : []],
    ["slideTitles", edits.slideTitles ?? []],
    ["slideTakeaways", edits.slideTakeaways ?? []],
    ["openQuestions", edits.openQuestions ?? []],
    ["nextActions", edits.nextActions ?? []],
  ];
  const secretFields = substantive
    .filter(([, values]) =>
      values.some(
        (value) =>
          redactCaseText(value).includes("[REDACTED_SECRET]") ||
          scanDeliverableText(value).hasSecret,
      ),
    )
    .map(([field]) => field);
  const localPathFields = substantive
    .filter(([, values]) =>
      values.some((value) => scanDeliverableText(value).hasLocalPath),
    )
    .map(([field]) => field);
  const unsupportedFields = substantive
    .filter(([, values]) =>
      values.some((value) => {
        const normalized = normalizeClaim(value);
        return (
          normalized.length > 20 &&
          !corpus.some(
            (source) =>
              source.includes(normalized) || normalized.includes(source),
          )
        );
      }),
    )
    .map(([field]) => field);
  return {
    userEdited: rawValues.length > 0,
    status: secretFields.length || localPathFields.length
      ? ("blocked" as const)
      : unsupportedFields.length
        ? ("qualified" as const)
        : ("passed" as const),
    secretFields: [...new Set(secretFields)],
    localPathFields: [...new Set(localPathFields)],
    unsupportedFields: [...new Set(unsupportedFields)],
    message:
      secretFields.length || localPathFields.length
        ? "Manual edits contain prohibited secret or local-path material."
        : unsupportedFields.length
          ? "New wording without a direct case-source match remains visibly qualified."
          : rawValues.length
            ? "Manual edits passed deterministic safety checks."
            : "No manual edits are active.",
  };
}

function normalizeClaim(value: string) {
  return redactCaseText(value, 4000)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function safeMarkdownProse(value: string, max = 4000) {
  return redactCaseText(value, max)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]<>])/g, "\\$1")
    .replace(/^(\s*)(#{1,6}|>|[-+])\s/gm, "$1\\$2 ");
}

export function buildSolutionNarrative(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile = "customer-solution-pack",
): SolutionNarrative {
  const items = active(bundle);
  const safe = approvedItems(bundle, profile);
  const safeIds = new Set(safe.map((item) => item.id));
  const by = (...k: CaseItem["kind"][]) =>
    dedupeSourcedEntries(safe.filter((i) => k.includes(i.kind)).map(sourced));
  const accepted = safe
    .filter(
      (i) =>
        i.kind === "decision" && i.structuredData.decisionStatus === "accepted",
    )
    .map(sourced);
  const proposed = safe
    .filter(
      (i) =>
        i.kind === "architecture-option" ||
        (i.kind === "decision" &&
          i.structuredData.decisionStatus !== "accepted"),
    )
    .map(sourced);
  const technical = safe.filter((i) =>
    ["observed-technical-evidence", "technical-artifact", "diagnosis"].includes(
      i.kind,
    ),
  );
  return solutionNarrativeSchema.parse({
    customerOutcome: by("business-outcome"),
    currentProblem: by("customer-statement"),
    currentWorkflow: by("note"),
    desiredExperience: by("requirement", "success-criterion"),
    proposedSolution: dedupeSourcedEntries(accepted.length ? accepted : proposed),
    architectureComponents: by("architecture-option"),
    architectureConnections: bundle.relations
      .filter(
        (r) =>
          r.status === "active" &&
          safeIds.has(r.fromItemId) &&
          safeIds.has(r.toItemId),
      )
      .map((r) => ({
        text: `${r.fromItemId} ${r.type} ${r.toItemId}`,
        sourceItemIds: [r.fromItemId, r.toItemId],
      })),
    customerJourney: by("requirement"),
    dataFlow: technical.map(sourced),
    deepgramProducts: technical
      .filter(
        (i) => i.structuredData.deepgramProduct || /deepgram/i.test(i.body),
      )
      .map(sourced),
    sdksAndRuntimes: technical
      .filter(
        (i) =>
          i.structuredData.sdk ||
          i.structuredData.sdkVersion ||
          i.structuredData.runtime,
      )
      .map(sourced),
    deployment: safe
      .filter((i) => i.structuredData.deploymentType || i.structuredData.region)
      .map(sourced),
    authentication: safe
      .filter((i) => /auth|credential|token|api key/i.test(i.body))
      .map(sourced),
    mediaPath: safe
      .filter(
        (i) =>
          i.structuredData.codec ||
          i.structuredData.encoding ||
          i.structuredData.sampleRate ||
          /audio|media|microphone|telephony/i.test(i.body),
      )
      .map(sourced),
    securityPrivacy: safe
      .filter(
        (i) =>
          i.kind === "constraint" ||
          /security|privacy|retention|residency|pii/i.test(i.body),
      )
      .map(sourced),
    scaleResilience: safe
      .filter((i) =>
        /scale|concurr|retry|fallback|resilien|interrupt/i.test(i.body),
      )
      .map(sourced),
    validationEvidence: by("validation-result"),
    successCriteria: by("success-criterion"),
    architectureDecisions: dedupeSourcedEntries(
      accepted.length ? accepted : proposed,
    ),
    risks: by("risk", "unresolved-conflict"),
    openQuestions: by("open-question", "unresolved-conflict"),
    pocPlan: by("validation-result", "success-criterion"),
    nextActions: by("action"),
    officialSources: by("official-deepgram-evidence"),
    publicSources: by("external-public-evidence"),
    assumptions: by("assumption", "hypothesis", "release-finding"),
    exclusions: items.filter((i) => !safe.includes(i)).map(sourced),
  });
}

export function narrativeSourceItemIds(narrative: SolutionNarrative) {
  return [
    ...new Set(
      Object.entries(narrative).flatMap(([field, values]) =>
        field === "exclusions"
          ? []
          : values.flatMap((value) => value.sourceItemIds),
      ),
    ),
  ];
}

export function assessDeliverableReadiness(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile = "customer-solution-pack",
) {
  const n = buildSolutionNarrative(bundle, profile);
  const blocking: string[] = [];
  const attention: string[] = [];
  const ready: string[] = [];
  const claimAudit = auditCaseExport(
    bundle,
    profile === "internal-solution-review"
      ? "internal-technical-brief"
      : "customer-handoff",
  );
  const contradictions = active(bundle).filter(
    (i) => i.kind === "unresolved-conflict" && !i.resolvedAt,
  );
  const blockingRisks = active(bundle).filter(
    (i) =>
      i.kind === "risk" &&
      i.structuredData.blocking === true &&
      i.structuredData.mitigationStatus !== "completed",
  );
  if (n.customerOutcome.length) ready.push("business outcome");
  else attention.push("business outcome is missing");
  if (n.currentProblem.length) ready.push("current problem");
  else attention.push("current-state problem is missing");
  if (n.proposedSolution.length)
    ready.push(
      n.architectureDecisions.some((x) => x.status === "accepted")
        ? "accepted architecture"
        : "proposed architecture is labeled",
    );
  else attention.push("solution direction is missing");
  if (n.desiredExperience.some((item) =>
    bundle.items.some(
      (source) =>
        source.id === item.sourceItemIds[0] && source.kind === "requirement",
    ),
  ))
    ready.push("customer-visible requirements");
  else attention.push("customer-visible requirements are missing");
  if (n.securityPrivacy.some((item) =>
    bundle.items.some(
      (source) =>
        source.id === item.sourceItemIds[0] && source.kind === "constraint",
    ),
  ))
    ready.push("relevant constraints");
  else attention.push("relevant constraints are missing");
  if (n.architectureComponents.some((item) =>
    bundle.items.some(
      (source) =>
        source.id === item.sourceItemIds[0] &&
        source.kind === "architecture-option",
    ),
  ))
    ready.push("architecture representation");
  else attention.push("architecture representation is missing");
  if (n.officialSources.length) ready.push("official Deepgram citations");
  else attention.push("official Deepgram citations are missing");
  const officialIds = new Set(
    approvedItems(bundle, profile)
      .filter((item) => item.kind === "official-deepgram-evidence")
      .map((item) => item.id),
  );
  const unsupportedDeepgramClaims = approvedItems(bundle, profile).filter(
    (item) =>
      ["decision", "architecture-option", "requirement"].includes(item.kind) &&
      /deepgram|voice agent|speech.to.text|text.to.speech/i.test(item.body) &&
      !item.sourceRefs.some((id) => officialIds.has(id)) &&
      !bundle.relations.some(
        (relation) =>
          relation.status === "active" &&
          ["supports", "documented-by"].includes(relation.type) &&
          relation.fromItemId === item.id &&
          officialIds.has(relation.toItemId),
      ),
  );
  if (unsupportedDeepgramClaims.length)
    attention.push(
      `${unsupportedDeepgramClaims.length} Deepgram-specific recommendation${unsupportedDeepgramClaims.length === 1 ? " lacks" : "s lack"} linked official evidence`,
    );
  if (n.successCriteria.length) ready.push("success criteria");
  else attention.push("success criteria are missing");
  if (n.nextActions.length) ready.push("customer-visible next actions");
  else attention.push("next actions are missing");
  if (contradictions.length)
    blocking.push(
      ...contradictions.map((i) => `unresolved contradiction: ${i.title}`),
    );
  if (blockingRisks.length)
    attention.push(
      ...blockingRisks.map((i) => `blocking risk requires review: ${i.title}`),
    );
  if (active(bundle).some((i) => i.redactionStatus === "contains-secret"))
    blocking.push("unredacted secret remains in active evidence");
  if (
    active(bundle).some(
      (i) =>
        i.kind === "official-deepgram-evidence" &&
        i.structuredData.freshnessState === "stale",
    )
  )
    attention.push("an official source is stale and must remain qualified");
  if (
    profile !== "internal-solution-review" &&
    claimAudit.needsQualification.length
  )
    attention.push(
      `${claimAudit.needsQualification.length} customer-visible claim${claimAudit.needsQualification.length === 1 ? " requires" : "s require"} qualification`,
    );
  const baseComplete =
    n.customerOutcome.length &&
    n.currentProblem.length &&
    n.proposedSolution.length;
  let state:
    "exploratory" | "draft" | "reviewable" | "customer-ready" | "blocked" =
    !baseComplete ? "exploratory" : attention.length ? "draft" : "reviewable";
  if (blocking.length) state = "blocked";
  else if (
    profile !== "internal-solution-review" &&
    ready.length >= 9 &&
    !attention.length &&
    claimAudit.excluded.every(
      (x) => x.reason === "Not approved for this export profile.",
    )
  )
    state = "customer-ready";
  return {
    state,
    ready,
    needsAttention: attention,
    blocked: blocking,
    claimAudit,
  };
}

const label = (value: string) =>
  redactCaseText(value, 72)
    .replace(/["<>\[\]{}|`]/g, "")
    .replace(/\s+/g, " ") || "To confirm";
export function generateMermaid(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile = "customer-solution-pack",
) {
  const n = buildSolutionNarrative(bundle, profile);
  const explicitFlows = n.architectureComponents
    .map((entry) => ({
      entry,
      parts: entry.text
        .split(/\s*(?:→|->)\s*/)
        .map((part) => part.replace(/[.;]+$/g, "").trim())
        .filter(Boolean),
    }))
    .filter((flow) => flow.parts.length > 1);
  const nodeEntries: Sourced[] = [];
  const nodeIndexByText = new Map<string, number>();
  const addNode = (entry: Sourced) => {
    const key = normalizeClaim(entry.text);
    const existing = nodeIndexByText.get(key);
    if (existing !== undefined) {
      nodeEntries[existing].sourceItemIds = [
        ...new Set([
          ...nodeEntries[existing].sourceItemIds,
          ...entry.sourceItemIds,
        ]),
      ];
      return existing;
    }
    const index = nodeEntries.length;
    nodeIndexByText.set(key, index);
    nodeEntries.push({ ...entry, sourceItemIds: [...entry.sourceItemIds] });
    return index;
  };
  const explicitEdges: string[] = [];
  if (explicitFlows.length) {
    for (const { entry, parts } of explicitFlows) {
      const indexes = parts.map((text) =>
        addNode({ ...entry, text, sourceItemIds: [...entry.sourceItemIds] }),
      );
      for (let index = 0; index < indexes.length - 1; index += 1)
        explicitEdges.push(
          `  n${indexes[index] + 1} -->|flows to| n${indexes[index + 1] + 1}`,
        );
    }
  } else {
    for (const entry of n.architectureComponents) addNode(entry);
  }
  if (!explicitFlows.length)
    for (const entry of dedupeSourcedEntries([
      ...n.mediaPath,
      ...n.authentication,
      ...n.deployment,
    ]))
      addNode(entry);
  if (!nodeEntries.length)
    addNode({
      text: "Proposed solution components — to confirm",
      sourceItemIds: [],
    });
  const nodes = nodeEntries.slice(0, MAX_MERMAID_NODES);
  const nodeByItemId = new Map<string, string>();
  nodes.forEach((node, index) => {
    for (const itemId of node.sourceItemIds)
      if (!nodeByItemId.has(itemId)) nodeByItemId.set(itemId, `n${index + 1}`);
  });
  const relationEdges = n.architectureConnections
    .map((connection) => {
      const [fromItemId, toItemId] = connection.sourceItemIds;
      const from = nodeByItemId.get(fromItemId);
      const to = nodeByItemId.get(toItemId);
      if (!from || !to || from === to) return null;
      const relationType =
        bundle.relations.find(
          (relation) =>
            relation.fromItemId === fromItemId &&
            relation.toItemId === toItemId &&
            relation.status === "active",
        )?.type ?? "informs";
      return `  ${from} -->|${label(relationType)}| ${to}`;
    })
    .filter((edge): edge is string => Boolean(edge))
    .slice(0, MAX_MERMAID_EDGES);
  const edges = [...new Set([...explicitEdges, ...relationEdges])].slice(
    0,
    MAX_MERMAID_EDGES,
  );
  const lines = [
    "flowchart LR",
    ...nodes.map((x, i) => `  n${i + 1}["${label(x.text)}"]`),
    ...edges,
  ];
  const source = lines.join("\n");
  return {
    source,
    description: describeMermaid(source),
    sourceItemIds: [...new Set(nodes.flatMap((x) => x.sourceItemIds))],
    validation: validateMermaid(source),
  };
}
export function validateMermaid(source: string) {
  const errors: string[] = [];
  if (source.length > 20_000) errors.push("Source exceeds 20,000 characters.");
  if (unsafeMermaid.test(source))
    errors.push("A prohibited Mermaid directive or unsafe protocol was found.");
  const lines = source.split(/\r?\n/);
  if (!/^\s*(?:flowchart|graph)\s+(?:LR|RL|TB|BT|TD)\s*$/i.test(lines[0] ?? ""))
    errors.push("Line 1 must declare a supported flowchart direction.");
  const nodePattern = /^\s*(n\d+)\["([^"<>]{1,120})"\]\s*$/;
  const edgePattern =
    /^\s*(n\d+)\s+-->(?:\|([A-Za-z0-9 -]{1,80})\|)?\s*(n\d+)\s*$/;
  const nodeIds = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    if (!line.trim()) continue;
    const node = nodePattern.exec(line);
    if (node) {
      if (nodeIds.has(node[1]))
        errors.push(`Line ${index + 2} repeats node ID ${node[1]}.`);
      nodeIds.add(node[1]);
      continue;
    }
    const edge = edgePattern.exec(line);
    if (edge) {
      edges.push({ from: edge[1], to: edge[3] });
      continue;
    }
    errors.push(`Line ${index + 2} is outside the safe Mermaid subset.`);
  }
  for (const edge of edges)
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
      errors.push(
        `Edge ${edge.from} to ${edge.to} references an undefined node.`,
      );
  const nodeCount = nodeIds.size,
    edgeCount = edges.length;
  if (!nodeCount) errors.push("At least one architecture node is required.");
  if (nodeCount > MAX_MERMAID_NODES)
    errors.push(`Node count exceeds ${MAX_MERMAID_NODES}.`);
  if (edgeCount > MAX_MERMAID_EDGES)
    errors.push(`Edge count exceeds ${MAX_MERMAID_EDGES}.`);
  if (lines.some((l) => /<[^>]+>/.test(l)))
    errors.push("HTML labels are not allowed.");
  return {
    valid: !errors.length,
    errors,
    nodeCount,
    edgeCount,
    securityMode: "strict" as const,
  };
}

function parseSafeMermaid(source: string) {
  const nodes = new Map<string, string>();
  const edges: { from: string; to: string; label: string }[] = [];
  for (const line of source.split(/\r?\n/).slice(1)) {
    const node = /^\s*(n\d+)\["([^"<>]{1,120})"\]\s*$/.exec(line);
    if (node) {
      nodes.set(node[1], node[2]);
      continue;
    }
    const edge =
      /^\s*(n\d+)\s+-->(?:\|([A-Za-z0-9 -]{1,80})\|)?\s*(n\d+)\s*$/.exec(
        line,
      );
    if (edge)
      edges.push({ from: edge[1], to: edge[3], label: edge[2] ?? "" });
  }
  return { nodes, edges };
}

export function describeMermaid(source: string) {
  const validation = validateMermaid(source);
  if (!validation.valid) return "Diagram is invalid and cannot be described.";
  const graph = parseSafeMermaid(source);
  return [
    ...[...graph.nodes.values()].map((value, index) => `${index + 1}. ${value}`),
    ...(graph.edges.length
      ? [
          "",
          "Recorded diagram relationships:",
          ...graph.edges.map((edge) => {
            const from = graph.nodes.get(edge.from) ?? edge.from;
            const to = graph.nodes.get(edge.to) ?? edge.to;
            return `- ${from} ${edge.label || "connects to"} ${to}`;
          }),
        ]
      : ["", "No relationship is drawn between the listed components."]),
  ].join("\n");
}

export function auditMermaidEdit(generated: string, requested: string) {
  if (generated === requested)
    return {
      userEdited: false,
      status: "passed" as const,
      unsupportedLabels: [] as string[],
      unsupportedRelationships: [] as string[],
      removedLabels: [] as string[],
      removedRelationships: [] as string[],
      message: "Generated Mermaid is unchanged.",
    };
  const generatedGraph = parseSafeMermaid(generated);
  const requestedGraph = parseSafeMermaid(requested);
  const generatedLabels = new Set(
    [...generatedGraph.nodes.values()].map(normalizeClaim),
  );
  const requestedLabels = new Set(
    [...requestedGraph.nodes.values()].map(normalizeClaim),
  );
  const unsupportedLabels = [...requestedGraph.nodes.values()].filter(
    (value) => !generatedLabels.has(normalizeClaim(value)),
  );
  const removedLabels = [...generatedGraph.nodes.values()].filter(
    (value) => !requestedLabels.has(normalizeClaim(value)),
  );
  const generatedEdges = new Set(
    generatedGraph.edges.map(
      (edge) =>
        `${edge.from}|${normalizeClaim(edge.label)}|${edge.to}`,
    ),
  );
  const unsupportedRelationships = requestedGraph.edges
    .map(
      (edge) => `${edge.from}|${normalizeClaim(edge.label)}|${edge.to}`,
    )
    .filter((edge) => !generatedEdges.has(edge));
  const requestedEdges = new Set(
    requestedGraph.edges.map(
      (edge) => `${edge.from}|${normalizeClaim(edge.label)}|${edge.to}`,
    ),
  );
  const removedRelationships = [...generatedEdges].filter(
    (edge) => !requestedEdges.has(edge),
  );
  const qualified =
    unsupportedLabels.length ||
    unsupportedRelationships.length ||
    removedLabels.length ||
    removedRelationships.length;
  return {
    userEdited: true,
    status: qualified ? ("qualified" as const) : ("passed" as const),
    unsupportedLabels,
    unsupportedRelationships,
    removedLabels,
    removedRelationships,
    message: qualified
      ? "Manually edited diagram content is not fully supported by the accepted case graph and requires review."
      : "The diagram edit changes formatting only and retains generated evidence coverage.",
  };
}

export function mermaidToSafeSvg(source: string, brandDataUrl?: string) {
  const validation = validateMermaid(source);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const graph = parseSafeMermaid(source);
  const nodes = [...graph.nodes.entries()].slice(0, MAX_MERMAID_NODES);
  const indexById = new Map(nodes.map(([id], index) => [id, index]));
  const width = 1000,
    height = Math.max(180, nodes.length * 92 + 40);
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const relationshipDescription = graph.edges
    .map((edge) => {
      const from = graph.nodes.get(edge.from) ?? edge.from;
      const to = graph.nodes.get(edge.to) ?? edge.to;
      return `${from} ${edge.label || "connects to"} ${to}`;
    })
    .join("; ");
  const edgeMarkup = graph.edges
    .map((edge, edgeIndex) => {
      const fromIndex = indexById.get(edge.from);
      const toIndex = indexById.get(edge.to);
      if (fromIndex === undefined || toIndex === undefined) return "";
      const fromY = 50 + fromIndex * 92 + 25;
      const toY = 50 + toIndex * 92 + 25;
      const laneX = 820 + (edgeIndex % 5) * 28;
      const labelY = Math.min(fromY, toY) + Math.abs(toY - fromY) / 2 - 5;
      return `<path d="M780 ${fromY} H${laneX} V${toY} H790" fill="none" stroke="#22d3c5" stroke-width="2" marker-end="url(#a)"/><text x="${laneX + 4}" y="${labelY}" fill="#8fb8be" font-family="Arial, sans-serif" font-size="11">${esc(edge.label.slice(0, 34))}</text>`;
    })
    .join("");
  const safeBrand = brandDataUrl && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(brandDataUrl)
    ? `<image href="${brandDataUrl}" x="900" y="20" width="72" height="72" opacity="0.88" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title id="title">Solution Architecture</title><desc id="desc">${esc(relationshipDescription || nodes.map(([, value]) => value).join("; "))}</desc><rect width="100%" height="100%" fill="#061019"/>${nodes.map(([, value], index) => `<rect x="60" y="${50 + index * 92}" width="720" height="50" rx="8" fill="#0d2530" stroke="#22d3c5"/><text x="80" y="${81 + index * 92}" fill="#e5f9f7" font-family="Arial, sans-serif" font-size="16">${esc(value.slice(0, 100))}</text>`).join("")}${edgeMarkup}${safeBrand}<defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#22d3c5"/></marker></defs></svg>`;
}

export function buildBriefMarkdown(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile,
  customerName: string,
  manualEdits: DeliverableManualEdits = {},
) {
  const edits = sanitizeDeliverableManualEdits(manualEdits);
  const n = buildSolutionNarrative(bundle, profile),
    readiness = assessDeliverableReadiness(bundle, profile);
  const sec = (title: string, items: Sourced[]) =>
    items.length
      ? `## ${title}\n\n${items.map((x) => `- ${safeMarkdownProse(qualify(bundle, x))}`).join("\n")}\n\n`
      : "";
  const sourceSec = (title: string, items: Sourced[]) => {
    const rows = items.flatMap((entry) => {
      const item = bundle.items.find(
        (candidate) => candidate.id === entry.sourceItemIds[0],
      );
      if (!item) return [];
      const url = safeSourceUrl(item);
      return [
        `- ${safeMarkdownProse(qualify(bundle, entry))}${url ? ` — [${item.kind === "official-deepgram-evidence" ? "Official source" : "Approved public source"}](${url})` : ""}`,
      ];
    });
    return rows.length ? `## ${title}\n\n${rows.join("\n")}\n\n` : "";
  };
  const title = safeMarkdownProse(
    edits.title || `${safeName(customerName)} — Technical Solution Brief`,
    180,
  );
  const recommendedItems = edits.sectionWording
    ? [manualText(edits.sectionWording)]
    : n.proposedSolution;
  const recommendedSourceIds = new Set(
    n.proposedSolution.flatMap((item) => item.sourceItemIds),
  );
  const designFitKinds = new Set<CaseItem["kind"]>([
    "requirement",
    "constraint",
  ]);
  const whyThisFits = dedupeSourcedEntries(
    [...n.securityPrivacy, ...n.scaleResilience].filter(
      (item) =>
        !item.sourceItemIds.some((sourceId) =>
          recommendedSourceIds.has(sourceId),
        ) &&
        item.sourceItemIds.some((sourceId) => {
          const sourceItem = bundle.items.find(
            (candidate) => candidate.id === sourceId,
          );
          return sourceItem ? designFitKinds.has(sourceItem.kind) : false;
        }),
    ),
  ).slice(0, 5);
  let md = `# ${title}\n\n**${readiness.state.toUpperCase()} — review before sharing** · Source case revision ${bundle.case.revision}\n\n`;
  if (edits.executiveSummary)
    md += `## Executive summary\n\n${safeMarkdownProse(manualText(edits.executiveSummary).text)}\n\n`;
  md +=
    sec("Customer outcome", n.customerOutcome) +
    sec("Current challenge", n.currentProblem) +
    sec(
      "Recommended solution",
      recommendedItems,
    ) +
    sec("Why this design fits", whyThisFits) +
    sec("POC success measures", n.successCriteria) +
    sec(
      "Risks and open questions",
      [...n.risks, ...n.openQuestions].slice(0, 5),
    ) +
    sec(
      "Immediate next actions",
      edits.nextActions?.length
        ? edits.nextActions.map(manualText)
        : n.nextActions,
    ) +
    sourceSec("Official Deepgram sources", n.officialSources) +
    sourceSec("Approved public sources", n.publicSources);
  const openQuestions = edits.openQuestions?.length
    ? edits.openQuestions
    : [...readiness.blocked, ...readiness.needsAttention];
  if (openQuestions.length)
    md += `## Open Questions Before Finalization\n\n${openQuestions.map((x) => `- ${safeMarkdownProse(edits.openQuestions?.length ? manualText(x).text : x)}`).join("\n")}\n`;
  const words = md.trim().split(/\s+/).length;
  return {
    markdown: md,
    wordCount: words,
    fit: words <= 750,
    warnings: words > 750 ? ["One-page fit requires review"] : [],
  };
}
function qualify(bundle: SolutionCaseBundle, value: Sourced) {
  const item = bundle.items.find((i) => i.id === value.sourceItemIds[0]);
  if (!item) return value.text;
  return redactCaseText(evaluateClaimSafety(item).saferWording).replace(
    /[.!?]+; (?=(?:this should be confirmed|confirm before sharing)\b)/gi,
    "; ",
  );
}
function qualifyStoryboardItem(bundle: SolutionCaseBundle, value: Sourced) {
  if (!value.sourceItemIds.length) return value.text;
  return qualify(bundle, value);
}
function presentationText(value: string) {
  return redactCaseText(value, 900)
    .replace(/\s+/g, " ")
    .replace(/^The customer confirmed that\s+/i, "Customer-confirmed: ")
    .replace(/^The customer stated that\s+/i, "Customer-stated: ")
    .replace(/^The accepted decision is:\s*/i, "Accepted decision: ")
    .replace(/^The supplied evidence suggests(?: that)?\s+/i, "Evidence suggests: ")
    .replace(/^This design assumes(?: that)?\s+/i, "Design assumption: ")
    .replace(/^This should be confirmed(?: during the POC)?:?\s*/i, "To confirm: ")
    .replace(
      /^Customer-confirmed: The POC must demonstrate this agreed direction:\s*/i,
      "Customer-confirmed POC direction: ",
    )
    .trim();
}
function presentationSemanticKey(value: string) {
  return normalizeClaim(value)
    .replace(
      /^(?:customer confirmed poc direction|customer confirmed|customer stated|accepted decision|evidence suggests|design assumption|to confirm)\s+/,
      "",
    )
    .replace(/^the poc must demonstrate this agreed direction\s+/, "");
}
function dedupePresentationEntries(entries: Sourced[]) {
  const byClaim = new Map<string, Sourced>();
  for (const entry of dedupeSourcedEntries(entries)) {
    const text = presentationText(entry.text);
    const key = presentationSemanticKey(text);
    const existing = byClaim.get(key);
    if (existing) {
      existing.sourceItemIds = [
        ...new Set([...existing.sourceItemIds, ...entry.sourceItemIds]),
      ];
      if (
        text.startsWith("Accepted decision:") ||
        (text.startsWith("Customer-confirmed:") &&
          !existing.text.startsWith("Accepted decision:"))
      )
        existing.text = text;
      continue;
    }
    byClaim.set(key, {
      ...entry,
      text,
      sourceItemIds: [...entry.sourceItemIds],
    });
  }
  return [...byClaim.values()];
}
function architectureFlowFromNarrative(narrative: SolutionNarrative) {
  const candidates = [
    ...narrative.architectureComponents,
    ...narrative.customerJourney,
    ...narrative.proposedSolution,
  ];
  const flow = candidates.find((entry) => /(?:→|->)/.test(entry.text));
  if (!flow) return [];
  return flow.text
    .split(/\s*(?:→|->)\s*/)
    .map((part) =>
      presentationText(part)
        .replace(/^(?:Customer-confirmed|Customer-stated):\s*/i, "")
        .replace(/\//g, " or ")
        .replace(/[.;]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 5)
    .map((label) => ({ label, sourceItemIds: [...flow.sourceItemIds] }));
}
function successMeasuresFromNarrative(narrative: SolutionNarrative) {
  const value = narrative.successCriteria.map((entry) => entry.text).join(" ");
  const candidates = [
    ["task", "Task completion"],
    ["latency", "Latency"],
    ["accuracy", "Accuracy"],
    ["quality", "Quality"],
    ["safety", "Safety"],
    ["recovery", "Recovery"],
    ["reliability", "Reliability"],
  ] as const;
  return candidates
    .filter(([needle]) => new RegExp(`\\b${needle}\\b`, "i").test(value))
    .map(([, label]) => label)
    .slice(0, 5);
}
export function buildPresentationStoryboard(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile,
  customerName: string,
  presentation: "product" | "technical" | "poc" = "product",
  manualEdits: DeliverableManualEdits = {},
) {
  const edits = sanitizeDeliverableManualEdits(manualEdits);
  const n = buildSolutionNarrative(bundle, profile);
  const slides = [
    {
      title: "Outcome and opportunity",
      presentationRole: "outcome",
      bullets: [...n.customerOutcome, ...n.currentProblem],
    },
    {
      title: "What we learned",
      presentationRole: "discovery",
      bullets: [...n.desiredExperience, ...n.securityPrivacy],
    },
    {
      title: "Recommended solution",
      presentationRole: "architecture",
      bullets: [...n.proposedSolution, ...n.architectureComponents],
    },
    {
      title: "How the experience works",
      presentationRole: "experience",
      bullets: [...n.customerJourney, ...n.mediaPath, ...n.scaleResilience],
    },
    {
      title: "POC and success criteria",
      presentationRole: "success",
      bullets: [...n.successCriteria, ...n.validationEvidence],
    },
    {
      title: "Decisions and next actions",
      presentationRole: "actions",
      bullets: [
        ...n.architectureDecisions,
        ...n.nextActions,
        ...n.openQuestions,
      ],
    },
  ];
  if (presentation === "technical")
    slides.splice(4, 0, {
      title: "Runtime, security, and resilience",
      presentationRole: "technical",
      bullets: [
        ...n.sdksAndRuntimes,
        ...n.authentication,
        ...n.deployment,
        ...n.scaleResilience,
      ],
    });
  if (presentation === "poc")
    slides.splice(5, 0, {
      title: "Validation responsibilities",
      presentationRole: "validation",
      bullets: [...n.pocPlan, ...n.risks],
    });
  const finalSlideManual = [
    ...(edits.openQuestions ?? []).map(manualText),
    ...(edits.nextActions ?? []).map(manualText),
  ].slice(0, 6);
  const architectureFlow = architectureFlowFromNarrative(n);
  const architectureStatus = n.proposedSolution.some(
    (entry) => entry.status === "accepted",
  )
    ? "accepted"
    : "proposed";
  const successMeasures = successMeasuresFromNarrative(n);
  return {
    title: edits.title || `${safeName(customerName)} Solution`,
    slides: slides.map((s, index) => {
      const slideLimit = index === 2 ? 2 : 4;
      const sourceEntries =
        index === 2 && architectureFlow.length
          ? dedupePresentationEntries(s.bullets).filter(
              (entry) => !/(?:→|->)/.test(entry.text),
            )
          : dedupePresentationEntries(s.bullets);
      return {
        ...s,
        title: edits.slideTitles?.[index] || s.title,
        bullets: sourceEntries
          .slice(
            0,
            Math.max(
              0,
              slideLimit -
                (index === slides.length - 1 ? finalSlideManual.length : 0) -
                (edits.slideTakeaways?.[index] ? 1 : 0),
            ),
          )
          .map((entry) => ({
            text: presentationText(qualifyStoryboardItem(bundle, entry)),
            sourceItemIds: entry.sourceItemIds,
          }))
          .concat(
            index === slides.length - 1
              ? finalSlideManual.map((item) => ({
                  text: presentationText(item.text),
                  sourceItemIds: item.sourceItemIds,
                }))
              : [],
          )
          .concat(
            edits.slideTakeaways?.[index]
              ? [
                  {
                    text: presentationText(
                      manualText(edits.slideTakeaways[index]).text,
                    ),
                    sourceItemIds: [],
                  },
                ]
              : [],
          )
          .slice(0, slideLimit),
      };
    }),
    architectureFlow,
    architectureStatus,
    successMeasures,
    disclaimer:
      "Community-built solution artifact. Not official Deepgram material.",
  };
}
export function buildSourceManifest(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile = "customer-solution-pack",
  manualEdits: DeliverableManualEdits = {},
): DeliverableSourceReference[] {
  const references: DeliverableSourceReference[] = approvedItems(bundle, profile)
    .filter(
      (i) =>
        i.sourceRefs.length ||
        [
          "official-deepgram-evidence",
          "customer-statement",
          "observed-technical-evidence",
          "validation-result",
          "decision",
          "requirement",
          "constraint",
          "action",
          "external-public-evidence",
        ].includes(i.kind),
    )
    .filter(
      (i) =>
        i.kind !== "official-deepgram-evidence" ||
        isOfficialDeepgramDocsUrl(
          String(i.structuredData.canonicalSourceUrl ?? ""),
        ),
    )
    .map((i): DeliverableSourceReference => ({
      id: `source-${i.id}`,
      caseSourceRefId: i.id,
      title: redactCaseText(i.title, 300),
      canonicalUrl: safeSourceUrl(i),
      authority:
        i.kind === "official-deepgram-evidence"
          ? ("official-deepgram" as const)
          : i.kind === "customer-statement"
            ? ("customer-stated" as const)
            : i.kind === "observed-technical-evidence"
              ? ("observed-artifact" as const)
              : i.kind === "validation-result"
                ? ("deterministic-validation" as const)
                : i.kind === "external-public-evidence"
                  ? ("approved-public" as const)
                  : i.verificationState === "customer-confirmed" ||
                      i.verificationState === "customer-stated-unverified"
                    ? ("customer-stated" as const)
                    : ("user-edited" as const),
      sourceType: i.kind,
      conciseRelevance: redactCaseText(i.body, 240),
      retrievedAt:
        typeof i.structuredData.retrievedAt === "string"
          ? i.structuredData.retrievedAt
          : undefined,
      lastVerifiedAt:
        typeof i.structuredData.lastVerifiedAt === "string"
          ? i.structuredData.lastVerifiedAt
          : undefined,
      freshnessState:
        i.structuredData.freshnessState === "current" ||
        i.structuredData.freshnessState === "stale"
          ? i.structuredData.freshnessState
          : "unknown",
      artifactIds: [],
      claimIds: [i.id],
    }));
  if (editValues(manualEdits).length)
    references.push({
      id: "source-user-edits",
      caseSourceRefId: bundle.case.id,
      title: "User-edited deliverable wording",
      authority: "user-edited",
      sourceType: "user-edit",
      conciseRelevance:
        "Manual wording is not evidence; unsupported additions remain qualified pending review.",
      freshnessState: "unknown",
      artifactIds: [],
      claimIds: [],
    });
  return references;
}

function safeSourceUrl(item: CaseItem) {
  const value = String(item.structuredData.canonicalSourceUrl ?? "");
  if (
    (item.kind === "official-deepgram-evidence" &&
      !isOfficialDeepgramDocsUrl(value)) ||
    (item.kind !== "official-deepgram-evidence" &&
      item.kind !== "external-public-evidence") ||
    !value
  )
    return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url
          .toString()
          .replace(/\\/g, "%5C")
          .replace(/\(/g, "%28")
          .replace(/\)/g, "%29")
      : undefined;
  } catch {
    return undefined;
  }
}

export function buildRedactedDeliverableCase(
  bundle: SolutionCaseBundle,
  profile: DeliverableProfile,
) {
  const exported = JSON.parse(exportSolutionCase(bundle)) as SolutionCaseBundle;
  const customer = profile !== "internal-solution-review";
  const allowed = new Set(
    approvedItems(exported, profile)
      .filter(
        (item) =>
          item.kind !== "technical-artifact" &&
          item.kind !== "note" &&
          item.redactionStatus !== "contains-secret",
      )
      .map((item) => item.id),
  );
  const items = exported.items
    .filter((item) => allowed.has(item.id))
    .map((item) => ({
      id: item.id,
      caseId: item.caseId,
      kind: item.kind,
      title: redactCaseText(item.title, 300),
      body: redactCaseText(item.body),
      structuredData: redactStructuredData(item.kind, item.structuredData),
      status: item.status,
      confidence: item.confidence,
      verificationState: item.verificationState,
      claimSafety: evaluateClaimSafety(item).state,
      sourceRefs: item.sourceRefs.filter((id) => allowed.has(id)),
      moduleOrigin: redactCaseText(item.moduleOrigin, 120),
      createdBy: "Redacted local actor",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      confirmedAt: item.confirmedAt,
      resolvedAt: item.resolvedAt,
      supersededAt: item.supersededAt,
      supersededById: item.supersededById,
      tags: item.tags.map((tag) => redactCaseText(tag, 80)),
      sensitivity: customer ? ("public" as const) : item.sensitivity,
      visibility: customer ? ("customer" as const) : item.visibility,
      exportPolicy: "include" as const,
      includeInCustomerExport: customer,
      includeInInternalExport: true,
      isPinned: item.isPinned,
      isArchived: item.isArchived,
      redactionStatus: "redacted" as const,
      provenance: {
        mode: item.provenance.mode,
        sourceItemIds: item.provenance.sourceItemIds.filter((id) =>
          allowed.has(id),
        ),
      },
      revision: item.revision,
    })) as CaseItem[];
  const relations = exported.relations
    .filter(
      (relation) =>
        allowed.has(relation.fromItemId) &&
        allowed.has(relation.toItemId) &&
        (!customer || relation.visibility === "customer"),
    )
    .map((relation) => ({
      id: relation.id,
      caseId: relation.caseId,
      fromItemId: relation.fromItemId,
      toItemId: relation.toItemId,
      type: relation.type,
      direction: relation.direction,
      note: redactCaseText(relation.note, 1000),
      confidence: relation.confidence,
      sourceRefs: relation.sourceRefs.filter((id) => allowed.has(id)),
      createdBy: "Redacted local actor",
      createdAt: relation.createdAt,
      updatedAt: relation.updatedAt,
      status: relation.status,
      visibility: customer ? ("customer" as const) : relation.visibility,
      provenance: {
        mode: relation.provenance.mode,
        sourceItemIds: relation.provenance.sourceItemIds.filter((id) =>
          allowed.has(id),
        ),
      },
    }));
  const relationIds = new Set(relations.map((relation) => relation.id));
  const ledger = exported.ledger
    .filter(
      (event) =>
        (!customer || event.visibility === "customer") &&
        (event.targetType === "case" ||
          allowed.has(event.targetId) ||
          relationIds.has(event.targetId)),
    )
    .map((event) => ({
      id: event.id,
      caseId: event.caseId,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      changedFields: Object.fromEntries(
        Object.entries(event.changedFields).map(([key, value]) => [
          key,
          redactCaseText(String(value), 500),
        ]),
      ),
      previousRevision: event.previousRevision,
      nextRevision: event.nextRevision,
      actorType: event.actorType,
      actorLabel: "Redacted local actor",
      moduleOrigin: event.moduleOrigin,
      reason: redactCaseText(event.reason, 500),
      createdAt: event.createdAt,
      redactionStatus: "redacted" as const,
      visibility: event.visibility,
      provenance: {
        mode: event.provenance.mode,
        sourceItemIds: event.provenance.sourceItemIds.filter((id) =>
          allowed.has(id),
        ),
      },
    }));
  return {
    schemaVersion: exported.schemaVersion,
    case: {
      id: exported.case.id,
      schemaVersion: exported.case.schemaVersion,
      applicationVersion: exported.case.applicationVersion,
      title: safeName(exported.case.title),
      displayName: safeName(exported.case.displayName),
      optionalCustomerDisplayName: exported.case.optionalCustomerDisplayName
        ? safeName(exported.case.optionalCustomerDisplayName)
        : undefined,
      caseType: exported.case.caseType,
      status: exported.case.status,
      sessionStage: exported.case.sessionStage,
      owner: "Redacted local owner",
      participants: [],
      tags: exported.case.tags.map((tag) => redactCaseText(tag, 80)),
      summary: redactCaseText(exported.case.summary, 4000),
      businessOutcome: redactCaseText(exported.case.businessOutcome, 2000),
      currentStateSummary: redactCaseText(
        exported.case.currentStateSummary,
        2000,
      ),
      desiredStateSummary: redactCaseText(
        exported.case.desiredStateSummary,
        2000,
      ),
      defaultVisibility: customer ? ("customer" as const) : "internal",
      createdAt: exported.case.createdAt,
      updatedAt: exported.case.updatedAt,
      lastOpenedAt: exported.case.lastOpenedAt,
      lastMigratedAt: exported.case.lastMigratedAt,
      sourceFreshness: exported.case.sourceFreshness,
      revision: exported.case.revision,
      redactionStatus: "redacted" as const,
      activeModule: redactCaseText(exported.case.activeModule, 120),
      pinnedItemIds: exported.case.pinnedItemIds.filter((id) => allowed.has(id)),
      archivedAt: exported.case.archivedAt,
      migrationHistory: exported.case.migrationHistory.map((entry) =>
        redactCaseText(entry, 200),
      ),
      exportVisibilityDefaults: exported.case.exportVisibilityDefaults,
    },
    items,
    relations,
    ledger,
    questionCandidates: customer
      ? []
      : exported.questionCandidates.map(
          (question) => redactUnknown(question) as typeof question,
        ),
    savedAt: exported.savedAt,
  };
}

function redactStructuredData(
  kind: CaseItem["kind"],
  value: Record<string, unknown>,
) {
  const safe = redactUnknown(value) as Record<string, unknown>;
  if (kind === "customer-statement") {
    delete safe.verbatimText;
    delete safe.transcriptTimestamp;
    delete safe.sourceArtifactId;
    delete safe.speakerLabel;
  }
  for (const key of Object.keys(safe))
    if (
      /(?:raw(?:Transcript|Audio|Code|Log)|cookie|authorization|requestHeaders?|accessToken|apiKey|privateKey)/i.test(
        key,
      )
    )
      delete safe[key];
  return safe;
}

function redactUnknown(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED_DEPTH_LIMIT]";
  if (typeof value === "string") return redactCaseText(value, 4000);
  if (Array.isArray(value))
    return value.slice(0, 100).map((entry) => redactUnknown(entry, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key]) =>
            !/^(?:raw.*|transcript(?:Text|Content)?|privateNote|customerCode|fullLog|authorization|cookie|accessToken|apiKey|privateKey|password|secret)$/i.test(
              key,
            ),
        )
        .slice(0, 100)
        .map(([key, entry]) => [
          redactCaseText(key, 120),
          redactUnknown(entry, depth + 1),
        ]),
    );
  return value;
}
export function safeName(value: string) {
  const clean = redactCaseText(value, 80)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean)
    ? `Customer ${clean}`
    : clean || "Customer";
}
export function safeStem(value: string) {
  return (
    safeName(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "customer"
  );
}

export const profileRules: Record<
  DeliverableProfile,
  { include: string[]; exclude: string[] }
> = {
  "customer-solution-pack": {
    include: [
      "approved customer-visible evidence",
      "accepted decisions",
      "scoped validation",
      "official citations",
    ],
    exclude: [
      "private items",
      "internal risks",
      "raw code",
      "unconfirmed release findings",
    ],
  },
  "internal-solution-review": {
    include: [
      "approved internal evidence",
      "assumptions",
      "risks",
      "diagnoses",
      "release findings",
      "contradictions",
    ],
    exclude: ["secrets", "raw transcripts", "unredacted code"],
  },
  "poc-kickoff-pack": {
    include: [
      "objective",
      "scope",
      "architecture",
      "success criteria",
      "validation",
      "owners",
    ],
    exclude: ["unrelated evidence", "private opportunity commentary"],
  },
  "executive-takeaway": {
    include: [
      "business outcome",
      "direction",
      "impact",
      "decisions",
      "next actions",
    ],
    exclude: ["low-level diagnostics", "raw code", "minor technical detail"],
  },
};
export const deliverableExportProfile = (
  profile: DeliverableProfile,
): ExportProfile =>
  profile === "internal-solution-review"
    ? "internal-technical-brief"
    : profile === "poc-kickoff-pack"
      ? "poc-brief"
      : "customer-handoff";

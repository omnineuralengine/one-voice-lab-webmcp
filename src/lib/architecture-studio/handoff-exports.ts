import { deriveActionRegister, deriveDecisionRegister } from "@/lib/architecture-studio/handoff-derivation";
import { normalizeHandoffState } from "@/lib/architecture-studio/handoff-state";
import { createInitialSimulationState, validatePortableDiagnosticSession } from "@/lib/architecture-studio/simulation-state";
import type { PublicStudioSession, StudioSession } from "@/types/architecture-studio";
import type { PortableStudioSessionExport, SessionReportModel } from "@/types/architecture-studio-handoff";

type SessionLike = StudioSession | PublicStudioSession;

export function buildPortableSessionExport(session: SessionLike, includeOperatorNotes = false): PortableStudioSessionExport {
  const snapshot = JSON.parse(JSON.stringify(session)) as PublicStudioSession;
  snapshot.participants = snapshot.participants.map((participant, index) => ({ ...participant, displayName: `Synthetic participant ${index + 1}` }));
  snapshot.architectureSimulation = snapshot.architectureSimulation ?? createInitialSimulationState();
  snapshot.handoffState = normalizeHandoffState(snapshot.handoffState);
  snapshot.architectureSimulation.operatorAidsVisible = false;
  snapshot.handoffState.presentationMode = false;
  snapshot.handoffState.perspective = "facilitator";
  if (!includeOperatorNotes) stripOperatorNotes(snapshot);
  return { kind: "deepgram-architecture-studio-session", schemaVersion: 1, syntheticData: true, exportedAt: new Date().toISOString(), operatorNotesIncluded: includeOperatorNotes, session: snapshot };
}

export function validatePortableSessionExport(value: unknown): { export: PortableStudioSessionExport; session: PublicStudioSession } | null {
  if (!isRecord(value) || value.kind !== "deepgram-architecture-studio-session" || value.schemaVersion !== 1 || value.syntheticData !== true || !isShortString(value.exportedAt, 80) || typeof value.operatorNotesIncluded !== "boolean") return null;
  if (!isRecord(value.session) || hasForbiddenKey(value.session, 0)) return null;
  const session = value.session;
  if (!isShortString(session.id, 160) || !isShortString(session.code, 12) || !isShortString(session.scenarioId, 80) || !isShortString(session.scenarioName, 120)) return null;
  if (!Array.isArray(session.answers) || session.answers.length > 500 || !Array.isArray(session.participants) || session.participants.length > 30 || !Array.isArray(session.architectureOverrides) || !Array.isArray(session.recommendationHistory)) return null;
  if (!isRecord(session.architectureSimulation) || !validatePortableDiagnosticSession({ kind: "deepgram-architecture-studio-diagnostics", schemaVersion: 1, exportedAt: value.exportedAt, scenarioId: session.scenarioId, scenarioName: session.scenarioName, simulation: session.architectureSimulation })) return null;
  if (!validHandoffState(session.handoffState)) return null;
  if (!plainJson(session, 0)) return null;
  const cloned = structuredClone(session) as unknown as PublicStudioSession;
  cloned.architectureSimulation.operatorAidsVisible = false;
  cloned.handoffState.presentationMode = false;
  cloned.handoffState.perspective = "facilitator";
  const exportValue: PortableStudioSessionExport = { kind: "deepgram-architecture-studio-session", schemaVersion: 1, syntheticData: true, exportedAt: value.exportedAt, operatorNotesIncluded: value.operatorNotesIncluded, session: cloned };
  return { export: exportValue, session: cloned };
}

export function decisionActionMarkdown(session: SessionLike) {
  const decisions = deriveDecisionRegister(session);
  const actions = deriveActionRegister(session, decisions);
  return [
    "# Decision and Action Register",
    "**Synthetic guided scenario. Owners and timing are fictional unless explicitly confirmed.**",
    markdownSection("Decisions", decisions.map((decision) => `**${decision.decision}** — ${decision.status}; owner: ${decision.decisionOwner}; tradeoff: ${decision.tradeoff}; review trigger: ${decision.reviewTrigger}`)),
    markdownSection("Actions", actions.map((action) => `**${action.action}** — ${action.owner}; ${action.stakeholderGroup}; ${action.timing}; ${action.status}; dependency: ${action.dependency}`)),
  ].join("\n\n");
}

export function decisionActionCsv(session: SessionLike) {
  const decisions = deriveDecisionRegister(session);
  const actions = deriveActionRegister(session, decisions);
  const rows: string[][] = [["record_type", "id", "item", "status", "owner", "stakeholder_group", "timing", "dependency_or_tradeoff", "related_record", "completion_evidence", "synthetic"]];
  decisions.forEach((decision) => rows.push(["decision", decision.id, decision.decision, decision.status, decision.decisionOwner, "", decision.timestamp, decision.tradeoff, "", decision.evidence.join(" | "), String(decision.synthetic)]));
  actions.forEach((action) => rows.push(["action", action.id, action.action, action.status, action.owner, action.stakeholderGroup, action.timing, action.dependency, action.relatedDecisionId ?? action.relatedOpenQuestionId ?? "", action.completionEvidence, String(action.synthetic)]));
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function sessionReportMarkdown(report: SessionReportModel) {
  return [
    "# Deepgram Voice Architecture Studio — Session Report",
    `**${report.executiveSummary.syntheticLabel}**`,
    report.disclaimer,
    "## 1. Cover summary",
    `${report.executiveSummary.fictionalCustomer} · ${report.executiveSummary.recommendedDirection}`,
    "## 2. Customer objective",
    report.executiveSummary.customerObjective,
    markdownSection("3. Discovery findings", report.executiveSummary.currentEnvironment),
    "## 4. Proposed architecture",
    report.technicalHandoff.recommendation,
    markdownSection("5. Recommendation evidence", report.executiveSummary.traceability.map((trace) => `${trace.source}: ${trace.label} — ${trace.detail}`)),
    markdownSection("6. Assumptions and open questions", report.assumptionsAndQuestions),
    markdownSection("7. Failure or diagnostic findings", report.executiveSummary.validationResult ? [report.executiveSummary.validationResult] : ["No completed diagnostic validation recorded."]),
    markdownSection("8. Mitigations", report.executiveSummary.selectedMitigation ? [report.executiveSummary.selectedMitigation] : ["No mitigation selected."]),
    "## 9. Proof-of-concept plan",
    report.pocPlan.markdown.replace(/^# Proof-of-Concept Plan\s*/m, ""),
    markdownSection("10. Decisions", report.decisions.map((decision) => `${decision.decision} — ${decision.status}; ${decision.rationale}`)),
    markdownSection("11. Actions and owners", report.actions.map((action) => `${action.action} — ${action.owner}, ${action.timing}, ${action.status}`)),
    markdownSection("12. Risks", report.risks),
    "## 13. Final recommendation",
    report.executiveSummary.recommendedDirection,
    markdownSection("14. Appendix — architecture details", report.technicalHandoff.items.map((item) => `${item.item}: ${item.value} [${item.status}]`)),
    "## 15. Synthetic-data disclaimer",
    report.disclaimer,
  ].join("\n\n");
}

export function sessionReportHtml(report: SessionReportModel) {
  const markdown = sessionReportMarkdown(report);
  const sections = markdown.split(/\n(?=##? )/).map((block) => {
    const lines = block.split("\n").filter(Boolean);
    const heading = lines.shift() ?? "";
    const level = heading.startsWith("## ") ? 2 : 1;
    const title = heading.replace(/^#+\s*/, "");
    const body = lines.map((line) => line.startsWith("- ") ? `<li>${escapeHtml(line.slice(2))}</li>` : `<p>${escapeHtml(line.replace(/\*\*/g, ""))}</p>`).join("");
    return `<section><h${level}>${escapeHtml(title)}</h${level}>${body.includes("<li>") ? `<ul>${body}</ul>` : body}</section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.executiveSummary.fictionalCustomer)} — Architecture Studio report</title><style>${reportCss()}</style></head><body><main>${sections}</main></body></html>`;
}

export function safeFileStem(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "architecture-studio"; }

function stripOperatorNotes(session: PublicStudioSession) {
  session.presenterNotes = [];
  session.architectureSimulation.revisions = session.architectureSimulation.revisions.map((revision) => ({ ...revision, before: stripNoteObject(revision.before), after: stripNoteObject(revision.after) }));
  session.architectureSimulation.diagnosticSteps = session.architectureSimulation.diagnosticSteps.map((step) => ({ ...step, notes: "" }));
  session.architectureSimulation.mitigationDecisions = session.architectureSimulation.mitigationDecisions.map((decision) => ({ ...decision, operatorNote: "" }));
  session.handoffState.rehearsal = { ...session.handoffState.rehearsal, scores: session.handoffState.rehearsal.scores.map((score) => ({ ...score, notes: "" })), reflection: { strongestMoment: "", unclearMoment: "", earlierQuestion: "", unnecessaryDetail: "", missingEvidence: "", nextFocus: "" } };
}

function stripNoteObject<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.operatorNotes;
  return copy as T;
}

function validHandoffState(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!["executive", "technical", "customer-success"].includes(String(value.audience)) || !Array.isArray(value.questionClosures) || value.questionClosures.length > 100 || !Array.isArray(value.manualDecisions) || value.manualDecisions.length > 100 || !isRecord(value.decisionOverrides) || !Array.isArray(value.manualActions) || value.manualActions.length > 120 || !isRecord(value.actionOverrides) || !Array.isArray(value.acceptanceCriteriaOverrides) || value.acceptanceCriteriaOverrides.length > 80) return false;
  return isRecord(value.rehearsal) && Array.isArray(value.rehearsal.scores);
}

function hasForbiddenKey(value: unknown, depth: number): boolean {
  if (depth > 12 || !value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, depth + 1));
  return Object.entries(value).some(([key, nested]) => /(^|_)(api_?key|access_?token|refresh_?token|presenter_?token|participant_?token|cookie|private_?key|secret)(_|$)/i.test(key) || hasForbiddenKey(nested, depth + 1));
}

function plainJson(value: unknown, depth: number): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return value.length <= 10_000;
  if (Array.isArray(value)) return value.length <= 800 && value.every((item) => plainJson(item, depth + 1));
  return isRecord(value) && Object.keys(value).length <= 300 && Object.values(value).every((item) => plainJson(item, depth + 1));
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isShortString(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function csvCell(value: string) { return `"${value.replaceAll("\"", "\"\"")}"`; }
function markdownSection(title: string, items: string[]) { return `## ${title}\n\n${items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded"}`; }
function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function reportCss() { return `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f7f8;color:#12202a;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:980px;margin:auto;background:#fff;padding:52px 64px}h1{font-size:30px;line-height:1.15;margin:0 0 28px;border-bottom:4px solid #13e0d0;padding-bottom:18px}h2{font-size:19px;margin:30px 0 10px;color:#0b5360;break-after:avoid}p{margin:8px 0}ul{padding-left:22px}li{margin:6px 0}section{break-inside:avoid}@media(max-width:700px){main{padding:28px 20px}h1{font-size:24px}}@media print{body{background:#fff}main{max-width:none;padding:0}section{break-inside:auto}h2{break-after:avoid}}`; }

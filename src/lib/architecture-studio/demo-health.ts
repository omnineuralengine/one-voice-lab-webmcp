import { FAILURE_SCENARIOS, getMeridianDiagnosticPreset } from "@/data/architecture-studio-failures";
import { getScenarioPreset } from "@/data/architecture-studio-scenarios";
import { buildGeneratedCanvasSnapshot } from "@/lib/architecture-studio/architecture-workspace";
import { buildPortableSessionExport, validatePortableSessionExport } from "@/lib/architecture-studio/handoff-exports";
import type { PublicStudioSession, StudioSession } from "@/types/architecture-studio";
import type { DemoHealthCheck, DemoHealthModel } from "@/types/architecture-studio-handoff";

export function evaluateDemoHealth(session: StudioSession | PublicStudioSession, localPersistenceReady: boolean): DemoHealthModel {
  const checks: DemoHealthCheck[] = [];
  const add = (check: DemoHealthCheck) => checks.push(check);
  const validSession = session.status === "active" && new Date(session.expiresAt).getTime() > Date.now() && Boolean(session.code && session.answers);
  add({ id: "session", label: "Session state", status: validSession ? "ready" : "blocked", detail: validSession ? "Active temporary session is structurally ready." : "Session is invalid, deleted, or expired." });
  const scenarioReady = session.scenarioId === "custom" || Boolean(getScenarioPreset(session.scenarioId));
  add({ id: "scenario", label: "Scenario availability", status: scenarioReady ? "ready" : "blocked", detail: scenarioReady ? `${session.scenarioName} is available.` : "The selected preset is not installed." });
  const architecture = buildGeneratedCanvasSnapshot(session);
  add({ id: "architecture", label: "Architecture render", status: architecture.nodes.length > 2 && architecture.connections.length > 0 ? "ready" : "blocked", detail: `${architecture.nodes.length} generated modules and ${architecture.connections.length} connections are renderable.` });
  const preset = getMeridianDiagnosticPreset(session.architectureSimulation?.guidedDemo.presetId);
  add({ id: "simulation", label: "Simulation readiness", status: FAILURE_SCENARIOS.length >= 40 ? "ready" : "warning", detail: `${FAILURE_SCENARIOS.length} deterministic failure scenarios available${preset ? `; ${preset.title} selected` : ""}.` });
  const exported = buildPortableSessionExport(session, false);
  add({ id: "export", label: "Export availability", status: validatePortableSessionExport(exported) ? "ready" : "blocked", detail: "Validated synthetic session export can be generated without credentials." });
  add({ id: "persistence", label: "Local persistence", status: localPersistenceReady ? "ready" : session.realtimeMode === "supabase" ? "warning" : "blocked", detail: localPersistenceReady ? "Browser storage is writable for refresh recovery." : "Browser storage write/read check failed; keep the current tab open." });
  const hidden = !session.architectureSimulation?.operatorAidsVisible && !session.handoffState?.includeOperatorNotesInExport;
  add({ id: "hidden-notes", label: "Hidden-notes state", status: hidden ? "ready" : "warning", detail: hidden ? "Operator aids are hidden and note export is off." : "Hide operator aids or disable note export before screen sharing." });
  const status = checks.some((check) => check.status === "blocked") ? "blocked" : checks.some((check) => check.status === "warning") ? "warning" : "ready";
  return { status, checks };
}

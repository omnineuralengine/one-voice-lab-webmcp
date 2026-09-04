type StudioLogEvent =
  | "session_creation_failure"
  | "participant_connection_failure"
  | "realtime_reconnection"
  | "rule_engine_error"
  | "summary_generation_error"
  | "lab_navigation_failure";

export function logStudioEvent(event: StudioLogEvent, detail: { code?: string; reason?: string; mode?: string } = {}) {
  const safeDetail = {
    code: detail.code?.replace(/[^A-Z2-9]/g, "").slice(0, 6),
    reason: detail.reason?.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64),
    mode: detail.mode?.replace(/[^a-z-]/gi, "").slice(0, 24),
  };
  console.info(JSON.stringify({ scope: "architecture-studio", event, at: new Date().toISOString(), ...safeDetail }));
}

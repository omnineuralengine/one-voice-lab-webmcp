import { POCKET_TARGET_IDS } from "@/data/pocket-deepgram";
import type { PocketActionKind, PocketMode, PocketPreferences, PocketRecentAction, PocketStoredState, PocketTargetId } from "@/types/pocket-deepgram";

export const POCKET_STORAGE_KEY = "deepgram-pocket:shell:v1";
export const DEFAULT_POCKET_PREFERENCES: PocketPreferences = { schemaVersion: 1, mode: "collapsed", docked: false, demoMode: true };

const MODES = new Set<PocketMode>(["collapsed", "compact", "expanded"]);
const BILLABLE_ACTIONS = [
  /^transcribe( audio| url| file)?$/i, /run (live )?(request|transcription|experiment)/i, /generate (speech|audio)/i,
  /preview approved voice/i, /start (live transcription|voice agent|realtime|streaming)/i, /speak and watch/i,
];
const DESTRUCTIVE_ACTIONS = [
  /^delete( now| session)?$/i, /^clear (data|history|session|recent)/i, /^reset (demo|session|scenario|state)/i,
  /^remove (session|recording|history)/i, /^discard /i,
];

export function sanitizePocketStoredState(value: unknown): PocketStoredState {
  if (!isRecord(value)) return { preferences: { ...DEFAULT_POCKET_PREFERENCES }, recentActions: [] };
  const preferences = sanitizePreferences(value.preferences);
  const recentActions = Array.isArray(value.recentActions)
    ? value.recentActions.map(sanitizeRecentAction).filter((item): item is PocketRecentAction => Boolean(item)).slice(0, 8)
    : [];
  return { preferences, recentActions: dedupeRecentActions(recentActions) };
}

export function readPocketStoredState(storage: Pick<Storage, "getItem">): PocketStoredState {
  try { return sanitizePocketStoredState(JSON.parse(storage.getItem(POCKET_STORAGE_KEY) ?? "null") as unknown); }
  catch { return { preferences: { ...DEFAULT_POCKET_PREFERENCES }, recentActions: [] }; }
}

export function writePocketStoredState(storage: Pick<Storage, "setItem">, state: PocketStoredState) {
  const safe = sanitizePocketStoredState(state);
  storage.setItem(POCKET_STORAGE_KEY, JSON.stringify(safe));
}

export function addPocketRecentAction(actions: PocketRecentAction[], targetId: PocketTargetId, openedAt = new Date().toISOString()) {
  return dedupeRecentActions([{ targetId, openedAt }, ...actions]).slice(0, 8);
}

export function classifyPocketAction(label: string, explicit?: string): PocketActionKind | null {
  if (explicit === "billable" || explicit === "destructive" || explicit === "administrative") return explicit;
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (BILLABLE_ACTIONS.some((pattern) => pattern.test(normalized))) return "billable";
  if (DESTRUCTIVE_ACTIONS.some((pattern) => pattern.test(normalized))) return "destructive";
  return null;
}

export function safePocketActionLabel(element: HTMLElement) {
  return element.getAttribute("aria-label")?.trim() || element.getAttribute("title")?.trim() || element.textContent?.replace(/\s+/g, " ").trim() || "this action";
}

function sanitizePreferences(value: unknown): PocketPreferences {
  if (!isRecord(value)) return { ...DEFAULT_POCKET_PREFERENCES };
  return {
    schemaVersion: 1,
    mode: typeof value.mode === "string" && MODES.has(value.mode as PocketMode) ? value.mode as PocketMode : "collapsed",
    docked: value.docked === true,
    demoMode: value.demoMode !== false,
  };
}

function sanitizeRecentAction(value: unknown): PocketRecentAction | null {
  if (!isRecord(value) || typeof value.targetId !== "string" || !POCKET_TARGET_IDS.has(value.targetId as PocketTargetId) || typeof value.openedAt !== "string") return null;
  const time = Date.parse(value.openedAt);
  if (!Number.isFinite(time)) return null;
  return { targetId: value.targetId as PocketTargetId, openedAt: new Date(time).toISOString() };
}

function dedupeRecentActions(actions: PocketRecentAction[]) {
  const seen = new Set<PocketTargetId>();
  return actions.filter((action) => { if (seen.has(action.targetId)) return false; seen.add(action.targetId); return true; });
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

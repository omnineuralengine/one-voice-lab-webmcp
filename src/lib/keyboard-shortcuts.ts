export const SHORTCUT_SEQUENCE_TIMEOUT_MS = 900;

export type ShortcutCategory = "Navigation" | "Session controls" | "Inspection" | "General";
export type ShortcutScope = "global" | "page-specific";
export type ShortcutCommandId =
  | "open_command_palette"
  | "go_home"
  | "go_deepgram"
  | "go_simulations"
  | "go_build"
  | "go_learn"
  | "go_api_studio"
  | "go_voice_agent"
  | "go_observatory"
  | "go_flux_observatory"
  | "go_audio_signal_lab"
  | "go_language_explorer"
  | "go_questline"
  | "go_code_lab"
  | "run_primary"
  | "stop_session"
  | "toggle_focused_audio"
  | "reset_current"
  | "open_timeline"
  | "open_raw_events"
  | "copy_diagnostic"
  | "focus_search"
  | "open_shortcut_help"
  | "close_topmost"
  | "previous_tab"
  | "next_tab"
  | "start_guided_tour";

export type ShortcutDefinition = {
  id: ShortcutCommandId;
  keyCombination: string | null;
  label: string;
  category: ShortcutCategory;
  target: string;
  availability: string;
  scope: ShortcutScope;
  disabledWhileTyping: boolean;
  platformDisplay: { mac: string; windowsLinux: string } | null;
  showInPalette: boolean;
};

export const SHORTCUT_REGISTRY: readonly ShortcutDefinition[] = [
  shortcut("open_command_palette", "Mod+K", "Open command palette", "General", "command palette", "Application shell", "global", true, "⌘ K", "Ctrl K", false),
  shortcut("go_home", "H", "Go to Home", "Navigation", "overview", "Application shell", "global", true, "H", "H", true),
  shortcut("go_deepgram", "D", "Go to Deepgram", "Navigation", "/providers/deepgram", "When no visible diagnostic action is available", "global", true, "D", "D", true),
  shortcut("go_simulations", "S", "Go to Simulation Lab", "Navigation", "/simulation-lab", "Application shell", "global", true, "S", "S", true),
  shortcut("go_build", "B", "Go to Build", "Navigation", "/build", "Application shell", "global", true, "B", "B", true),
  shortcut("go_learn", "L", "Go to Learn", "Navigation", "/learn", "Application shell", "global", true, "L", "L", true),
  sequence("go_api_studio", "G then A", "Go to API Studio", "api-studio"),
  sequence("go_voice_agent", "G then V", "Go to Voice Agent", "voice-agent-converse"),
  sequence("go_observatory", "G then O", "Go to Live Observatory", "live-observatory"),
  { id: "go_flux_observatory", keyCombination: null, label: "Open Flux Conversation Observatory", category: "Navigation", target: "/flux-observatory", availability: "Application shell", scope: "global", disabledWhileTyping: true, platformDisplay: null, showInPalette: true },
  sequence("go_audio_signal_lab", "G then S", "Go to Audio Signal Lab", "audio-signal-lab"),
  sequence("go_language_explorer", "G then L", "Go to Language Explorer", "language-explorer"),
  sequence("go_questline", "G then Q", "Go to Applied Engineering Questline", "applied-engineering-questline"),
  sequence("go_code_lab", "G then C", "Go to Code Lab", "code-lab"),
  shortcut("run_primary", "Mod+Enter", "Run current request or start current experience", "Session controls", "visible enabled primary action", "A current Run or Start action is visible and enabled", "page-specific", true, "⌘ Enter", "Ctrl Enter", true),
  shortcut("stop_session", "Shift+Escape", "Stop current session", "Session controls", "visible enabled Stop action", "An active realtime or capture session exists", "page-specific", true, "⇧ Esc", "Shift Esc", true),
  shortcut("toggle_focused_audio", "Space", "Play or pause focused audio", "Session controls", "focused native audio player", "A native audio control has focus; browser behavior is preserved", "page-specific", false, "Space", "Space", false),
  shortcut("reset_current", "R", "Reset current module", "Session controls", "visible enabled reset action", "No realtime session is active", "page-specific", true, "R", "R", true),
  shortcut("open_timeline", "E", "Open Timeline or Events", "Inspection", "visible Timeline tab", "The current module exposes a Timeline or Events view", "page-specific", true, "E", "E", true),
  shortcut("open_raw_events", "Shift+E", "Open Raw Events", "Inspection", "visible Raw Events tab", "The current module exposes sanitized raw events", "page-specific", true, "⇧ E", "Shift E", true),
  shortcut("copy_diagnostic", "D", "Copy sanitized diagnostic summary", "Inspection", "visible diagnostic-copy action", "A sanitized diagnostic summary is available", "page-specific", true, "D", "D", true),
  shortcut("focus_search", "/", "Focus current search or filter", "Inspection", "current module search/filter", "The current module exposes a search or filter field", "page-specific", true, "/", "/", true),
  shortcut("open_shortcut_help", "?", "Open keyboard shortcuts", "General", "shortcut help dialog", "Application shell", "global", true, "?", "?", true),
  shortcut("close_topmost", "Escape", "Close topmost overlay", "General", "topmost modal, drawer, popover, or command palette", "An overlay is open", "global", false, "Esc", "Esc", false),
  shortcut("previous_tab", "[", "Previous adjacent tab", "General", "focused tablist", "Keyboard focus is inside a tablist", "page-specific", false, "[", "[", false),
  shortcut("next_tab", "]", "Next adjacent tab", "General", "focused tablist", "Keyboard focus is inside a tablist", "page-specific", false, "]", "]", false),
  { id: "start_guided_tour", keyCombination: null, label: "Start Guided Tour", category: "General", target: "overview guidance", availability: "Application shell", scope: "global", disabledWhileTyping: true, platformDisplay: null, showInPalette: true },
] as const;

const GO_SEQUENCES: Record<string, ShortcutCommandId> = {
  h: "go_home",
  a: "go_api_studio",
  v: "go_voice_agent",
  o: "go_observatory",
  s: "go_audio_signal_lab",
  l: "go_language_explorer",
  q: "go_questline",
  c: "go_code_lab",
};

export function commandForGoSequence(key: string) {
  return GO_SEQUENCES[key.toLowerCase()] ?? null;
}

export function shortcutById(id: ShortcutCommandId) {
  return SHORTCUT_REGISTRY.find((shortcut) => shortcut.id === id)!;
}

export function shortcutDisplay(id: ShortcutCommandId, platform: "mac" | "windows-linux") {
  const display = shortcutById(id).platformDisplay;
  return display ? (platform === "mac" ? display.mac : display.windowsLinux) : "";
}

export function detectShortcutPlatform(userAgent = ""): "mac" | "windows-linux" {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent) ? "mac" : "windows-linux";
}

export function isTextEditingSurface(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']")) return true;
  return Boolean(target.closest(".monaco-editor, [data-monaco-editor], [data-code-editor], [data-command-palette-search]"));
}

export function fuzzyCommandScore(label: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  const haystack = label.toLowerCase();
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle);
  let cursor = 0;
  let score = 0;
  for (const character of needle) {
    const index = haystack.indexOf(character, cursor);
    if (index < 0) return 0;
    score += index === cursor ? 4 : 1;
    cursor = index + 1;
  }
  return score;
}

function shortcut(
  id: ShortcutCommandId,
  keyCombination: string,
  label: string,
  category: ShortcutCategory,
  target: string,
  availability: string,
  scope: ShortcutScope,
  disabledWhileTyping: boolean,
  mac: string,
  windowsLinux: string,
  showInPalette: boolean,
): ShortcutDefinition {
  return { id, keyCombination, label, category, target, availability, scope, disabledWhileTyping, platformDisplay: { mac, windowsLinux }, showInPalette };
}

function sequence(id: ShortcutCommandId, keyCombination: string, label: string, target: string): ShortcutDefinition {
  return shortcut(id, keyCombination, label, "Navigation", target, "Application shell", "global", true, keyCombination, keyCombination, true);
}

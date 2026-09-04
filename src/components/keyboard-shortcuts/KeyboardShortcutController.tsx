"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import {
  SHORTCUT_REGISTRY,
  SHORTCUT_SEQUENCE_TIMEOUT_MS,
  commandForGoSequence,
  detectShortcutPlatform,
  fuzzyCommandScore,
  isTextEditingSurface,
  shortcutById,
  shortcutDisplay,
  type ShortcutCategory,
  type ShortcutCommandId,
} from "@/lib/keyboard-shortcuts";

export type ShortcutRuntimeAction = {
  execute: () => void;
  enabled?: boolean;
  disabledReason?: string;
  label?: string;
};

type RuntimeActions = Partial<Record<ShortcutCommandId, ShortcutRuntimeAction>>;
type Overlay = "palette" | "help" | "tour" | null;
type PaletteCommand = {
  id: ShortcutCommandId;
  label: string;
  shortcut: string;
  category: ShortcutCategory;
  enabled: boolean;
  disabledReason?: string;
};

export function useKeyboardShortcutController(actions: RuntimeActions) {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [query, setQuery] = useState("");
  const [goSequenceActive, setGoSequenceActive] = useState(false);
  const actionsRef = useRef(actions);
  const overlayRef = useRef<Overlay>(overlay);
  const invokerRef = useRef<HTMLElement | null>(null);
  const sequenceTimerRef = useRef<number | null>(null);
  const commandLockRef = useRef<{ id: ShortcutCommandId; until: number } | null>(null);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const rememberInvoker = useCallback((invoker?: HTMLElement | null) => {
    invokerRef.current = invoker ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }, []);

  const closeOverlay = useCallback(() => {
    const invoker = invokerRef.current;
    overlayRef.current = null;
    setOverlay(null);
    setQuery("");
    window.setTimeout(() => invoker?.focus(), 0);
  }, []);

  const openPalette = useCallback((invoker?: HTMLElement | null) => {
    rememberInvoker(invoker);
    overlayRef.current = "palette";
    setOverlay("palette");
  }, [rememberInvoker]);

  const openHelp = useCallback((invoker?: HTMLElement | null) => {
    if (!overlayRef.current) rememberInvoker(invoker);
    overlayRef.current = "help";
    setOverlay("help");
  }, [rememberInvoker]);

  const clearGoSequence = useCallback(() => {
    if (sequenceTimerRef.current !== null) window.clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = null;
    setGoSequenceActive(false);
  }, []);

  const executeCommand = useCallback((id: ShortcutCommandId, source: "keyboard" | "palette" = "keyboard") => {
    const now = Date.now();
    if ((id === "run_primary" || id === "stop_session") && commandLockRef.current?.id === id && commandLockRef.current.until > now) return false;

    if (id === "open_command_palette") { openPalette(); return true; }
    if (id === "open_shortcut_help") { openHelp(); return true; }

    const resolved = resolveAction(id, actionsRef.current);
    if (!resolved || !resolved.enabled) return false;
    if (id === "run_primary" || id === "stop_session") commandLockRef.current = { id, until: now + 750 };
    resolved.execute();

    if (id === "start_guided_tour") {
      overlayRef.current = "tour";
      setOverlay("tour");
      return true;
    }
    if (source === "palette") closeOverlay();
    return true;
  }, [closeOverlay, openHelp, openPalette]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;

      if (event.key === "Escape" && !event.shiftKey) {
        if (overlayRef.current) {
          event.preventDefault();
          closeOverlay();
          return;
        }
        const dismiss = findTopmostDismissControl();
        if (dismiss) {
          event.preventDefault();
          dismiss.click();
        }
        return;
      }

      if (overlayRef.current || isTextEditingSurface(event.target)) return;
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === "k") {
        event.preventDefault();
        openPalette();
        return;
      }

      if (goSequenceActive) {
        event.preventDefault();
        const command = commandForGoSequence(key);
        clearGoSequence();
        if (command) executeCommand(command);
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "g") {
        event.preventDefault();
        if (event.repeat) return;
        setGoSequenceActive(true);
        sequenceTimerRef.current = window.setTimeout(clearGoSequence, SHORTCUT_SEQUENCE_TIMEOUT_MS);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) executeCommand("run_primary");
        return;
      }
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && event.key === "Escape") {
        event.preventDefault();
        if (!event.repeat) executeCommand("stop_session");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && event.shiftKey && key === "e") {
        event.preventDefault();
        executeCommand("open_raw_events");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "e") {
        event.preventDefault();
        executeCommand("open_timeline");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "d") {
        event.preventDefault();
        if (!executeCommand("copy_diagnostic")) executeCommand("go_deepgram");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "h") {
        event.preventDefault();
        executeCommand("go_home");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "s") {
        event.preventDefault();
        executeCommand("go_simulations");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "b") {
        event.preventDefault();
        executeCommand("go_build");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "l") {
        event.preventDefault();
        executeCommand("go_learn");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && key === "r") {
        event.preventDefault();
        executeCommand("reset_current");
        return;
      }
      if (!event.ctrlKey && !event.metaKey && event.key === "/") {
        const search = findContextElement("focus_search");
        if (search instanceof HTMLElement) {
          event.preventDefault();
          search.focus();
        }
        return;
      }
      if (!event.ctrlKey && !event.metaKey && (event.key === "?" || (event.shiftKey && (event.key === "/" || event.code === "Slash")))) {
        event.preventDefault();
        openHelp();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "[" || event.key === "]")) {
        moveFocusedTab(event.key === "]" ? 1 : -1, event);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearGoSequence, closeOverlay, executeCommand, goSequenceActive, openHelp, openPalette]);

  useEffect(() => () => {
    if (sequenceTimerRef.current !== null) window.clearTimeout(sequenceTimerRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.keyboardShortcutsReady = "true";
    return () => {
      delete document.documentElement.dataset.keyboardShortcutsReady;
    };
  }, []);

  const platform = useShortcutPlatform();
  const paletteCommands = overlay === "palette" && typeof document !== "undefined" ? buildPaletteCommands(actions, platform) : [];

  return {
    openPalette,
    openHelp,
    commandPaletteOpen: overlay === "palette",
    goSequenceIndicator: goSequenceActive ? "Go to…" : null,
    shortcutLayer: (
      <>
        {overlay === "palette" ? <CommandPalette commands={paletteCommands} query={query} platform={platform} onQueryChange={setQuery} onExecute={(id) => executeCommand(id, "palette")} onClose={closeOverlay} /> : null}
        {overlay === "help" ? <ShortcutHelpDialog platform={platform} onClose={closeOverlay} /> : null}
        {overlay === "tour" ? <GuidedTourDialog onBegin={() => { actionsRef.current.go_home?.execute(); closeOverlay(); }} onOpenLanguageWorkbench={() => { document.querySelector<HTMLElement>('[data-guided-tour-target="language-workbench"]')?.click(); closeOverlay(); }} onOpenFamiliarCare={() => { document.querySelector<HTMLElement>('[data-guided-tour-target="familiar-care"]')?.click(); closeOverlay(); }} onOpenRedactionLab={() => { document.querySelector<HTMLElement>('[data-guided-tour-target="redaction-lab"]')?.click(); closeOverlay(); }} onClose={closeOverlay} /> : null}
      </>
    ),
  };
}

function CommandPalette({ commands, query, platform, onQueryChange, onExecute, onClose }: { commands: PaletteCommand[]; query: string; platform: "mac" | "windows-linux"; onQueryChange: (value: string) => void; onExecute: (id: ShortcutCommandId) => void; onClose: () => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const filtered = commands
    .map((command) => ({ command, score: fuzzyCommandScore(`${command.label} ${command.category}`, query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.command);
  const safeIndex = filtered.length ? Math.min(selectedIndex, filtered.length - 1) : 0;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!filtered.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSelectedIndex((safeIndex + direction + filtered.length) % filtered.length);
    } else if (event.key === "Enter" && filtered[safeIndex]) {
      event.preventDefault();
      if (filtered[safeIndex].enabled) onExecute(filtered[safeIndex].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      trapFocus(event, dialogRef.current);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pt-20 backdrop-blur-sm" onMouseDown={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-2xl overflow-hidden rounded-xl border border-cyan-200/25 bg-[#071016] shadow-[0_30px_120px_rgba(0,0,0,.7)]" onMouseDown={(event) => event.stopPropagation()} onKeyDown={handleKeyDown} data-testid="command-palette">
        <div className="flex items-center border-b border-white/10 px-4">
          <span aria-hidden="true" className="text-cyan-200">⌘</span>
          <input autoFocus value={query} onChange={(event) => { onQueryChange(event.target.value); setSelectedIndex(0); }} placeholder="Search commands…" aria-label="Search commands" role="combobox" aria-controls="command-palette-results" aria-expanded="true" data-command-palette-search className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-600" />
          <kbd className="rounded border border-white/10 px-1.5 py-1 font-mono text-[9px] text-slate-500">Esc</kbd>
        </div>
        <div id="command-palette-results" role="listbox" aria-label="Available commands" className="max-h-[26rem] overflow-y-auto p-2">
          {filtered.length ? filtered.map((command, index) => (
            <button key={command.id} type="button" role="option" aria-selected={index === safeIndex} disabled={!command.enabled} onMouseMove={() => setSelectedIndex(index)} onClick={() => onExecute(command.id)} className={`flex min-h-12 w-full items-center justify-between gap-4 rounded-lg px-3 text-left transition ${index === safeIndex ? "bg-cyan-200/10 text-white" : "text-slate-300 hover:bg-white/[.04]"} disabled:cursor-not-allowed disabled:opacity-50`}>
              <span><span className="block text-sm font-medium">{command.label}</span><span className="mt-0.5 block text-[10px] text-slate-600">{command.enabled ? command.category : command.disabledReason}</span></span>
              {command.shortcut ? <kbd className="shrink-0 rounded border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] text-slate-400">{command.shortcut}</kbd> : null}
            </button>
          )) : <p className="p-6 text-center text-sm text-slate-500">No matching commands.</p>}
        </div>
        <p className="border-t border-white/10 px-4 py-2 text-[9px] text-slate-600">↑ ↓ select · Enter run · Esc close · {platform === "mac" ? "Cmd" : "Ctrl"}+K reopen</p>
      </div>
    </div>
  );
}

function ShortcutHelpDialog({ platform, onClose }: { platform: "mac" | "windows-linux"; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const categories: ShortcutCategory[] = ["Navigation", "Session controls", "Inspection", "General"];
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } else if (event.key === "Tab") trapFocus(event, dialogRef.current); }} className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-cyan-200/20 bg-[#071016] p-5 shadow-2xl" data-testid="shortcut-help-dialog">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-200/65">Desktop controls</p><h2 id="shortcut-help-title" className="mt-1 text-xl font-semibold text-white">Shortcuts &amp; keyboard companion</h2><p className="mt-1 text-xs text-slate-500">Labels use {platform === "mac" ? "Cmd on macOS" : "Ctrl on Windows and Linux"}. Shortcuts pause while you type.</p></div><button type="button" autoFocus onClick={onClose} className={dialogButton}>Close <kbd>Esc</kbd></button></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{categories.map((category) => <section key={category} className="rounded-lg border border-white/10 bg-black/20 p-3"><h3 className="text-xs font-semibold text-white">{category}</h3><dl className="mt-3 space-y-2">{SHORTCUT_REGISTRY.filter((item) => item.category === category && item.platformDisplay).map((item) => <div key={item.id} className="flex items-start justify-between gap-3 border-b border-white/[.06] pb-2 last:border-0"><div><dt className="text-[11px] text-slate-200">{item.label}</dt><dd className="mt-0.5 text-[9px] leading-4 text-slate-600">{item.availability}</dd></div><kbd className="shrink-0 rounded border border-white/10 bg-white/[.04] px-2 py-1 font-mono text-[9px] text-cyan-100">{shortcutDisplay(item.id, platform)}</kbd></div>)}</dl></section>)}</div>
      <p className="mt-4 rounded border border-amber-200/15 bg-amber-200/[.04] p-3 text-[10px] leading-5 text-amber-50">Global shortcuts do not run inside inputs, textareas, selects, contenteditable areas, Monaco, code editors, or command search. Space remains native and only controls audio when its player has focus. Browser Alt+Left and Alt+Right navigation is never overridden.</p>
    </section>
  </div>;
}

function GuidedTourDialog({ onBegin, onOpenLanguageWorkbench, onOpenFamiliarCare, onOpenRedactionLab, onClose }: { onBegin: () => void; onOpenLanguageWorkbench: () => void; onOpenFamiliarCare: () => void; onOpenRedactionLab: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="guided-tour-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } else if (event.key === "Tab") trapFocus(event, dialogRef.current); }} className="w-full max-w-2xl rounded-xl border border-violet-200/20 bg-[#071016] p-5 shadow-2xl"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-violet-200/65">Guided tour</p><h2 id="guided-tour-title" className="mt-2 text-xl font-semibold text-white">Follow the evidence path</h2><ol className="mt-4 space-y-2 text-sm text-slate-300"><li>1. Confirm the server-only connection boundary.</li><li>2. Run one prerecorded STT request.</li><li>3. Inspect Timeline and sanitized payload evidence.</li><li>4. In Language Explorer, search for Italian and inspect the exact Nova-3 configuration before a deliberate handoff.</li><li>5. In Redaction Lab, distinguish transcript redaction from audio governance, inspect Financial Contact Center coverage, run the synthetic fixture, step through placeholder transitions, and apply the policy without executing.</li><li>6. Explore Voice Agent lifecycle diagnostics without assuming live verification.</li><li>7. Visit Trusted Voice: Familiar Care to compare TTS content controls with STT transcript redaction.</li><li>8. Finish in Observatory and the Roadmap.</li></ol><p className="mt-4 rounded border border-violet-200/15 bg-violet-200/[.05] p-3 text-xs leading-5 text-violet-50">Tour handoffs prepopulate verified configuration only. They never copy, request microphone access, or execute a billable request automatically.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} className={dialogButton}>Cancel</button><button type="button" onClick={onOpenLanguageWorkbench} className={dialogButton}>Open Language Workbench stop</button><button type="button" onClick={onOpenRedactionLab} className={dialogButton}>Open Redaction Lab stop</button><button type="button" onClick={onOpenFamiliarCare} className={dialogButton}>Open Familiar Care stop</button><button type="button" autoFocus onClick={onBegin} className="rounded border border-cyan-200/35 bg-cyan-200 px-3 py-2 text-xs font-semibold text-slate-950">Begin at Home</button></div></section></div>;
}

function buildPaletteCommands(actions: RuntimeActions, platform: "mac" | "windows-linux") {
  return SHORTCUT_REGISTRY.filter((definition) => definition.showInPalette).flatMap<PaletteCommand>((definition) => {
    if (definition.id === "open_shortcut_help") return [{ id: definition.id, label: definition.label, shortcut: shortcutDisplay(definition.id, platform), category: definition.category, enabled: true }];
    const resolved = resolveAction(definition.id, actions);
    if (!resolved) return [];
    return [{ id: definition.id, label: resolved.label || definition.label, shortcut: shortcutDisplay(definition.id, platform), category: definition.category, enabled: resolved.enabled, disabledReason: resolved.disabledReason }];
  });
}

function resolveAction(id: ShortcutCommandId, actions: RuntimeActions): (ShortcutRuntimeAction & { enabled: boolean }) | null {
  const explicit = actions[id];
  if (explicit) return { ...explicit, enabled: explicit.enabled !== false };
  const element = findContextElement(id);
  if (!(element instanceof HTMLElement)) return null;
  const disabled = element instanceof HTMLButtonElement ? element.disabled : element.getAttribute("aria-disabled") === "true";
  return {
    execute: () => element.click(),
    enabled: !disabled,
    label: element.dataset.shortcutLabel,
    disabledReason: element.dataset.shortcutDisabledReason || (disabled ? "The visible action is currently disabled." : undefined),
  };
}

function findContextElement(id: ShortcutCommandId) {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-shortcut-command="${id}"]`)).find(isVisible) ?? null;
}

function findTopmostDismissControl() {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']")).filter(isVisible);
  const dialog = dialogs.at(-1);
  if (!dialog) return null;
  const explicit = dialog.querySelector<HTMLElement>("[data-shortcut-dismiss]");
  if (explicit) return explicit;
  return Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")).find((button) => /^(cancel|close|dismiss|keep current session)$/i.test(button.textContent?.trim() ?? "")) ?? null;
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
}

function moveFocusedTab(direction: -1 | 1, event: KeyboardEvent) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  const tablist = active.closest<HTMLElement>("[role='tablist']");
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>("[role='tab']:not(:disabled)")).filter(isVisible);
  const index = tabs.indexOf(active as HTMLButtonElement);
  if (index < 0 || !tabs.length) return;
  event.preventDefault();
  const next = tabs[(index + direction + tabs.length) % tabs.length];
  next.focus();
  next.click();
}

function trapFocus(event: ReactKeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")).filter(isVisible);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

const dialogButton = "rounded border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-200/25 focus-visible:outline-2 focus-visible:outline-cyan-200";

export function ShortcutHint({ command, children }: { command: ShortcutCommandId; children?: ReactNode }) {
  const platform = useShortcutPlatform();
  return <kbd className="ml-1.5 rounded border border-current/15 px-1.5 py-0.5 font-mono text-[8px] opacity-65" aria-label={`${shortcutById(command).label}: ${shortcutDisplay(command, platform)}`}>{children ?? shortcutDisplay(command, platform)}</kbd>;
}

function useShortcutPlatform() {
  return useSyncExternalStore(
    () => () => undefined,
    () => detectShortcutPlatform(navigator.userAgent),
    () => "windows-linux" as const,
  );
}

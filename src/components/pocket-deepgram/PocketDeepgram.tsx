"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { PocketApiLab } from "@/components/pocket-deepgram/PocketApiLab";
import { POCKET_TARGETS, getPocketTarget } from "@/data/pocket-deepgram";
import { usePocketDeepgram } from "@/hooks/use-pocket-deepgram";
import { isLiveSolutionStudioPath, SDK_DOCTOR_OPEN_EVENT, type SdkDoctorOpenEventDetail } from "@/lib/sdk-doctor-events";
import { classifyPocketAction, safePocketActionLabel } from "@/lib/pocket-deepgram";
import type { PocketActionKind, PocketConnectionState, PocketTarget } from "@/types/pocket-deepgram";

type SafetyPrompt = { kind: PocketActionKind; label: string; replay: () => void; returnFocus?: HTMLElement };

export function PocketDeepgram({ apiConfigured, pwaEnabled, openLabMode = false, openLabDeepgramEnabled = false }: { apiConfigured: boolean; pwaEnabled: boolean; openLabMode?: boolean; openLabDeepgramEnabled?: boolean }) {
  const pathname = usePathname();
  const pocket = usePocketDeepgram({ pwaEnabled });
  const [desktop, setDesktop] = useState(false);
  const [surface, setSurface] = useState<"launcher" | "api-field">("launcher");
  const [safetyPrompt, setSafetyPrompt] = useState<SafetyPrompt | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const safetyRef = useRef<HTMLDivElement>(null);
  const open = desktop && pocket.preferences.mode !== "collapsed";
  const docked = desktop && pocket.preferences.docked && pocket.preferences.mode === "compact";
  const demoModeEnabled = !openLabMode && pocket.preferences.demoMode;
  const providerReady = openLabMode ? openLabDeepgramEnabled : apiConfigured;

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    const timer = window.setTimeout(update, 0);
    query.addEventListener("change", update);
    return () => { window.clearTimeout(timer); query.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("pocket-shell-docked", docked);
    return () => document.body.classList.remove("pocket-shell-docked");
  }, [docked]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0);
    const lockScroll = !docked;
    if (lockScroll) document.body.classList.add("pocket-shell-open");
    return () => { window.clearTimeout(timer); document.body.classList.remove("pocket-shell-open"); };
  }, [docked, open]);

  useEffect(() => {
    if (!demoModeEnabled) return;
    const guard = (event: MouseEvent) => {
      const origin = event.target instanceof Element ? event.target : null;
      const element = origin?.closest<HTMLElement>("button, input[type='button'], input[type='submit'], [role='button']");
      if (!element || element.dataset.pocketGuard === "ignore" || element.hasAttribute("disabled")) return;
      if (element.dataset.pocketConfirmedOnce === "true") { delete element.dataset.pocketConfirmedOnce; return; }
      const explicit = element.dataset.pocketAction;
      if (element.closest("[data-pocket-shell]") && !explicit) return;
      const label = safePocketActionLabel(element);
      const kind = classifyPocketAction(label, explicit);
      if (!kind) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      setSafetyPrompt({ kind, label, returnFocus: element, replay: () => { if (!element.isConnected) return; element.dataset.pocketConfirmedOnce = "true"; element.click(); } });
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [demoModeEnabled]);

  const close = () => { pocket.setMode("collapsed"); window.setTimeout(() => triggerRef.current?.focus(), 0); };
  const requestSafety = (kind: PocketActionKind, label: string, replay: () => void) => {
    if (!demoModeEnabled) { replay(); return; }
    setSafetyPrompt({ kind, label, returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined, replay });
  };
  const dismissSafety = () => {
    const returnFocus = safetyPrompt?.returnFocus;
    setSafetyPrompt(null);
    window.setTimeout(() => returnFocus?.isConnected && returnFocus.focus(), 0);
  };
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab" || docked) return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
    if (!focusable?.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const onSafetyKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); dismissSafety(); return; }
    if (event.key !== "Tab") return;
    const focusable = safetyRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!focusable?.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const openSdkDoctor = () => {
    window.dispatchEvent(new CustomEvent<SdkDoctorOpenEventDetail>(SDK_DOCTOR_OPEN_EVENT, { detail: { source: "pocket" } }));
    if (!docked) pocket.setMode("collapsed");
  };

  return <div data-pocket-shell data-pocket-viewport={desktop ? "desktop" : "mobile"} className="pocket-deepgram no-print">
    {!open ? <button ref={triggerRef} type="button" className="pocket-trigger" aria-haspopup="dialog" aria-expanded="false" aria-busy={!pocket.storageReady} disabled={!pocket.storageReady} data-pocket-launcher={desktop ? "standalone" : "mobile-dock"} onClick={() => pocket.setMode("compact")}><PocketMark /><span>Pocket</span><span className={`pocket-trigger-dot ${pocket.online ? "is-online" : "is-offline"}`} aria-hidden="true" /></button> : null}
    {open && !docked ? <button type="button" className="pocket-backdrop" aria-label="Close Pocket Deepgram" data-pocket-guard="ignore" onClick={close} /> : null}
    {open ? <section ref={panelRef} tabIndex={-1} onKeyDown={onPanelKeyDown} role={docked ? "complementary" : "dialog"} aria-modal={docked ? undefined : true} aria-labelledby="pocket-title" data-pocket-layout={desktop ? "desktop-panel" : "mobile-sheet"} data-pocket-mode={pocket.preferences.mode} className={`pocket-panel ${pocket.preferences.mode === "expanded" ? "is-expanded" : "is-compact"} ${docked ? "is-docked" : ""}`}>
      <header className="pocket-header"><div className="pocket-brand"><PocketMark /><div><h2 id="pocket-title">Pocket Deepgram</h2><p>{surface === "api-field" ? "API field assistant" : "Call-side Learning Lab"}</p></div></div><div className="pocket-header-actions"><button type="button" className={`pocket-surface-button ${surface === "api-field" ? "is-active" : ""}`} data-pocket-guard="ignore" onClick={() => setSurface((current) => current === "api-field" ? "launcher" : "api-field")}>{surface === "api-field" ? "Launcher" : "API Field"}</button>{pocket.preferences.mode === "compact" ? <button type="button" className="pocket-icon-button" data-pocket-guard="ignore" onClick={() => pocket.setMode("expanded")} aria-label="Expand Pocket Deepgram"><ExpandIcon /></button> : <button type="button" className="pocket-icon-button" data-pocket-guard="ignore" onClick={() => pocket.setMode("compact")} aria-label="Compact Pocket Deepgram"><CompactIcon /></button>}<button type="button" className="pocket-icon-button" data-pocket-guard="ignore" onClick={close} aria-label="Collapse Pocket Deepgram"><CloseIcon /></button></div></header>
       {surface === "api-field" ? <div className="pocket-content pocket-api-content"><PocketApiLab online={pocket.online} apiConfigured={providerReady} expanded={pocket.preferences.mode === "expanded"} openLabMode={openLabMode} onExpand={() => pocket.setMode("expanded")} /></div> : <div className="pocket-content">
         <section aria-labelledby="pocket-status-title" className="pocket-status-section"><div className="pocket-section-heading"><div><p className="pocket-eyebrow">Ready state</p><h3 id="pocket-status-title">Before the customer joins</h3></div><span className={`pocket-demo-badge ${demoModeEnabled || openLabMode ? "is-safe" : ""}`}>{openLabMode ? "Open Lab" : demoModeEnabled ? "Demo Mode on" : "Demo Mode off"}</span></div><div className="pocket-status-grid" aria-live="polite"><Status label="Network" state={pocket.online ? "Online" : "Offline"} tone={pocket.online ? "good" : "bad"} /><Status label={openLabMode ? "Project" : "API"} state={providerReady ? (openLabMode ? "Shared live" : "Configured") : (openLabMode ? "Paused" : "Not configured")} tone={providerReady ? "good" : "neutral"} /><Status label="Deepgram" state={connectionLabel(pocket.connection)} tone={pocket.connection === "connected" ? "good" : pocket.connection === "unavailable" ? "bad" : "neutral"} /></div><button type="button" className="pocket-secondary-button pocket-full-button" data-pocket-action="billable" disabled={!pocket.online || pocket.connection === "checking" || !providerReady} onClick={() => void pocket.checkConnection()}>{pocket.connection === "checking" ? "Checking connection…" : providerReady ? "Check Deepgram connection" : "Live provider paused"}</button></section>
        <section aria-labelledby="pocket-launch-title" className="pocket-launch-section"><div className="pocket-section-heading"><div><p className="pocket-eyebrow">Fast launch</p><h3 id="pocket-launch-title">Choose the next move</h3></div><span className="pocket-route-label">{routeLabel(pathname)}</span></div>{isLiveSolutionStudioPath(pathname) ? <button type="button" className="pocket-secondary-button pocket-full-button" onClick={openSdkDoctor}>Deepgram SDK Doctor <span aria-hidden="true">🧪</span></button> : null}<Link href="/?module=lab-evolution" className="pocket-secondary-button pocket-full-button" data-pocket-guard="ignore" onClick={() => { if (!docked) pocket.setMode("collapsed"); }}>Open Lab Evolution</Link><nav aria-label="Pocket Deepgram quick launch" className="pocket-target-grid">{POCKET_TARGETS.map((target) => <PocketTargetLink key={target.id} target={target} expanded={pocket.preferences.mode === "expanded"} onOpen={() => { pocket.recordTarget(target.id); if (!docked) pocket.setMode("collapsed"); }} />)}</nav></section>
        <div className="pocket-lower-grid"><section aria-labelledby="pocket-recent-title" className="pocket-recent-section"><div className="pocket-section-heading"><div><p className="pocket-eyebrow">Local only</p><h3 id="pocket-recent-title">Recent sessions</h3></div>{pocket.recentActions.length ? <button type="button" className="pocket-text-button" data-pocket-action="destructive" onClick={pocket.clearRecent}>Clear recent</button> : null}</div>{pocket.recentActions.length ? <ol className="pocket-recent-list">{pocket.recentActions.map((action) => { const target = getPocketTarget(action.targetId); return target ? <li key={action.targetId}><Link href={target.href} onClick={() => pocket.recordTarget(target.id)}><span>{target.label}</span><time dateTime={action.openedAt}>{relativeTime(action.openedAt)}</time></Link></li> : null; })}</ol> : <p className="pocket-empty">Open a lab from Pocket. Only its known module ID and timestamp are saved—never transcripts or customer content.</p>}</section>
          <section aria-labelledby="pocket-preferences-title" className="pocket-preferences-section"><div className="pocket-section-heading"><div><p className="pocket-eyebrow">Private controls</p><h3 id="pocket-preferences-title">Pocket preferences</h3></div></div>{openLabMode ? <div className="pocket-toggle-row"><span><strong>Explicit actions</strong><small>Generate, Transcribe, Connect, or Start runs once from your click. Microphone permission and recording disclosure still apply.</small></span></div> : <label className="pocket-toggle-row"><span><strong>Demo Mode</strong><small>Confirm recognized billable or destructive actions.</small></span><input type="checkbox" checked={pocket.preferences.demoMode} onChange={(event) => event.target.checked ? pocket.setDemoMode(true) : requestSafety("destructive", "Disable Demo Mode", () => pocket.setDemoMode(false))} /></label>}{desktop && pocket.preferences.mode === "compact" ? <label className="pocket-toggle-row"><span><strong>Dock panel</strong><small>Reserve the right side of the laboratory.</small></span><input type="checkbox" checked={pocket.preferences.docked} onChange={(event) => pocket.setDocked(event.target.checked)} /></label> : null}<div className="pocket-install-row"><div><strong>{pocket.installed ? "Installed application" : "Install Pocket Deepgram"}</strong><small>{pocket.serviceWorkerReady ? "Offline shell ready" : pwaEnabled ? "Offline shell preparing" : "Offline shell activates in production"}</small></div>{pocket.installPrompt && !pocket.installed ? <button type="button" className="pocket-secondary-button" data-pocket-guard="ignore" onClick={() => void pocket.install()}>Install</button> : <span className="pocket-install-hint">{pocket.installed ? "Standalone" : "Browser menu"}</span>}</div></section></div>
        <footer className="pocket-footer"><span>Preferences and recent module IDs stay on this device.</span><span>No keys · no tokens · no transcripts</span></footer>
      </div>}
    </section> : null}
    {safetyPrompt ? <div ref={safetyRef} className="pocket-safety-layer" role="alertdialog" aria-modal="true" aria-labelledby="pocket-safety-title" aria-describedby="pocket-safety-detail" onKeyDown={onSafetyKeyDown}><div className="pocket-safety-card"><span className="pocket-warning-mark" aria-hidden="true">!</span><p className="pocket-eyebrow">Demo Mode checkpoint</p><h2 id="pocket-safety-title">Confirm {safetyPrompt.kind} action</h2><p id="pocket-safety-detail">“{safetyPrompt.label}” may {safetyPrompt.kind === "billable" ? "contact a live service or consume API credit" : safetyPrompt.kind === "administrative" ? "read or change protected account configuration" : "remove or reset local work"}. Continue only when this is intentional.</p><div><button type="button" className="pocket-secondary-button" autoFocus data-pocket-guard="ignore" onClick={dismissSafety}>Cancel</button><button type="button" className="pocket-danger-button" data-pocket-guard="ignore" onClick={() => { const replay = safetyPrompt.replay; setSafetyPrompt(null); window.setTimeout(replay, 0); }}>Confirm action</button></div></div></div> : null}
  </div>;
}

function PocketTargetLink({ target, expanded, onOpen }: { target: PocketTarget; expanded: boolean; onOpen: () => void }) { return <Link href={target.href} aria-label={target.label} className={`pocket-target ${expanded ? "is-roomy" : ""}`} onClick={onOpen}><span className={`pocket-target-mark is-${target.category}`}>{target.shortLabel}</span><span><strong>{target.label}</strong><small>{target.description}</small></span><span aria-hidden="true" className="pocket-target-arrow">→</span></Link>; }
function Status({ label, state, tone }: { label: string; state: string; tone: "good" | "neutral" | "bad" }) { return <div className={`pocket-status is-${tone}`}><span>{label}</span><strong><i aria-hidden="true" />{state}</strong></div>; }
function connectionLabel(value: PocketConnectionState) { return value === "checking" ? "Checking" : value === "connected" ? "Connected" : value === "unavailable" ? "Unavailable" : "Not checked"; }
function routeLabel(pathname: string) { if (isLiveSolutionStudioPath(pathname)) return "Live Session"; if (pathname.startsWith("/pre-sales-studio")) return "Pre-Sales"; if (pathname.startsWith("/architecture-studio")) return "Architecture"; if (pathname.startsWith("/flux-observatory")) return "Flux Observatory"; return "Learning Lab"; }
function relativeTime(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000)); if (minutes < 1) return "Just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`; }
function PocketMark() { return <span className="pocket-mark" aria-hidden="true"><span /><span /><span /></span>; }
function CloseIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>; }
function ExpandIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" /></svg>; }
function CompactIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4H4v4M12 4h4v4M8 16H4v-4M12 16h4v-4" /></svg>; }

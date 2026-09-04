"use client";

import { useEffect, useRef, useState } from "react";
import { ShortcutHint } from "@/components/keyboard-shortcuts/KeyboardShortcutController";

import {
  analyzeRealtimeFailure,
  createRealtimeDiagnosticExport,
  formatRealtimeClose,
  formatRealtimeState,
  hasRealtimeMilestone,
  isRealtimeMilestoneApplicable,
  realtimeFailureCount,
  realtimeMilestoneLabel,
  type RealtimeEventRecord,
  type RealtimeMilestone,
  type RealtimeSessionState,
} from "@/lib/api-studio/realtime-session";

export function RealtimeStatusStrip({ session, sticky = true, onCopyDiagnostic }: { session: RealtimeSessionState; sticky?: boolean; onCopyDiagnostic?: () => void }) {
  const { summary, protocol } = session;
  const current = summary.currentState === "idle"
    ? "Idle"
    : realtimeMilestoneLabel(protocol, summary.currentState);
  const values = [
    ["Current", current],
    ["Last successful state", summary.lastSuccessfulState ? realtimeMilestoneLabel(protocol, summary.lastSuccessfulState) : "None yet"],
    ["Token", hasRealtimeMilestone(session, "token_received") ? "Received" : hasRealtimeMilestone(session, "token_requested") ? "Requested" : "Not requested"],
    ["Socket", socketStatus(session)],
    ["Settings", categoryStatus(session, "settings_accepted", "Waiting", "Accepted")],
    ["Audio", audioStatus(session)],
    ["Transcript", categoryStatus(session, "first_transcript", "Waiting", "Received")],
    ["Playback", playbackStatus(session)],
  ];

  return (
    <section
      aria-label="Realtime session status"
      className={`${sticky ? "sticky top-0 z-30" : ""} rounded-lg border border-cyan-200/20 bg-slate-950/95 p-3 shadow-lg backdrop-blur`}
      data-testid="realtime-status-strip"
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {values.map(([label, value]) => (
          <StatusValue key={label} label={label} value={value} />
        ))}
        {summary.requestId ? <StatusValue label="Request ID" value={summary.requestId} mono /> : null}
        {summary.closeCode !== undefined ? <StatusValue label="Close code and reason" value={formatRealtimeClose(summary.closeCode, summary.closeReason)} wide /> : null}
      </div>
      {onCopyDiagnostic ? <div className="mt-2 flex justify-end"><button type="button" onClick={onCopyDiagnostic} data-shortcut-command="copy_diagnostic" data-shortcut-label="Copy sanitized diagnostic summary" className="rounded border border-cyan-200/20 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-100">Copy diagnostic summary<ShortcutHint command="copy_diagnostic" /></button></div> : null}
    </section>
  );
}

export function RealtimeFailureBanner({
  session,
  onOpenRawEvents,
}: {
  session: RealtimeSessionState;
  onOpenRawEvents: () => void;
}) {
  if (session.summary.currentState !== "failure" && realtimeFailureCount(session) === 0) return null;
  const analysis = analyzeRealtimeFailure(session);
  const browserLimited = session.summary.closeCode === 1006 || session.events.some((event) => event.source === "browser" && event.status === "failure");
  return (
    <section role="alert" className="rounded-lg border border-rose-300/40 bg-rose-300/[.09] p-3" data-testid="realtime-failure-banner">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-rose-100">Failure — {analysis.classification}</p>
          <p className="mt-1 text-sm text-white">{analysis.summary}</p>
        </div>
        <button type="button" onClick={onOpenRawEvents} data-shortcut-command="open_raw_events" data-shortcut-label="Open Raw Events" className="min-h-9 rounded-md border border-rose-200/35 px-3 text-xs font-semibold text-rose-50 outline-none focus-visible:ring-2 focus-visible:ring-rose-200" data-testid="open-raw-events">Open Raw Events<ShortcutHint command="open_raw_events" /></button>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <FailureValue label="Last successful state" value={formatRealtimeState(session.summary.lastSuccessfulState)} />
        <FailureValue label="Close" value={formatRealtimeClose(session.summary.closeCode, session.summary.closeReason)} />
        <FailureValue label="Close reason" value={session.summary.closeReason || (session.summary.closeCode !== undefined ? "No close reason provided by browser" : "Not closed")} />
        <FailureValue label="Likely failure stage" value={`${analysis.classification}: ${analysis.stage}`} />
        <FailureValue label="Timestamp" value={session.summary.lastEventTimestamp ?? "Unavailable"} />
        <FailureValue label="Request ID / dg-request-id" value={session.summary.requestId ?? "Unavailable"} />
        <FailureValue label="Next inspection action" value={analysis.nextStep} />
      </dl>
      {browserLimited ? <p className="mt-3 text-xs leading-5 text-amber-100">Browser limitation: a failed WebSocket handshake may expose only an error event and code 1006, not the response body or dg-error headers.</p> : null}
    </section>
  );
}

export function RealtimeTimeline({ session }: { session: RealtimeSessionState }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (followLatestRef.current) viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
  }, [session.events.length]);

  async function copy(label: string, value: unknown) {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopied(label);
  }

  if (!session.events.length) {
    return <EmptyRealtimeState />;
  }

  return (
    <section aria-label="Realtime timeline">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">Chronological order · newest event is highlighted</p>
        <button type="button" onClick={() => void copy("Copied diagnostic summary", createRealtimeDiagnosticExport(session))} data-shortcut-command="copy_diagnostic" data-shortcut-label="Copy sanitized diagnostic summary" className="rounded border border-cyan-200/25 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-100">Copy diagnostic summary<ShortcutHint command="copy_diagnostic" /></button>
      </div>
      {copied ? <p role="status" className="mb-2 text-[10px] text-emerald-200">{copied}</p> : null}
      <div
        ref={viewportRef}
        className="max-h-[34rem] space-y-2 overflow-y-auto pr-1"
        onScroll={(event) => {
          const node = event.currentTarget;
          followLatestRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
      >
        {session.events.map((event, index) => (
          <TimelineRecord
            key={event.id}
            event={event}
            newest={index === session.events.length - 1}
            onCopy={() => void copy("Copied raw event", event)}
          />
        ))}
      </div>
    </section>
  );
}

export function RealtimeRawEvents({ session }: { session: RealtimeSessionState }) {
  const failures = realtimeFailureCount(session);
  if (!session.events.length) return <EmptyRealtimeState />;
  return (
    <section aria-label="Sanitized realtime raw events">
      {failures ? <p role="alert" className="mb-3 rounded border border-rose-300/35 bg-rose-300/[.08] p-2 text-xs text-rose-100">{failures} failure event{failures === 1 ? "" : "s"}. All preceding sanitized client and protocol events are preserved below.</p> : null}
      <p className="mb-3 text-[10px] leading-4 text-slate-500">Credentials, temporary tokens, Authorization values, raw audio, and transcript text are excluded.</p>
      <pre className="max-h-[38rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-3 text-[10px] leading-5 text-slate-300">{JSON.stringify(session.events, null, 2)}</pre>
    </section>
  );
}

function TimelineRecord({ event, newest, onCopy }: { event: RealtimeEventRecord; newest: boolean; onCopy: () => void }) {
  const symbol = event.status === "failure" ? "✕" : event.status === "warning" ? "!" : event.status === "success" ? "✓" : "•";
  const border = event.status === "failure" ? "border-rose-300/45" : event.status === "warning" ? "border-amber-200/35" : event.status === "success" ? "border-emerald-300/25" : "border-white/10";
  return (
    <article className={`rounded-lg border ${border} ${newest ? "bg-white/[.065] ring-1 ring-cyan-200/20" : "bg-black/20"} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white"><span aria-hidden="true" className="mr-1.5">{symbol}</span>{event.label} <span className="font-normal text-slate-500">— {event.status}</span></p>
          <p className="mt-1 text-[10px] text-slate-500"><time>{event.timestamp}</time> · source: {event.source === "deepgram" ? "Deepgram" : event.source}</p>
        </div>
        <button type="button" onClick={onCopy} className="shrink-0 rounded border border-white/10 px-2 py-1 text-[9px] text-slate-300">Copy raw event</button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">{event.summary}</p>
      {event.requestId ? <p className="mt-1 break-all font-mono text-[10px] text-cyan-100">Request ID: {event.requestId}</p> : null}
      {event.closeCode !== undefined ? <p className="mt-1 text-[10px] text-amber-100">Close: {formatRealtimeClose(event.closeCode, event.closeReason)}</p> : null}
      {event.details ? <details className="mt-2"><summary className="cursor-pointer text-[10px] text-slate-400">Raw event details</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-[9px] text-slate-400">{JSON.stringify(event.details, null, 2)}</pre></details> : null}
    </article>
  );
}

function categoryStatus(session: RealtimeSessionState, milestone: RealtimeMilestone, waiting: string, complete: string) {
  if (!isRealtimeMilestoneApplicable(session.protocol, milestone)) return "Not applicable";
  return hasRealtimeMilestone(session, milestone) ? complete : waiting;
}

function socketStatus(session: RealtimeSessionState) {
  const state = session.summary.currentState;
  if (state === "failure") return "Failed";
  if (state === "socket_closed") return "Closed";
  if (state === "socket_closing" || state === "stop_requested") return "Closing";
  if (hasRealtimeMilestone(session, "socket_opened")) return "Open";
  if (state === "socket_opening") return "Opening";
  return "Not opened";
}

function audioStatus(session: RealtimeSessionState) {
  if (!isRealtimeMilestoneApplicable(session.protocol, "audio_started")) return "Not applicable";
  if (session.summary.microphoneActive) return "Active";
  if (hasRealtimeMilestone(session, "audio_started")) return session.protocol === "streaming_tts" ? "Received" : "Stopped";
  return "Not started";
}

function playbackStatus(session: RealtimeSessionState) {
  if (!isRealtimeMilestoneApplicable(session.protocol, "playback_started")) return "Not applicable";
  if (session.summary.playbackActive) return "Active";
  if (hasRealtimeMilestone(session, "playback_completed")) return "Completed";
  if (hasRealtimeMilestone(session, "playback_started")) return "Idle";
  return "Idle";
}

function StatusValue({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return <div className={`${wide ? "sm:col-span-2 xl:col-span-3" : ""} min-w-0 rounded border border-white/10 bg-black/20 px-2 py-1.5`}><p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className={`mt-0.5 break-words text-[11px] text-slate-100 ${mono ? "font-mono" : ""}`}>{value}</p></div>;
}

function FailureValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[9px] font-bold uppercase tracking-[.12em] text-rose-200/60">{label}</dt><dd className="mt-0.5 break-words text-rose-50">{value}</dd></div>;
}

function EmptyRealtimeState() {
  return <div className="rounded-lg border border-dashed border-white/15 bg-black/15 p-6 text-center"><p className="text-sm font-medium text-slate-300">No realtime session has started.</p><p className="mt-1 text-xs text-slate-500">Start explicitly to populate sanitized client and Deepgram events.</p></div>;
}

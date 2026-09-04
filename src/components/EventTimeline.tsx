"use client";

import type { InspectorTimelineEvent } from "@/lib/inspection";

export function EventTimeline({
  events,
  startedAt,
  showRaw = true,
}: {
  events: readonly InspectorTimelineEvent[];
  startedAt?: string;
  showRaw?: boolean;
}) {
  if (!events.length) {
    return <p className="text-sm text-slate-500">No events captured yet.</p>;
  }

  const startMs = Date.parse(startedAt || events[0]?.at || new Date().toISOString());

  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-4">
      {events.map((event, index) => (
        <li key={`${event.at}-${event.type}-${index}`} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border border-cyan-200/40 bg-[#0b1117]" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100">
              {event.type}
            </span>
            <span className="text-xs text-slate-500">{formatRelative(event.at, startMs)}</span>
            <time className="text-xs text-slate-500" title={event.at}>
              {formatLocalDateTime(event.at)}
            </time>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{event.label}</p>
          {event.detail ? <p className="mt-1 text-sm leading-6 text-slate-400">{event.detail}</p> : null}
          {showRaw && event.data !== undefined ? (
            <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-white/10 bg-[#020406] p-3 font-mono text-xs leading-5 text-slate-300">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function formatRelative(at: string, startMs: number) {
  const delta = Date.parse(at) - startMs;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta)}ms`;
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

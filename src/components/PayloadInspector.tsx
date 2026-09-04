"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { EventTimeline } from "@/components/EventTimeline";
import { ActionButton, FieldLabel, StatusBadge } from "@/components/lab-card";
import type { InspectorRecord } from "@/lib/inspection";

type InspectorTab = "overview" | "request" | "response" | "timeline" | "raw" | "notes";

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "request", label: "Request" },
  { id: "response", label: "Response" },
  { id: "timeline", label: "Timeline" },
  { id: "raw", label: "Raw JSON" },
  { id: "notes", label: "Notes" },
];

export function PayloadInspector({
  record,
  title = "Payload Inspector",
  defaultOpen = false,
  className = "",
}: {
  record: InspectorRecord | null;
  title?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const [query, setQuery] = useState("");
  const [copyState, setCopyState] = useState("");
  const open = openOverride ?? defaultOpen;

  const rawJson = useMemo(() => JSON.stringify(record ?? { status: "No payload captured yet." }, null, 2), [record]);
  const filteredRawJson = useMemo(() => filterJson(rawJson, query), [rawJson, query]);
  const activeText = useMemo(() => {
    if (!record) {
      return "No payload captured yet.";
    }

    if (activeTab === "overview") {
      return JSON.stringify(buildOverview(record), null, 2);
    }

    if (activeTab === "request") {
      return JSON.stringify(record.request, null, 2);
    }

    if (activeTab === "response") {
      return JSON.stringify(record.response, null, 2);
    }

    if (activeTab === "timeline") {
      return JSON.stringify(record.timeline, null, 2);
    }

    if (activeTab === "notes") {
      return record.notes.join("\n");
    }

    return rawJson;
  }, [activeTab, rawJson, record]);

  async function copyActiveTab() {
    try {
      await navigator.clipboard.writeText(activeText);
      setCopyState(`${TABS.find((tab) => tab.id === activeTab)?.label || "Tab"} copied.`);
    } catch {
      setCopyState("Copy unavailable in this browser context.");
    }

    window.setTimeout(() => setCopyState(""), 1600);
  }

  function downloadJson() {
    const blob = new Blob([rawJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${record?.module || "payload-inspector"}-${record?.id || "empty"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={`rounded-lg border border-white/10 bg-black/20 ${className}`}>
      <button
        type="button"
        onClick={() => setOpenOverride(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-white">{title}</span>
          <span className="mt-1 block text-xs text-slate-500">
            {record ? `${record.module} · ${record.durationMs}ms · ${record.id}` : "No payload captured yet"}
          </span>
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">{open ? "Hide" : "Inspect"}</span>
      </button>

      {open ? (
        <div className="border-t border-white/10 p-4">
          {record ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {buildBadges(record).map((badge) => (
                <StatusBadge key={badge.label} status={badge.status}>
                  {badge.label}
                </StatusBadge>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-[#020406] p-1 sm:grid-cols-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-9 rounded-md px-2 text-xs font-semibold transition ${
                  activeTab === tab.id ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton variant="secondary" onClick={copyActiveTab}>
              Copy Tab
            </ActionButton>
            <ActionButton variant="secondary" onClick={downloadJson}>
              Download JSON
            </ActionButton>
          </div>
          {copyState ? <p className="mt-3 text-xs text-emerald-200">{copyState}</p> : null}

          <div className="mt-4">{renderTab(activeTab, record, filteredRawJson, query, setQuery)}</div>
        </div>
      ) : null}
    </section>
  );
}

function renderTab(
  tab: InspectorTab,
  record: InspectorRecord | null,
  filteredRawJson: string,
  query: string,
  setQuery: (query: string) => void,
) {
  if (!record) {
    return <p className="rounded-lg border border-white/10 bg-[#020406] p-4 text-sm text-slate-500">Run this module to capture a sanitized payload.</p>;
  }

  if (tab === "overview") {
    return <OverviewTab record={record} />;
  }

  if (tab === "request") {
    return <JsonBlock value={record.request} />;
  }

  if (tab === "response") {
    return <JsonBlock value={record.response} />;
  }

  if (tab === "timeline") {
    return <EventTimeline events={record.timeline} startedAt={record.startedAt} />;
  }

  if (tab === "notes") {
    return (
      <ul className="space-y-2 rounded-lg border border-white/10 bg-[#020406] p-4 text-sm leading-6 text-slate-300">
        {record.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <FieldLabel>Search raw JSON</FieldLabel>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by key, value, path, status..."
          className="h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-200/50 focus:ring-2 focus:ring-cyan-200/20"
        />
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-[#020406] p-4 font-mono text-xs leading-6 text-slate-200">
        {filteredRawJson}
      </pre>
    </div>
  );
}

function OverviewTab({ record }: { record: InspectorRecord }) {
  const overview = buildOverview(record);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Metric label="Module" value={record.module} />
      <Metric label="Duration" value={`${record.durationMs}ms`} />
      <LocalDateTimeMetric label="Started Local" value={record.startedAt} />
      <Metric label="Started ISO" value={record.startedAt} />
      <LocalDateTimeMetric label="Completed Local" value={record.completedAt} />
      <Metric label="Completed ISO" value={record.completedAt} />
      <Metric label="Endpoint" value={overview.endpoint} wide />
      <Metric label="Status" value={overview.status === null ? "unknown" : String(overview.status)} />
      <Metric label="Model" value={overview.model || "n/a"} />
      <Metric label="Language" value={overview.language || "n/a"} />
    </div>
  );
}

function LocalDateTimeMetric({ label, value }: { label: string; value: string }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerSnapshot);
  return <Metric label={label} value={hydrated ? formatLocalDateTime(value) : value} />;
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-[#020406] p-3 ${wide ? "md:col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 break-words font-mono text-xs leading-5 text-slate-200">{value}</p>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-[#020406] p-4 font-mono text-xs leading-6 text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function buildOverview(record: InspectorRecord) {
  const bodyPreview = record.request.bodyPreview as Record<string, unknown> | undefined;

  return {
    method: record.request.method,
    endpoint: record.request.endpoint,
    status: record.response.status < 0 ? null : record.response.status,
    model: record.request.query?.model || toStringValue(bodyPreview?.model),
    language: record.request.query?.language || toStringValue(bodyPreview?.language),
    success:
      record.response.status !== null &&
      record.response.status >= 200 &&
      record.response.status < 300,
  };
}

function buildBadges(record: InspectorRecord) {
  const overview = buildOverview(record);
  const statusKnown = overview.status !== null;
  const statusStyle = statusKnown ? (overview.success ? ("success" as const) : ("error" as const)) : ("idle" as const);
  const badges = [
    { label: overview.method, status: "idle" as const },
    { label: compactEndpoint(overview.endpoint), status: "idle" as const },
    { label: statusKnown ? String(overview.status) : "status unknown", status: statusStyle },
    {
      label: statusKnown ? (overview.success ? "success" : "error") : "awaiting response",
      status: statusStyle,
    },
  ];

  if (overview.model) {
    badges.push({ label: `model ${overview.model}`, status: "idle" as const });
  }

  if (overview.language) {
    badges.push({ label: `language ${overview.language}`, status: "idle" as const });
  }

  return badges;
}

function compactEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return endpoint;
  }
}

function filterJson(rawJson: string, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return rawJson;
  }

  const matches = rawJson
    .split("\n")
    .filter((line) => line.toLowerCase().includes(normalized))
    .join("\n");

  return matches || "No matching JSON lines.";
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function subscribeToHydration() {
  return () => undefined;
}

function getHydratedSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

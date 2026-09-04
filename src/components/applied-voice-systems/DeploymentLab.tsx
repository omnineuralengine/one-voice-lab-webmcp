"use client";

import {
  Panel,
  PanelHeading,
  ProvenanceBadge,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { DEPLOYMENT_MODES } from "@/lib/applied-voice/labs";
import { RESPONSIBILITY_MATRIX } from "@/lib/applied-voice/pipeline";
import type {
  DeploymentMode,
  Ownership,
  ResponsibilityMatrixRow,
} from "@/types/applied-voice";

type DeploymentLabProps = {
  selectedModeId: string;
  onSelectMode: (id: string) => void;
  completedChecklist: string[];
  onChecklistChange: (ids: string[]) => void;
};

type ChecklistItem = {
  id: string;
  label: string;
  prompt: string;
};

type ChecklistGroup = {
  id: string;
  label: string;
  items: ChecklistItem[];
};

const ENTERPRISE_CHECKLIST: ChecklistGroup[] = [
  {
    id: "identity",
    label: "Identity + network",
    items: [
      { id: "authentication", label: "Authentication", prompt: "Define who may start each batch or realtime workload." },
      { id: "key-rotation", label: "Key rotation", prompt: "Set owners, cadence, revocation, and incident rotation steps." },
      { id: "least-privilege", label: "Least privilege", prompt: "Scope service identities, tools, environments, and operator access." },
      { id: "token-lifetime", label: "Token lifetime", prompt: "Keep browser grants short-lived, in memory, and redacted." },
      { id: "network-boundaries", label: "Network boundaries", prompt: "Document every ingress, egress, trust boundary, and allowlist." },
    ],
  },
  {
    id: "data",
    label: "Data protection",
    items: [
      { id: "pii-handling", label: "PII handling", prompt: "Minimize sensitive audio, transcripts, tool payloads, and traces." },
      { id: "logging-redaction", label: "Logging + redaction", prompt: "Redact credentials, temporary tokens, and sensitive fields before storage." },
      { id: "retention", label: "Retention", prompt: "Define deletion, access, backup, and export policy per artifact." },
      { id: "regional-processing", label: "Regional processing", prompt: "Validate the actual product, endpoint, contract, and data path." },
      { id: "encryption", label: "Encryption", prompt: "Validate transport, storage, key ownership, and rotation requirements." },
      { id: "auditability", label: "Auditability", prompt: "Preserve sanitized request, decision, tool, and handoff evidence." },
    ],
  },
  {
    id: "operations",
    label: "Reliability + operations",
    items: [
      { id: "slos", label: "SLOs", prompt: "Agree availability, latency, quality, and task-outcome objectives." },
      { id: "concurrency", label: "Concurrency", prompt: "Load test realistic session length, burst shape, and audio mix." },
      { id: "failover", label: "Failover", prompt: "Define degraded modes without inventing successful outcomes." },
      { id: "human-fallback", label: "Human fallback", prompt: "Set queue, disclosure, callback, and unavailable-handoff behavior." },
      { id: "incident-response", label: "Incident response", prompt: "Assign detection, containment, communication, and recovery owners." },
    ],
  },
];

const SELF_HOSTED_SURFACES = [
  { path: "/v1/status", role: "API status/readiness surface" },
  { path: "/v1/status/engine", role: "Engine status surface" },
  { path: "/v1/models", role: "Deployed model inventory surface" },
  { path: "/metrics", role: "Observability metrics concept" },
] as const;

const OWNER_LABELS: Record<Ownership, string> = {
  deepgram: "Deepgram",
  customer: "Customer",
  shared: "Shared",
  "third-party": "Third party",
};

const OWNER_STYLES: Record<Ownership, string> = {
  deepgram: "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100",
  customer: "border-violet-300/25 bg-violet-300/[0.07] text-violet-100",
  shared: "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100",
  "third-party": "border-amber-300/25 bg-amber-300/[0.07] text-amber-100",
};

export function DeploymentLab({
  selectedModeId,
  onSelectMode,
  completedChecklist,
  onChecklistChange,
}: DeploymentLabProps) {
  const selectedMode = DEPLOYMENT_MODES.find((mode) => mode.id === selectedModeId) ?? DEPLOYMENT_MODES[0];
  const checklistItems = ENTERPRISE_CHECKLIST.flatMap((group) => group.items);
  const completed = new Set(completedChecklist);

  function toggleChecklist(id: string) {
    const next = completed.has(id)
      ? completedChecklist.filter((item) => item !== id)
      : [...new Set([...completedChecklist, id])];
    onChecklistChange(next);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(210px,.56fr)_minmax(370px,1fr)_minmax(420px,1.16fr)] gap-3 overflow-hidden p-3">
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Deployment decision"
          title="Operating boundary"
          detail="Choose where media, credentials, models, and operational responsibility live."
        />
        <nav aria-label="Deployment modes" className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-1.5">
            {DEPLOYMENT_MODES.map((mode, index) => {
              const active = mode.id === selectedMode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onSelectMode(mode.id)}
                  aria-current={active ? "page" : undefined}
                  className={`w-full rounded-lg border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
                    active
                      ? "border-cyan-300/35 bg-cyan-300/[0.085] shadow-[0_0_20px_rgba(34,211,238,0.06)]"
                      : "border-transparent bg-black/10 hover:border-white/10 hover:bg-white/[0.025]"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-bold ${active ? "bg-cyan-200 text-slate-950" : "bg-white/[0.045] text-slate-600"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[10px] font-semibold ${active ? "text-white" : "text-slate-400"}`}>{mode.name}</span>
                      <span className="mt-1 line-clamp-2 block text-[9px] leading-3.5 text-slate-600">{mode.description}</span>
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1">
                    <ProvenanceBadge value={provenanceLabel(mode)} />
                    {mode.operationalOwner.map((owner) => <OwnerBadge key={owner} owner={owner} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
        <div className="shrink-0 border-t border-white/10 bg-black/15 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Decision filter</p>
          <p className="mt-1 text-[9px] leading-3.5 text-slate-600">Validate data path, latency, operational ownership, support model, and failure handling before optimizing infrastructure.</p>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Architecture contract"
          title={selectedMode.name}
          detail={selectedMode.description}
          actions={<ProvenanceBadge value={provenanceLabel(selectedMode)} />}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ModeArchitecture mode={selectedMode} />
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <DetailCard title="Trust boundary" detail={selectedMode.boundary} tone="cyan" />
            <DetailCard title="Secret model" detail={selectedMode.secretModel} tone="violet" />
            <ListCard title="Benefits" items={selectedMode.benefits} />
            <ListCard title="Tradeoffs" items={selectedMode.tradeoffs} tone="amber" />
            <div className="xl:col-span-2">
              <ListCard title="Validate before production" items={selectedMode.validationRequired} tone="amber" />
            </div>
          </div>

          {selectedMode.id === "self-hosted" ? <SelfHostedWorkbench /> : null}

          <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.055] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge value="docs verification required" />
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-100/80">Compliance is not automatic</p>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-amber-50/65">Every deployment and compliance claim requires validation with the customer&apos;s legal, security, and compliance teams, plus current product documentation and applicable agreements.</p>
          </div>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Production readiness"
          title="Enterprise controls + ownership"
          detail="A local learning checklist and an explicit four-party responsibility matrix."
          actions={<span className="font-mono text-[9px] text-slate-500">{completed.size}/{checklistItems.length} reviewed</span>}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <section aria-labelledby="enterprise-checklist-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p id="enterprise-checklist-title" className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200/65">Enterprise checklist</p>
                <p className="mt-1 text-[9px] leading-3.5 text-slate-600">Checked means reviewed in this draft, not compliant or production-approved.</p>
              </div>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                <div className="h-full rounded-full bg-cyan-300 transition-[width]" style={{ width: `${(completed.size / checklistItems.length) * 100}%` }} />
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {ENTERPRISE_CHECKLIST.map((group) => (
                <div key={group.id} className="overflow-hidden rounded-lg border border-white/[0.08] bg-black/15">
                  <p className="border-b border-white/[0.07] px-2.5 py-2 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">{group.label}</p>
                  <div className="divide-y divide-white/[0.06]">
                    {group.items.map((item) => {
                      const checked = completed.has(item.id);
                      return (
                        <label key={item.id} className="flex cursor-pointer gap-2.5 px-2.5 py-2 transition hover:bg-white/[0.02] focus-within:bg-white/[0.03]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChecklist(item.id)}
                            className="mt-0.5 size-3.5 shrink-0 accent-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-200"
                          />
                          <span className="min-w-0">
                            <span className={`block text-[9px] font-semibold ${checked ? "text-cyan-100" : "text-slate-300"}`}>{item.label}</span>
                            <span className="mt-0.5 block text-[8px] leading-3.5 text-slate-600">{item.prompt}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="responsibility-title" className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p id="responsibility-title" className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200/65">Responsibility matrix</p>
                <p className="mt-1 text-[9px] leading-3.5 text-slate-600">Contractual terms and the selected deployment can change these boundaries.</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(OWNER_LABELS) as Ownership[]).map((owner) => <OwnerBadge key={owner} owner={owner} />)}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {RESPONSIBILITY_MATRIX.map((row) => <ResponsibilityCard key={row.area} row={row} />)}
            </div>
          </section>
        </div>
      </Panel>
    </div>
  );
}

function ModeArchitecture({ mode }: { mode: DeploymentMode }) {
  const steps = architectureSteps(mode.id);
  return (
    <section className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reference flow</p>
          <p className="mt-1 text-[9px] leading-3.5 text-slate-600">Architecture teaching model; it does not provision infrastructure or third-party connectors.</p>
        </div>
        <ProvenanceBadge value={mode.provenance === "working" ? "architectural concept" : provenanceLabel(mode)} />
      </div>
      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch gap-1.5">
          {steps.map((step, index) => (
            <div key={`${mode.id}-${step.label}`} className="contents">
              <div className={`w-36 rounded-md border p-2 ${step.owner ? OWNER_STYLES[step.owner] : "border-white/10 bg-[#03080d] text-slate-300"}`}>
                <p className="text-[9px] font-semibold leading-3.5">{step.label}</p>
                <p className="mt-1 text-[8px] leading-3 text-slate-500">{step.detail}</p>
              </div>
              {index < steps.length - 1 ? <span className="self-center font-mono text-[10px] text-cyan-200/35" aria-hidden="true">→</span> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SelfHostedWorkbench() {
  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-violet-300/20 bg-violet-300/[0.035]">
      <div className="border-b border-violet-300/15 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">Self-hosted control plane</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">Scale the API layer and engine/GPU layer independently according to connection pressure and inference capacity.</p>
          </div>
          <ProvenanceBadge value="docs verification required" />
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 text-center">
          <TopologyNode label="Protected ingress" detail="Customer-owned gateway" />
          <span className="text-cyan-200/35" aria-hidden="true">→</span>
          <TopologyNode label="API layer" detail="Connections + request routing · scale independently" tone="cyan" />
          <span className="text-cyan-200/35" aria-hidden="true">→</span>
          <TopologyNode label="Engine / GPU" detail="Model inference · scale independently" tone="violet" />
        </div>
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operational surfaces</p>
          <div className="mt-2 space-y-1.5">
            {SELF_HOSTED_SURFACES.map((surface) => (
              <div key={surface.path} className="flex items-start justify-between gap-3 rounded-md border border-white/[0.08] bg-black/20 p-2">
                <code className="shrink-0 font-mono text-[9px] text-cyan-100">{surface.path}</code>
                <span className="text-right text-[8px] leading-3.5 text-slate-600">{surface.role}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[8px] leading-3.5 text-slate-600">Endpoint behavior, readiness semantics, metrics, and version compatibility must be verified against the installed release&apos;s official self-hosted documentation.</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Platform + operations</p>
          <ul className="mt-2 space-y-1.5 text-[9px] leading-3.5 text-slate-400">
            {["Container/Kubernetes topology is an architecture concept, not provisioned by this lab.", "Customer-managed secrets and least-privilege service identities.", "Versioned model updates with regression tests and rollback criteria.", "Capacity planning across sessions, audio duration, models, GPUs, and failure headroom.", "Data residency, observability, on-call, upgrades, support, and incident ownership."].map((item) => (
              <li key={item} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-violet-300/60" /><span>{item}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-px border-t border-amber-300/15 bg-amber-300/10 xl:grid-cols-2">
        <div className="bg-[#0b0b0c] p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200/75">Ingress authentication boundary</p>
          <p className="mt-1.5 text-[9px] leading-4 text-amber-50/60">Self-hosted has no built-in ingress authentication. The customer must provide and validate network isolation, gateway authentication, authorization, and access controls.</p>
        </div>
        <div className="bg-[#0b0b0c] p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200/75">No zero-egress claim</p>
          <p className="mt-1.5 text-[9px] leading-4 text-amber-50/60">Do not claim zero egress. Validate telemetry, model/update delivery, licensing or support traffic, logs, external dependencies, and the deployed network policy.</p>
        </div>
      </div>
    </section>
  );
}

function ResponsibilityCard({ row }: { row: ResponsibilityMatrixRow }) {
  const values: Array<{ owner: Ownership; value: string }> = [
    { owner: "deepgram", value: row.deepgram },
    { owner: "customer", value: row.customer },
    { owner: "shared", value: row.shared },
    { owner: "third-party", value: row.thirdParty },
  ];
  return (
    <details className="group rounded-lg border border-white/[0.08] bg-black/15 open:border-white/15">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-[9px] font-semibold text-slate-300 outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/40 [&::-webkit-details-marker]:hidden">
        <span>{row.area}</span>
        <span className="font-mono text-[10px] text-slate-700 transition group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <div className="grid gap-1.5 border-t border-white/[0.07] p-2 lg:grid-cols-2">
        {values.map(({ owner, value }) => (
          <div key={owner} className="rounded-md border border-white/[0.07] bg-[#03080d] p-2">
            <OwnerBadge owner={owner} />
            <p className="mt-1.5 text-[8px] leading-3.5 text-slate-500">{value}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function DetailCard({ title, detail, tone }: { title: string; detail: string; tone: "cyan" | "violet" }) {
  const classes = tone === "cyan" ? "border-cyan-300/15 bg-cyan-300/[0.035]" : "border-violet-300/15 bg-violet-300/[0.035]";
  return (
    <section className={`rounded-lg border p-3 ${classes}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <p className="mt-1.5 text-[10px] leading-4 text-slate-300">{detail}</p>
    </section>
  );
}

function ListCard({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "amber" }) {
  return (
    <section className={`rounded-lg border p-3 ${tone === "amber" ? "border-amber-300/15 bg-amber-300/[0.035]" : "border-white/[0.08] bg-black/15"}`}>
      <p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${tone === "amber" ? "text-amber-200/70" : "text-slate-500"}`}>{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => <li key={item} className="flex gap-2 text-[9px] leading-3.5 text-slate-400"><span className={`mt-1.5 size-1 shrink-0 rounded-full ${tone === "amber" ? "bg-amber-300/60" : "bg-cyan-300/60"}`} /><span>{item}</span></li>)}
      </ul>
    </section>
  );
}

function TopologyNode({ label, detail, tone = "default" }: { label: string; detail: string; tone?: "default" | "cyan" | "violet" }) {
  const classes = tone === "cyan"
    ? "border-cyan-300/20 bg-cyan-300/[0.055]"
    : tone === "violet"
      ? "border-violet-300/20 bg-violet-300/[0.055]"
      : "border-white/10 bg-black/20";
  return (
    <div className={`min-h-20 rounded-md border p-2 ${classes}`}>
      <p className="text-[9px] font-semibold text-slate-200">{label}</p>
      <p className="mt-1 text-[8px] leading-3.5 text-slate-600">{detail}</p>
    </div>
  );
}

function OwnerBadge({ owner }: { owner: Ownership }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${OWNER_STYLES[owner]}`}>{OWNER_LABELS[owner]}</span>;
}

function provenanceLabel(mode: DeploymentMode) {
  if (mode.provenance === "working") return "working";
  if (mode.provenance === "concept") return "architectural concept";
  return mode.provenance;
}

function architectureSteps(modeId: string): Array<{ label: string; detail: string; owner?: Ownership }> {
  if (modeId === "regional-endpoint") return [
    { label: "Customer workload", detail: "Classified audio/text", owner: "customer" },
    { label: "Documented regional path", detail: "Availability must be verified", owner: "shared" },
    { label: "Deepgram capability", detail: "Model/feature parity not assumed", owner: "deepgram" },
  ];
  if (modeId === "backend-proxy") return [
    { label: "Browser / mobile", detail: "No permanent credential", owner: "customer" },
    { label: "Customer backend proxy", detail: "Auth, policy, limits, redaction", owner: "customer" },
    { label: "Deepgram cloud API", detail: "Documented request contract", owner: "deepgram" },
  ];
  if (modeId === "browser-temp-token") return [
    { label: "Trusted grant route", detail: "Permanent key stays server-side", owner: "customer" },
    { label: "Browser memory", detail: "Short-lived token; never localStorage", owner: "customer" },
    { label: "Realtime API", detail: "Token and events stay redacted", owner: "deepgram" },
  ];
  if (modeId === "self-hosted") return [
    { label: "Customer network", detail: "Protected, authenticated ingress", owner: "customer" },
    { label: "Self-hosted API layer", detail: "Connections and routing", owner: "shared" },
    { label: "Engine / GPU layer", detail: "Inference and model capacity", owner: "shared" },
  ];
  if (modeId === "hybrid") return [
    { label: "Classified workloads", detail: "Explicit routing policy", owner: "customer" },
    { label: "Managed + self-hosted", detail: "Separate identities/control planes", owner: "shared" },
    { label: "Unified operations", detail: "Cross-boundary trace and failover", owner: "customer" },
  ];
  return [
    { label: "Customer application", detail: "Capture, authorization, workflow", owner: "customer" },
    { label: "Deepgram cloud API", detail: "Managed speech capability", owner: "deepgram" },
    { label: "Customer outputs", detail: "Playback, tools, storage, review", owner: "customer" },
  ];
}

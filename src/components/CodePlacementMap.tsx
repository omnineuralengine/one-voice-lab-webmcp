import type { CodeLabFile, CodeLabWorkflow } from "@/lib/code-lab-files";

export function CodePlacementMap({
  workflow,
  file,
  compact = false,
}: {
  workflow: CodeLabWorkflow;
  file: CodeLabFile;
  compact?: boolean;
}) {
  return (
    <aside className={`min-h-0 overflow-auto bg-[#071018] ${compact ? "rounded-lg border border-white/10" : "border-l border-white/10"}`}>
      <div className="border-b border-white/10 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Placement Map</p>
        <h3 className="mt-1 text-sm font-semibold text-white">{workflow.title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{workflow.description}</p>
      </div>

      <div className="space-y-3 p-3">
        <InfoBlock title="What this file does">{file.role}</InfoBlock>
        <InfoBlock title="Where it fits">{file.whereItFits}</InfoBlock>

        <div className="rounded-lg border border-white/10 bg-black/24 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Request Flow</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {file.requestFlow.map((step, index) => (
              <span key={`${step}-${index}`} className="inline-flex items-center gap-2">
                <span className="rounded-md border border-cyan-200/15 bg-cyan-200/[0.06] px-2 py-1 text-xs text-cyan-50">{step}</span>
                {index < file.requestFlow.length - 1 ? <span className="text-slate-600">-&gt;</span> : null}
              </span>
            ))}
          </div>
        </div>

        {workflow.failureModes?.length ? <ListBlock title="Failure modes" items={workflow.failureModes} /> : null}
        {workflow.fallbackNote ? <InfoBlock title="Fallback path">{workflow.fallbackNote}</InfoBlock> : null}

        <ListBlock title="Response paths to inspect" items={file.responsePaths} />
        <ListBlock title="Required environment variables" items={file.environmentVariables.length ? file.environmentVariables : ["None in this file"]} />
        <ListBlock title="Security notes" items={file.securityNotes} tone="security" />
      </div>
    </aside>
  );
}

function InfoBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/24 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{children}</p>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone?: "security" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/24 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className={`break-words font-mono text-xs leading-5 ${tone === "security" ? "text-emerald-100" : "text-slate-300"}`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

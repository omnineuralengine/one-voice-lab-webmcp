import type { ReactNode } from "react";

import type { CodeLabLaunchContext, CodeLabLaunchSemanticRegion } from "@/types/code-lab-launch-context";

export function CodeLabLaunchBanner({
  context,
  modified,
  savedLocally,
  secretWarning,
  onReturnToQuestline,
  onOpenRelatedApi,
  onDiscard,
}: {
  context: CodeLabLaunchContext;
  modified: boolean;
  savedLocally: boolean;
  secretWarning: boolean;
  onReturnToQuestline: () => void;
  onOpenRelatedApi?: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-cyan-300/15 bg-cyan-300/[0.045] px-3 py-2.5" data-testid="questline-launch-banner">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <WorkspaceBadge tone="cyan">Temporary workspace</WorkspaceBadge>
          <WorkspaceBadge tone="violet">Generated from Questline</WorkspaceBadge>
          {modified ? <WorkspaceBadge tone="amber">Modified</WorkspaceBadge> : null}
          {savedLocally ? <WorkspaceBadge tone="green">Saved locally</WorkspaceBadge> : null}
          {secretWarning ? <WorkspaceBadge tone="rose">Secret warning</WorkspaceBadge> : null}
        </div>
        <p className="mt-1 truncate text-[11px] text-slate-300">
          Launched from Applied Engineering Questline · <span className="font-semibold text-white">{context.workflow.title}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button type="button" onClick={onReturnToQuestline} className={buttonClassName}>Return to Questline</button>
        {onOpenRelatedApi ? <button type="button" onClick={onOpenRelatedApi} className={buttonClassName}>Open related API</button> : null}
        <button type="button" onClick={onDiscard} className={buttonClassName}>Discard temporary workspace</button>
      </div>
    </div>
  );
}

export function CodeLabLaunchTeachingPanel({
  context,
  activePath,
  activeRegionId,
  onSelectRegion,
}: {
  context: CodeLabLaunchContext;
  activePath: string;
  activeRegionId?: string;
  onSelectRegion: (path: string, region: CodeLabLaunchSemanticRegion) => void;
}) {
  const regions = context.files.flatMap((file) => file.semanticRegions.map((region) => ({ file, region })));
  const activeRegion = regions.find(({ region }) => region.id === activeRegionId)?.region;

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-l border-white/10 bg-[#071018]" aria-label="Questline teaching panel">
      <div className="shrink-0 border-b border-white/10 p-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200/65">Quest teaching context</p>
        <h3 className="mt-1 text-xs font-semibold text-white">{context.workflow.title}</h3>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">{context.workflow.description}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-white/10 p-3" aria-labelledby="semantic-regions-title">
          <h4 id="semantic-regions-title" className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Semantic regions</h4>
          <div className="mt-2 grid grid-cols-2 gap-1.5" data-testid="semantic-region-navigation">
            {regions.length ? regions.map(({ file, region }) => (
              <button
                key={`${file.path}-${region.id}`}
                type="button"
                onClick={() => onSelectRegion(file.path, region)}
                aria-pressed={activeRegionId === region.id && activePath === file.path}
                className={`rounded-md border px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${activeRegionId === region.id && activePath === file.path ? "border-violet-300/35 bg-violet-300/[0.10] text-violet-100" : "border-white/[0.07] bg-black/20 text-slate-400 hover:border-white/15 hover:text-white"}`}
              >
                <span className="block text-[9px] font-semibold">{region.label}</span>
                <span className="mt-0.5 block truncate font-mono text-[7px] text-slate-600">{file.path}:{region.startLine}</span>
              </button>
            )) : <p className="col-span-2 text-[10px] leading-4 text-slate-600">No semantic regions were identified in this starter.</p>}
          </div>
          {activeRegion ? (
            <div className="mt-2 rounded-md border border-violet-300/15 bg-violet-300/[0.04] p-2" role="status" aria-live="polite">
              <p className="text-[9px] font-semibold text-violet-100">{activeRegion.label} · lines {activeRegion.startLine}–{activeRegion.endLine}</p>
              <p className="mt-1 text-[9px] leading-4 text-slate-400">{activeRegion.explanation}</p>
            </div>
          ) : null}
        </section>

        <TeachingSection title="Lesson notes">
          {context.lessonNotes.map((note) => (
            <article key={`${note.category}-${note.title}`} className="rounded-md border border-white/[0.07] bg-black/15 p-2">
              <p className="text-[8px] font-bold uppercase tracking-wide text-cyan-200/55">{note.title}</p>
              <p className="mt-1 text-[9px] leading-4 text-slate-400">{note.body}</p>
            </article>
          ))}
        </TeachingSection>

        <TeachingSection title="Environment placeholders">
          {context.environmentVariables.length ? context.environmentVariables.map((variable) => (
            <div key={variable.name} className="rounded-md border border-emerald-300/15 bg-emerald-300/[0.035] p-2">
              <p className="font-mono text-[9px] text-emerald-100">{variable.name} = {variable.placeholder}</p>
              <p className="mt-1 text-[8px] leading-3.5 text-slate-500">{variable.location} · {variable.serverOnly ? "server only" : "runtime scoped"}</p>
            </div>
          )) : <p className="text-[9px] text-slate-600">This starter does not require an environment variable.</p>}
        </TeachingSection>

        <TeachingSection title="Security warnings" tone="amber">
          <ul className="space-y-1.5">
            {context.securityWarnings.map((warning) => <li key={warning} className="text-[9px] leading-4 text-amber-50/70">• {warning}</li>)}
          </ul>
        </TeachingSection>
      </div>
    </aside>
  );
}

function TeachingSection({ children, title, tone = "default" }: { children: ReactNode; title: string; tone?: "default" | "amber" }) {
  return (
    <section className={`space-y-2 border-b border-white/10 p-3 ${tone === "amber" ? "bg-amber-300/[0.025]" : ""}`}>
      <h4 className={`text-[9px] font-bold uppercase tracking-wide ${tone === "amber" ? "text-amber-100/65" : "text-slate-500"}`}>{title}</h4>
      {children}
    </section>
  );
}

function WorkspaceBadge({ children, tone }: { children: string; tone: "cyan" | "violet" | "amber" | "green" | "rose" }) {
  const classes = {
    cyan: "border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-100",
    violet: "border-violet-300/25 bg-violet-300/[0.08] text-violet-100",
    amber: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
    green: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100",
    rose: "border-rose-300/25 bg-rose-300/[0.08] text-rose-100",
  }[tone];
  return <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${classes}`}>{children}</span>;
}

const buttonClassName = "h-8 rounded-md border border-white/10 bg-black/20 px-2.5 text-[10px] font-semibold text-slate-300 hover:border-cyan-300/25 hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-200";

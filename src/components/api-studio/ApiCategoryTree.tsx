"use client";

import type { ApiCategory, ApiCategoryId, ApiMasteryProgress } from "@/types/deepgram-api-studio";

export function ApiCategoryTree({
  categories,
  selectedOperationId,
  masteryMode,
  mastery,
  onSelectOperation,
  onToggleMastery,
}: {
  categories: ApiCategory[];
  selectedOperationId: string;
  masteryMode: boolean;
  mastery: ApiMasteryProgress;
  onSelectOperation: (operationId: string) => void;
  onToggleMastery: () => void;
}) {
  const covered = new Set(mastery.viewedCategories);

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#050a10]/92">
      <div className="shrink-0 border-b border-white/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/65">API Reference Map</p>
            <p className="mt-1 text-xs text-slate-500">7 surfaces · local learning state</p>
          </div>
          <button
            type="button"
            onClick={onToggleMastery}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
              masteryMode
                ? "border-violet-300/40 bg-violet-300/15 text-violet-100"
                : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
            }`}
          >
            Mastery {masteryMode ? "On" : "Off"}
          </button>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>API Surface Covered</span>
            <span className="font-mono text-cyan-100">{covered.size} / {categories.length}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-[width]"
              style={{ width: `${(covered.size / categories.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {categories.map((category) => (
            <CategoryBranch
              key={category.id}
              category={category}
              selectedOperationId={selectedOperationId}
              viewed={covered.has(category.id)}
              onSelectOperation={onSelectOperation}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 p-3 text-[10px] leading-4 text-slate-500">
        <span className="font-semibold text-slate-300">Docs alignment:</span> API Studio is a learning layer over Deepgram&apos;s official docs. Verify endpoints and options before production use.
      </div>
    </aside>
  );
}

function CategoryBranch({
  category,
  selectedOperationId,
  viewed,
  onSelectOperation,
}: {
  category: ApiCategory;
  selectedOperationId: string;
  viewed: boolean;
  onSelectOperation: (operationId: string) => void;
}) {
  const active = category.operations.some((operation) => operation.id === selectedOperationId);

  return (
    <section className={`rounded-lg border transition ${active ? "border-cyan-300/20 bg-cyan-300/[0.035]" : "border-white/[0.07] bg-black/20"}`}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-bold ${active ? "bg-cyan-200 text-slate-950" : "bg-white/[0.06] text-slate-400"}`}>
          {category.short.slice(0, 4)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-xs font-semibold text-slate-100">{category.name}</h3>
            {viewed ? <span className="text-[9px] text-emerald-300">●</span> : null}
          </div>
          <p className="truncate text-[10px] text-slate-600">{category.goal}</p>
        </div>
      </div>
      <div className="border-t border-white/[0.06] p-1">
        {category.operations.map((operation) => {
          const operationActive = operation.id === selectedOperationId;
          return (
            <button
              key={operation.id}
              type="button"
              onClick={() => onSelectOperation(operation.id)}
              className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                operationActive
                  ? "bg-cyan-300/12 text-cyan-50 shadow-[inset_2px_0_0_rgba(103,232,249,0.8),0_0_18px_rgba(34,211,238,0.08)]"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              <span className={`size-1.5 shrink-0 rounded-full ${operation.executable ? "bg-emerald-300" : operation.status === "locked-by-design" ? "bg-rose-300" : "bg-amber-300"}`} />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{operation.name}</span>
              <span className="rounded border border-white/[0.08] px-1 py-0.5 text-[8px] uppercase tracking-wide text-slate-600 group-hover:text-slate-400">
                {operation.method === "WebSocket" ? "WS" : operation.method}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function categoryProgressLabel(viewedCategories: ApiCategoryId[], total: number) {
  return `API Surface Covered: ${new Set(viewedCategories).size} / ${total} categories`;
}

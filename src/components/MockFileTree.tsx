import { PlusIcon, TrashIcon } from "@/components/icons";
import type { CodeLabFile } from "@/lib/code-lab-files";

export type MockFileTreeFile = CodeLabFile & {
  custom?: boolean;
  removable?: boolean;
  modified?: boolean;
};

export type MockFileTreeProps = {
  files: MockFileTreeFile[];
  activePath: string;
  onSelect: (path: string) => void;
  onAddFile?: () => void;
  onDeleteFile?: (path: string) => void;
  title?: string;
  emptyMessage?: string;
};

export function MockFileTree({
  files,
  activePath,
  onSelect,
  onAddFile,
  onDeleteFile,
  title = "deepgram-code-lab",
  emptyMessage = "Generate starter files or add a custom file.",
}: MockFileTreeProps) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-white/10 bg-[#071018]" aria-label="Code Lab project tree">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Explorer</p>
          <p className="mt-1 truncate text-xs text-slate-500">{title}</p>
        </div>
        {onAddFile ? (
          <button
            type="button"
            onClick={onAddFile}
            title="Add file"
            aria-label="Add file"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-cyan-200/20 bg-cyan-200/[0.07] text-cyan-100 transition hover:bg-cyan-200 hover:text-slate-950"
          >
            <PlusIcon className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {files.length === 0 ? (
          <p className="px-2 py-4 text-xs leading-5 text-slate-500">{emptyMessage}</p>
        ) : (
          files.map((file) => {
            const active = file.path === activePath;
            const canDelete = Boolean(onDeleteFile && (file.custom || file.removable));

            return (
              <div
                key={file.path}
                className={`group mb-0.5 flex min-h-9 items-center rounded-md transition ${
                  active ? "bg-cyan-200/14 text-cyan-50" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(file.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 self-stretch px-2 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-200/60"
                  aria-current={active ? "page" : undefined}
                  title={file.path}
                >
                  <span className="w-7 shrink-0 text-center font-mono text-[9px] font-bold uppercase text-slate-500" aria-hidden="true">
                    {fileIcon(file.path)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                  {file.modified ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-amber-200" title="Modified locally" aria-label="Modified locally" />
                  ) : null}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => onDeleteFile?.(file.path)}
                    title={`Delete ${file.path}`}
                    aria-label={`Delete ${file.path}`}
                    className="mr-1 grid size-7 shrink-0 place-items-center rounded text-slate-500 opacity-70 transition hover:bg-rose-300/10 hover:text-rose-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-200/60 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <TrashIcon className="size-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {onAddFile ? (
        <button
          type="button"
          onClick={onAddFile}
          className="m-2 mt-0 h-9 shrink-0 rounded-md border border-dashed border-white/15 text-xs font-semibold text-slate-400 transition hover:border-cyan-200/30 hover:bg-cyan-200/[0.05] hover:text-cyan-100"
        >
          Add File
        </button>
      ) : null}
    </aside>
  );
}

function fileIcon(path: string) {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "TS";
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "JS";
  if (path.endsWith(".py")) return "PY";
  if (path.endsWith(".go")) return "GO";
  if (path.endsWith(".cs")) return "C#";
  if (path.endsWith(".json")) return "{}";
  if (path.endsWith(".md")) return "MD";
  if (path.endsWith(".sh")) return "$";
  if (path.includes("env")) return "ENV";
  return "FILE";
}

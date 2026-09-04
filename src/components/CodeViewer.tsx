"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type UIEvent } from "react";

import { CopyIcon, ResetIcon, SaveIcon } from "@/components/icons";
import type { CodeLabFile } from "@/lib/code-lab-files";

export type CodeViewerMode = "edit" | "view";

export type CodeViewerProps = {
  file: CodeLabFile;
  value?: string;
  onChange?: (value: string) => void;
  mode?: CodeViewerMode;
  onModeChange?: (mode: CodeViewerMode) => void;
  onCopy: (text: string) => void;
  onReset?: () => void;
  onSave?: () => void;
  copiedLabel?: string;
  savedLabel?: string;
  modified?: boolean;
  secretWarning?: boolean | string;
  emptyGuidance?: string;
  saveLabel?: string;
  highlightLines?: { startLine: number; endLine: number; revision: number };
};

export function CodeViewer({
  file,
  value,
  onChange,
  mode,
  onModeChange,
  onCopy,
  onReset,
  onSave,
  copiedLabel,
  savedLabel,
  modified = false,
  secretWarning = false,
  emptyGuidance = "This starter file is intentionally short. Add the implementation details you want to model here.",
  saveLabel = "Save Draft",
  highlightLines,
}: CodeViewerProps) {
  const code = value ?? file.code;
  const editable = Boolean(onChange);
  const [internalMode, setInternalMode] = useState<CodeViewerMode>(editable ? "edit" : "view");
  const activeMode = editable ? (mode ?? internalMode) : "view";
  const lineNumberRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightedRevisionRef = useRef<number | null>(null);
  const lines = code.split("\n");
  const showEmptyGuidance = code.trim().length === 0 || lines.length <= 2;

  useEffect(() => {
    if (!highlightLines || !textareaRef.current || activeMode !== "edit" || highlightedRevisionRef.current === highlightLines.revision) return;
    highlightedRevisionRef.current = highlightLines.revision;
    const editor = textareaRef.current;
    const lineStarts = [0];
    for (let index = 0; index < code.length; index += 1) {
      if (code[index] === "\n") lineStarts.push(index + 1);
    }
    const startIndex = lineStarts[Math.max(0, highlightLines.startLine - 1)] ?? 0;
    const lineAfterEnd = lineStarts[Math.max(0, highlightLines.endLine)] ?? code.length;
    const endIndex = Math.max(startIndex, lineAfterEnd > startIndex ? lineAfterEnd - 1 : code.length);
    editor.focus();
    editor.setSelectionRange(startIndex, endIndex);
    const lineHeight = 20;
    editor.scrollTop = Math.max(0, (highlightLines.startLine - 2) * lineHeight);
    if (lineNumberRef.current) lineNumberRef.current.scrollTop = editor.scrollTop;
  }, [activeMode, code, highlightLines]);

  function changeMode(nextMode: CodeViewerMode) {
    if (!editable && nextMode === "edit") return;
    if (mode === undefined) setInternalMode(nextMode);
    onModeChange?.(nextMode);
  }

  function syncLineNumbers(event: UIEvent<HTMLTextAreaElement>) {
    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && onSave) {
      event.preventDefault();
      onSave();
      return;
    }

    if (event.key !== "Tab" || !onChange) return;

    event.preventDefault();
    const editor = event.currentTarget;
    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const nextCode = `${code.slice(0, selectionStart)}  ${code.slice(selectionEnd)}`;
    onChange(nextCode);

    window.requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(selectionStart + 2, selectionStart + 2);
    });
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#05080d]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#071018] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-200">{file.path}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <CodeBadge>{file.language}</CodeBadge>
            <CodeBadge>{file.side}</CodeBadge>
            {editable ? <CodeBadge tone="cyan">Editable mock file</CodeBadge> : null}
            {modified ? <CodeBadge tone="warning">Modified locally</CodeBadge> : null}
            {secretWarning ? <CodeBadge tone="error">Secret warning</CodeBadge> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {editable ? (
            <div className="flex h-8 items-center rounded-md border border-white/10 bg-black/30 p-0.5" aria-label="Editor mode">
              {(["edit", "view"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeMode(option)}
                  className={`h-7 rounded px-2 text-[11px] font-semibold capitalize transition ${
                    activeMode === option ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:text-white"
                  } focus-visible:outline-2 focus-visible:outline-cyan-200`}
                  aria-pressed={activeMode === option}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          {onReset ? (
            <ToolbarButton onClick={onReset} title="Restore the original file template">
              <ResetIcon className="size-3.5" />
              Reset File
            </ToolbarButton>
          ) : null}
          {onSave ? (
            <ToolbarButton onClick={onSave} title="Save this sanitized learning draft in this browser" emphasized>
              <SaveIcon className="size-3.5" />
              {savedLabel || saveLabel}
            </ToolbarButton>
          ) : null}
          <ToolbarButton onClick={() => onCopy(code)} title="Copy the current file contents">
            <CopyIcon className="size-3.5" />
            {copiedLabel || "Copy"}
          </ToolbarButton>
          <span className="sr-only" role="status" aria-live="polite">{savedLabel}</span>
        </div>
      </div>

      {secretWarning ? (
        <div className="shrink-0 border-b border-amber-200/15 bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-100" role="alert">
          {typeof secretWarning === "string" ? secretWarning : "Do not paste real API keys into snippets."}
        </div>
      ) : null}

      {activeMode === "edit" ? (
        <div className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)] overflow-hidden bg-[#05080d] focus-within:ring-1 focus-within:ring-inset focus-within:ring-cyan-200/45">
          <pre
            ref={lineNumberRef}
            aria-hidden="true"
            className="m-0 select-none overflow-hidden border-r border-white/[0.06] bg-white/[0.02] px-3 py-3 text-right font-mono text-xs leading-5 text-slate-600"
          >
            {lines.map((_, index) => `${index + 1}\n`).join("")}
          </pre>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(event) => onChange?.(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            onScroll={syncLineNumbers}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={`Edit ${file.path}`}
            data-testid="code-lab-editor"
            className="h-full min-h-[260px] w-full resize-none overflow-auto bg-transparent px-3 py-3 font-mono text-xs leading-5 text-slate-200 caret-cyan-200 outline-none selection:bg-cyan-300/25"
            style={{ tabSize: 2 }}
          />
        </div>
      ) : (
        <pre className="min-h-[260px] flex-1 overflow-auto p-0 font-mono text-xs leading-5 text-slate-200">
          {lines.map((line, index) => (
            <div key={`${file.path}-${index}`} className="grid min-w-max grid-cols-[48px_minmax(72ch,140ch)] border-b border-white/[0.025]">
              <span className="select-none bg-white/[0.02] px-3 py-0.5 text-right text-slate-600">{index + 1}</span>
              <code className="whitespace-pre px-3 py-0.5">{line || " "}</code>
            </div>
          ))}
        </pre>
      )}

      <div className="shrink-0 border-t border-white/[0.06] bg-[#071018] px-3 py-2 text-[11px] leading-4 text-slate-500">
        {showEmptyGuidance ? <span className="mr-2 text-slate-400">{emptyGuidance}</span> : null}
        {editable ? "Edit these snippets safely. They are local learning drafts and are not executed." : "Educational reference only. This code is not executed."}
      </div>
    </section>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  emphasized = false,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  emphasized?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
        emphasized
          ? "border-cyan-200/25 bg-cyan-200/10 text-cyan-100 hover:bg-cyan-200 hover:text-slate-950"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.09] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function CodeBadge({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "cyan" | "warning" | "error" }) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.06] text-slate-400",
    cyan: "border-cyan-200/20 bg-cyan-200/[0.07] text-cyan-100",
    warning: "border-amber-200/20 bg-amber-200/[0.08] text-amber-100",
    error: "border-rose-300/25 bg-rose-300/[0.08] text-rose-100",
  }[tone];

  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${toneClass}`}>{children}</span>;
}

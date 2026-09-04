"use client";

import type { KeyboardEvent } from "react";

import type { DiscoveryQuickSelectGroup as DiscoveryQuickSelectGroupModel } from "@/types/pre-sales-studio";

interface DiscoveryQuickSelectProps {
  group: DiscoveryQuickSelectGroupModel;
  value: string | string[];
  note: string;
  onSelect: (value: string) => void;
  onNote: (value: string) => void;
}

export function DiscoveryQuickSelect({ group, value, note, onSelect, onNote }: DiscoveryQuickSelectProps) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const otherActive = selected.includes("other");
  const noteField = <label className="mt-3 block"><span className="mb-2 block text-[11px] font-semibold text-slate-300">{otherActive ? "Other — describe the customer-specific answer" : group.notePrompt}</span><textarea aria-label={`${group.label} notes`} className="min-h-20 w-full rounded-xl border border-white/[0.1] bg-[#03090e] px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-slate-600 focus-visible:border-cyan-200/50 focus-visible:ring-2 focus-visible:ring-cyan-200/20" value={note} placeholder="Optional customer nuance or presenter override" onChange={(event) => onNote(event.target.value)} /></label>;

  return <fieldset className="rounded-2xl border border-white/[0.08] bg-black/15 p-4 sm:p-5" data-discovery-group={group.id}>
    <legend className="px-1 text-sm font-semibold text-white">{group.label}</legend>
    <p className="mt-1 text-sm leading-5 text-slate-300">{group.question}</p>
    <p className="mt-1 text-[11px] leading-4 text-slate-500">{group.whyItMatters}</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2" role={group.selection === "single" ? "radiogroup" : "group"} aria-label={group.label}>
      {group.options.map((option, optionIndex) => {
        const active = selected.includes(option.value);
        return <button key={option.value} type="button" role={group.selection === "single" ? "radio" : undefined} tabIndex={group.selection === "single" ? active || (!selected.length && optionIndex === 0) ? 0 : -1 : undefined} aria-checked={group.selection === "single" ? active : undefined} aria-pressed={group.selection === "multi" ? active : undefined} onClick={() => onSelect(option.value)} onKeyDown={group.selection === "single" ? moveRadioSelection : undefined} className={`min-h-12 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${active ? "border-cyan-200/50 bg-cyan-200/[0.13] text-cyan-50" : option.kind === "not-sure" ? "border-amber-200/15 bg-amber-200/[0.035] text-amber-50/80 hover:border-amber-200/30" : option.kind === "other" ? "border-violet-200/15 bg-violet-200/[0.035] text-violet-50/80 hover:border-violet-200/30" : "border-white/[0.09] bg-[#071016] text-slate-200 hover:border-white/20"}`}>
          <span className="block text-xs font-semibold">{option.label}</span>{option.description ? <span className="mt-1 block text-[10px] leading-4 text-slate-500">{option.description}</span> : null}
        </button>;
      })}
    </div>
    {otherActive ? noteField : <details className="mt-3 rounded-xl border border-white/[0.06] bg-black/10"><summary className="min-h-11 cursor-pointer list-none px-3 py-3 text-xs font-semibold text-cyan-100/70 outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60">{note ? "Edit nuance or override" : "Add nuance or override"}</summary><div className="border-t border-white/[0.06] px-3 pb-3">{noteField}</div></details>}
  </fieldset>;
}

function moveRadioSelection(event: KeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const radios = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
  const currentIndex = radios.indexOf(event.currentTarget);
  if (currentIndex < 0 || radios.length === 0) return;
  event.preventDefault();
  const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  const next = radios[(currentIndex + direction + radios.length) % radios.length];
  next.focus();
  next.click();
}

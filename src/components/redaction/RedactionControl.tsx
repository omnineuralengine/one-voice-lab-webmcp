"use client";

import { useId } from "react";

import { ActionButton, FieldHint } from "@/components/lab-card";
import {
  REDACTION_PRESETS,
  evaluateRedactionCompatibility,
  redactionQueryString,
  serializeRedactionValues,
  type RedactionPolicy,
  type RedactionPresetId,
} from "@/lib/redaction";

type RedactionControlProps = {
  policy: RedactionPolicy;
  onChange: (policy: RedactionPolicy) => void;
  onOpenLab?: () => void;
  mode: "prerecorded" | "streaming";
  language: string;
  disabled?: boolean;
  compact?: boolean;
};

function presetForPolicy(policy: RedactionPolicy): RedactionPresetId {
  const values = serializeRedactionValues(policy);
  return REDACTION_PRESETS.find((preset) => {
    const presetValues = serializeRedactionValues(preset.policy);
    return values.length === presetValues.length && values.every((value, index) => value === presetValues[index]);
  })?.id ?? "custom";
}

export function RedactionControl({ policy, onChange, onOpenLab, mode, language, disabled = false, compact = false }: RedactionControlProps) {
  const id = useId();
  const selected = presetForPolicy(policy);
  const enabled = serializeRedactionValues(policy).length > 0;
  const compatibility = evaluateRedactionCompatibility({ deployment: "hosted", mode, language, projectSurface: "listen" });
  const query = redactionQueryString(policy);

  return (
    <section className="rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3" aria-labelledby={`${id}-label`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p id={`${id}-label`} className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Transcript redaction</p>
          <FieldHint>Changes transcript output only. The original audio remains unchanged.</FieldHint>
        </div>
        {onOpenLab ? <ActionButton variant="secondary" onClick={onOpenLab}>Open in Redaction Lab</ActionButton> : null}
      </div>
      <label className="mt-3 block">
        <span className="sr-only">Redaction policy</span>
        <select
          value={selected}
          disabled={disabled}
          onChange={(event) => {
            const preset = REDACTION_PRESETS.find((candidate) => candidate.id === event.target.value);
            if (preset) onChange({ profiles: [...preset.policy.profiles], entities: [...preset.policy.entities] });
          }}
          className="min-h-10 w-full rounded-md border border-white/10 bg-[#070b0f] px-3 text-sm text-slate-100 focus:border-cyan-200/50 focus:outline-none"
        >
          {REDACTION_PRESETS.filter((preset) => preset.id !== "custom" || selected === "custom").map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </label>
      {enabled ? (
        <div className={`mt-3 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
          <p className="rounded-md border border-white/10 bg-black/20 p-2 font-mono text-xs text-cyan-100" data-testid="redaction-query-preview">
            {query || "No redact parameters"}
          </p>
          <p className={`rounded-md border p-2 text-xs ${compatibility.supported ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-amber-300/25 bg-amber-300/[0.07] text-amber-100"}`} role={compatibility.supported ? "status" : "alert"}>
            {compatibility.supported ? "Compatible: " : "Blocked: "}{compatibility.reason}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Off — no <code>redact</code> query values will be sent.</p>
      )}
    </section>
  );
}

"use client";

import { useState, type ReactNode } from "react";

import { CodeIcon, DownloadIcon, PlusIcon, TrashIcon } from "@/components/icons";
import {
  ARCHITECTURE_OPTIONS,
  AUDIO_SOURCE_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  DEEPGRAM_PRODUCT_OPTIONS,
  OUTPUT_DESTINATION_OPTIONS,
  RECIPE_PRESETS,
  SECURITY_POSTURE_OPTIONS,
  type ArchitectureId,
  type AudioSourceId,
  type ClientTypeId,
  type DeepgramProductId,
  type InsertionLayer,
  type InsertionPattern,
  type IntegrationPlan,
  type IntegrationRecipe,
  type OutputDestinationId,
  type RecipePreset,
  type SecurityPostureId,
} from "@/lib/code-lab-recipes";

type CustomPatternDraft = {
  name: string;
  layer: InsertionLayer;
  purpose: string;
  risks: string;
  filesTouched: string;
  codeSnippetReference: string;
};

const EMPTY_PATTERN: CustomPatternDraft = {
  name: "",
  layer: "backend",
  purpose: "",
  risks: "",
  filesTouched: "",
  codeSnippetReference: "",
};

export function IntegrationRecipeBuilder({
  recipe,
  patterns,
  plan,
  generationMessage,
  onRecipeChange,
  onPresetSelect,
  onTogglePattern,
  onAddCustomPattern,
  onDeleteCustomPattern,
  onGenerateStarterFiles,
  onExportJson,
  onDownloadMarkdown,
}: {
  recipe: IntegrationRecipe;
  patterns: readonly InsertionPattern[];
  plan: IntegrationPlan;
  generationMessage?: string;
  onRecipeChange: (recipe: IntegrationRecipe) => void;
  onPresetSelect: (preset: RecipePreset) => void;
  onTogglePattern: (patternId: string) => void;
  onAddCustomPattern: (pattern: InsertionPattern) => void;
  onDeleteCustomPattern: (patternId: string) => void;
  onGenerateStarterFiles: () => void;
  onExportJson: () => void;
  onDownloadMarkdown: () => void;
}) {
  const [showCustomPatternForm, setShowCustomPatternForm] = useState(false);
  const [customPattern, setCustomPattern] = useState<CustomPatternDraft>(EMPTY_PATTERN);

  function updateRecipe<Key extends keyof IntegrationRecipe>(key: Key, value: IntegrationRecipe[Key]) {
    onRecipeChange({ ...recipe, [key]: value });
  }

  function toggleSecurityPosture(id: SecurityPostureId) {
    const selected = recipe.securityPostures.includes(id);
    updateRecipe(
      "securityPostures",
      selected ? recipe.securityPostures.filter((value) => value !== id) : [...recipe.securityPostures, id],
    );
  }

  function submitCustomPattern() {
    if (!customPattern.name.trim() || !customPattern.purpose.trim()) return;

    onAddCustomPattern({
      id: `custom-${Date.now().toString(36)}`,
      name: customPattern.name.trim(),
      layer: customPattern.layer,
      purpose: customPattern.purpose.trim(),
      risks: splitList(customPattern.risks, "Review privacy, validation, and failure handling."),
      filesTouched: splitList(customPattern.filesTouched, "custom integration file"),
      codeSnippetReference: customPattern.codeSnippetReference.trim() || "Custom learning snippet",
      removable: true,
      custom: true,
    });
    setCustomPattern(EMPTY_PATTERN);
    setShowCustomPatternForm(false);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#05080d]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#071018] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Integration Recipe Builder</p>
          <p className="mt-1 text-sm text-slate-400">Model where Deepgram belongs in a customer stack without executing code.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={onGenerateStarterFiles} icon={<CodeIcon className="size-4" />} emphasized>
            Generate Starter Files
          </ActionButton>
          <ActionButton onClick={onExportJson} icon={<DownloadIcon className="size-4" />}>
            Export Recipe JSON
          </ActionButton>
          <ActionButton onClick={onDownloadMarkdown} icon={<DownloadIcon className="size-4" />}>
            Download Recipe Markdown
          </ActionButton>
        </div>
      </div>

      {generationMessage ? (
        <div className="border-b border-emerald-200/15 bg-emerald-300/[0.06] px-4 py-2 text-xs text-emerald-100" role="status">
          {generationMessage}
        </div>
      ) : null}

      <section className="border-b border-white/10 px-4 py-4">
        <SectionHeading title="Scenario presets" subtitle="Load a realistic client recipe, then edit any field or file." />
        <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {RECIPE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPresetSelect(preset)}
              className="min-h-20 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left transition hover:border-cyan-200/30 hover:bg-cyan-200/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-200/60"
            >
              <span className="text-xs font-semibold text-white">{preset.name}</span>
              <span className="mt-1 block text-[11px] leading-4 text-slate-500">{preset.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-b border-white/10 px-4 py-4">
        <SectionHeading title="Recipe inputs" subtitle="Every change regenerates the plan, flow, suggested files, and inspector snapshot." />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <RecipeSelect
            label="Client type"
            value={recipe.clientType}
            options={CLIENT_TYPE_OPTIONS}
            onChange={(value) => updateRecipe("clientType", value as ClientTypeId)}
          />
          <RecipeSelect
            label="App architecture"
            value={recipe.architecture}
            options={ARCHITECTURE_OPTIONS}
            onChange={(value) => updateRecipe("architecture", value as ArchitectureId)}
          />
          <RecipeSelect
            label="Audio source"
            value={recipe.audioSource}
            options={AUDIO_SOURCE_OPTIONS}
            onChange={(value) => updateRecipe("audioSource", value as AudioSourceId)}
          />
          <RecipeSelect
            label="Deepgram product"
            value={recipe.deepgramProduct}
            options={DEEPGRAM_PRODUCT_OPTIONS}
            onChange={(value) => updateRecipe("deepgramProduct", value as DeepgramProductId)}
          />
          <RecipeSelect
            label="Output destination"
            value={recipe.outputDestination}
            options={OUTPUT_DESTINATION_OPTIONS}
            onChange={(value) => updateRecipe("outputDestination", value as OutputDestinationId)}
          />
          {recipe.clientType === "custom" ? (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Custom client type</span>
              <input
                value={recipe.customClientType || ""}
                onChange={(event) => updateRecipe("customClientType", event.target.value)}
                placeholder="Customer workflow"
                className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/45"
              />
            </label>
          ) : null}
        </div>

        <fieldset className="mt-4">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Security posture</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {SECURITY_POSTURE_OPTIONS.map((option) => {
              const checked = recipe.securityPostures.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition ${
                    checked ? "border-emerald-200/25 bg-emerald-200/[0.07] text-emerald-50" : "border-white/10 bg-white/[0.025] text-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSecurityPosture(option.id)}
                    className="size-4 accent-emerald-300"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <div className="grid border-b border-white/10 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section className="border-b border-white/10 px-4 py-4 xl:border-r xl:border-b-0">
          <SectionHeading title="Integration Plan" subtitle={plan.summary} />
          <PlanGroup title="Recommended placement" items={plan.recommendedPlacement} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PlanGroup title="Required files" items={plan.requiredFiles} mono />
            <PlanGroup title="API routes" items={plan.apiRoutes.length ? plan.apiRoutes : ["No API route required for this recipe."]} mono />
            <PlanGroup title="Snippet references" items={plan.recommendedSnippets.length ? plan.recommendedSnippets : ["Architecture starter templates"]} />
            <PlanGroup title="Payload paths to inspect" items={plan.payloadPaths} mono />
          </div>
          <PlanGroup title="Security notes" items={[...plan.securityNotes, ...plan.warnings.map((warning) => `Warning: ${warning}`)]} security />
        </section>

        <section className="px-4 py-4">
          <SectionHeading title="Flow diagram" subtitle="Blocks update from the selected architecture, audio source, product, and destination." />
          <div className="mt-4 flex flex-wrap items-stretch gap-2">
            {plan.flow.map((block, index) => (
              <div key={block.id} className="contents">
                <div className={`min-w-32 flex-1 rounded-md border px-3 py-2 ${flowTone(block.kind)}`}>
                  <p className="text-xs font-semibold text-white">{block.label}</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">{block.detail}</p>
                </div>
                {index < plan.flow.length - 1 ? <span className="self-center text-lg text-cyan-200/45" aria-hidden="true">-&gt;</span> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading title="Insertion Patterns" subtitle="Enable implementation patterns that should appear in the generated plan and file tree." />
          <ActionButton onClick={() => setShowCustomPatternForm((value) => !value)} icon={<PlusIcon className="size-4" />}>
            Add custom pattern
          </ActionButton>
        </div>

        {showCustomPatternForm ? (
          <div className="mt-3 grid gap-3 border-y border-cyan-200/15 bg-cyan-200/[0.035] py-3 md:grid-cols-2 xl:grid-cols-3">
            <TextField label="Pattern name" value={customPattern.name} onChange={(value) => setCustomPattern((current) => ({ ...current, name: value }))} />
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Layer</span>
              <select
                value={customPattern.layer}
                onChange={(event) => setCustomPattern((current) => ({ ...current, layer: event.target.value as InsertionLayer }))}
                className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-200/45"
              >
                {(["frontend", "backend", "api-route", "worker", "cli", "database", "external-system"] as InsertionLayer[]).map((layer) => (
                  <option key={layer} value={layer} className="bg-slate-950">{layer}</option>
                ))}
              </select>
            </label>
            <TextField label="Purpose" value={customPattern.purpose} onChange={(value) => setCustomPattern((current) => ({ ...current, purpose: value }))} />
            <TextField label="Risks (comma separated)" value={customPattern.risks} onChange={(value) => setCustomPattern((current) => ({ ...current, risks: value }))} />
            <TextField label="Files touched (comma separated)" value={customPattern.filesTouched} onChange={(value) => setCustomPattern((current) => ({ ...current, filesTouched: value }))} />
            <TextField label="Snippet reference" value={customPattern.codeSnippetReference} onChange={(value) => setCustomPattern((current) => ({ ...current, codeSnippetReference: value }))} />
            <div className="flex gap-2 md:col-span-2 xl:col-span-3">
              <ActionButton onClick={submitCustomPattern} icon={<PlusIcon className="size-4" />} emphasized disabled={!customPattern.name.trim() || !customPattern.purpose.trim()}>
                Add pattern
              </ActionButton>
              <ActionButton onClick={() => { setCustomPattern(EMPTY_PATTERN); setShowCustomPatternForm(false); }}>Cancel</ActionButton>
            </div>
          </div>
        ) : null}

        <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
          {patterns.map((pattern) => {
            const selected = recipe.selectedPatternIds.includes(pattern.id);
            return (
              <div key={pattern.id} className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] lg:items-center">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={selected} onChange={() => onTogglePattern(pattern.id)} className="mt-0.5 size-4 accent-cyan-300" />
                  <span>
                    <span className="block text-sm font-semibold text-white">{pattern.name}</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100/60">{pattern.layer}</span>
                  </span>
                </label>
                <div className="grid gap-2 text-xs leading-5 text-slate-400 sm:grid-cols-2">
                  <p><span className="text-slate-500">Purpose:</span> {pattern.purpose}</p>
                  <p><span className="text-slate-500">Files:</span> {pattern.filesTouched.join(", ")}</p>
                  <p><span className="text-slate-500">Risks:</span> {pattern.risks.join(", ")}</p>
                  <p><span className="text-slate-500">Snippet:</span> {pattern.codeSnippetReference}</p>
                </div>
                {pattern.custom ? (
                  <button
                    type="button"
                    onClick={() => onDeleteCustomPattern(pattern.id)}
                    title={`Delete ${pattern.name}`}
                    aria-label={`Delete ${pattern.name}`}
                    className="grid size-9 place-items-center rounded-md border border-rose-300/15 bg-rose-300/[0.05] text-rose-200 hover:bg-rose-300/10"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RecipeSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-200/45"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} className="bg-slate-950">{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-200/45"
      />
    </label>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function PlanGroup({ title, items, mono = false, security = false }: { title: string; items: string[]; mono?: boolean; security?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className={`text-xs leading-5 ${security ? "text-emerald-100" : "text-slate-300"} ${mono ? "font-mono" : ""}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ActionButton({ children, icon, onClick, emphasized = false, disabled = false }: { children: string; icon?: ReactNode; onClick: () => void; emphasized?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
        emphasized
          ? "border-cyan-200/25 bg-cyan-200/10 text-cyan-100 hover:bg-cyan-200 hover:text-slate-950"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.09] hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function flowTone(kind: string) {
  if (kind === "deepgram") return "border-cyan-200/30 bg-cyan-200/[0.08]";
  if (kind === "trust-boundary") return "border-emerald-200/25 bg-emerald-200/[0.06]";
  if (kind === "destination") return "border-fuchsia-200/25 bg-fuchsia-200/[0.06]";
  return "border-white/10 bg-white/[0.035]";
}

function splitList(value: string, fallback: string) {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : [fallback];
}

"use client";

import { EVALUATION_PRESETS, type EvaluationPreset } from "@/lib/evaluation/presets";
import type { EvaluationScenario } from "@/lib/evaluation/schema";

export function ScenarioPanel({
  text,
  source,
  selectedPresetId,
  maximumLength,
  disabled,
  onPreset,
  onCustom,
  onText,
}: {
  text: string;
  source: EvaluationScenario["source"];
  selectedPresetId: string | null;
  maximumLength: number;
  disabled: boolean;
  onPreset: (preset: EvaluationPreset) => void;
  onCustom: () => void;
  onText: (text: string) => void;
}) {
  const count = text.length;
  const hasOuterWhitespace = text.length > 0 && text !== text.trim();
  const invalid = text.trim().length === 0 || hasOuterWhitespace || count > maximumLength;
  const sourceLabel = {
    preset: "Versioned preset",
    "customized-preset": "Customized preset",
    custom: "Fully custom",
  }[source];

  return (
    <div className="evaluate-scenario">
      <div className="evaluate-section-intro">
        <div>
          <p className="evaluate-kicker">01 · Scenario</p>
          <h2>Choose one canonical script</h2>
        </div>
        <span className={`evaluate-chip evaluate-chip--${source === "preset" ? "green" : "purple"}`}>
          {sourceLabel}
        </span>
      </div>

      <div aria-label="Versioned scenario presets" className="evaluate-preset-grid">
        {EVALUATION_PRESETS.map((preset) => (
          <button
            aria-pressed={selectedPresetId === preset.id && source !== "custom"}
            className="evaluate-preset"
            disabled={disabled}
            key={preset.id}
            onClick={() => onPreset(preset)}
            type="button"
          >
            <strong>{preset.name}</strong>
            <span>{preset.purpose}</span>
            <small>v{preset.version}</small>
          </button>
        ))}
      </div>

      <div className="evaluate-editor-heading">
        <label htmlFor="evaluate-script">Test script</label>
        <button disabled={disabled} onClick={onCustom} type="button">Start fully custom</button>
      </div>
      <textarea
        aria-describedby="evaluate-script-help evaluate-script-count"
        aria-invalid={invalid}
        disabled={disabled}
        id="evaluate-script"
        maxLength={maximumLength + 1}
        onChange={(event) => onText(event.target.value)}
        rows={6}
        value={text}
      />
      <div className="evaluate-editor-meta">
        <p id="evaluate-script-help">
          The exact text and its content hash become part of the private evidence bundle.
        </p>
        <p aria-live="polite" className={count > maximumLength ? "is-invalid" : ""} id="evaluate-script-count">
          {count.toLocaleString()} / {maximumLength.toLocaleString()}
        </p>
      </div>
      <p className="evaluate-privacy-note">
        Use non-sensitive text only—no personal, confidential, or regulated content. Phase 1 runs are private and ephemeral; scripts, audio, and ratings are not sent to analytics.
      </p>
      {invalid ? (
        <p className="evaluate-inline-error" role="alert">
          {text.trim().length === 0
            ? "Enter a script before running."
            : hasOuterWhitespace
              ? "Remove leading or trailing whitespace so the recorded script exactly matches the provider input."
              : `Shorten the script to ${maximumLength} characters or fewer.`}
        </p>
      ) : null}
      {selectedPresetId ? (
        <details className="evaluate-disclosure">
          <summary>Preset method note</summary>
          <p>{EVALUATION_PRESETS.find((preset) => preset.id === selectedPresetId)?.notes.join(" ")}</p>
        </details>
      ) : null}
    </div>
  );
}

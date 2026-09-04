"use client";

import type { EvaluationExecutionMode, EvaluationMode } from "@/lib/evaluation/schema";
import type { ProviderId } from "@/lib/providers/types";

import { providerName } from "@/components/evaluate/client";
import type {
  AdvancedControl,
  EvaluateCatalog,
  EvaluateProviderCapability,
  ProviderDraft,
} from "@/components/evaluate/types";

export function ProviderConfigurator({
  capabilities,
  catalogs,
  catalogErrors,
  selected,
  evaluationMode,
  executionMode,
  disabled,
  onToggle,
  onDraft,
  onRetryCatalog,
}: {
  capabilities: readonly EvaluateProviderCapability[];
  catalogs: Readonly<Partial<Record<ProviderId, EvaluateCatalog>>>;
  catalogErrors: Readonly<Partial<Record<ProviderId, string>>>;
  selected: readonly ProviderDraft[];
  evaluationMode: EvaluationMode;
  executionMode: EvaluationExecutionMode;
  disabled: boolean;
  onToggle: (providerId: ProviderId, checked: boolean) => void;
  onDraft: (providerId: ProviderId, patch: Partial<ProviderDraft>) => void;
  onRetryCatalog: (providerId: ProviderId) => void;
}) {
  return (
    <div className="evaluate-providers">
      <div className="evaluate-section-intro">
        <div>
          <p className="evaluate-kicker">02 · Voices</p>
          <h2>Select two to four providers</h2>
        </div>
        <span className="evaluate-selection-count" aria-live="polite">{selected.length} selected</span>
      </div>

      {capabilities.length ? (
        <div className="evaluate-provider-list">
          {capabilities.map((provider) => {
            const draft = selected.find((item) => item.providerId === provider.id);
            const catalog = catalogs[provider.id];
            const available = executionMode === "fixture"
              ? provider.fixtureAvailable
              : executionMode === "local-live"
                ? provider.localLiveAvailable
                : provider.protectedLiveAvailable;
            const selectionDisabled = disabled || (!draft && (selected.length >= 4 || !available));
            return (
              <article className="evaluate-provider-setup" data-provider={provider.id} key={provider.id}>
                <div className="evaluate-provider-choice">
                  <label>
                    <input
                      checked={Boolean(draft)}
                      disabled={selectionDisabled}
                      onChange={(event) => onToggle(provider.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{provider.displayName || providerName(provider.id)}</strong>
                      <small>{provider.implementation}</small>
                    </span>
                  </label>
                  <Readiness provider={provider} />
                  <span className="evaluate-catalog-mode">{executionMode === "fixture" ? "Fixture catalog" : executionMode === "local-live" ? "Local live catalog" : "Protected live catalog"}</span>
                </div>

                {!available ? (
                  <p className="evaluate-availability-note">
                    {executionMode === "fixture"
                      ? "No fixture-backed evidence is available for this provider."
                      : "Protected live execution is not enabled for this provider."}
                  </p>
                ) : null}

                {draft ? (
                  <div className="evaluate-provider-fields">
                    {catalog ? (
                      <>
                        <label>
                          <span>Exact model</span>
                          <select
                            disabled={disabled || catalog.source === "unavailable"}
                            onChange={(event) => {
                              const model = event.target.value;
                              const voiceFollowsModel = !catalog.separateVoiceRequired
                                && catalog.voices.some((voice) => voice.id === model);
                              onDraft(provider.id, voiceFollowsModel ? { model, voice: model } : { model });
                            }}
                            value={draft.model}
                          >
                            <option value="">Choose a validated model</option>
                            {catalog.models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.id}{executionMode === "fixture" ? " · fixture" : ""}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Exact voice</span>
                          <select
                            disabled={disabled || catalog.source === "unavailable" || (!catalog.separateVoiceRequired && catalog.voices.some((voice) => voice.id === draft.model))}
                            onChange={(event) => onDraft(provider.id, { voice: event.target.value })}
                            value={draft.voice}
                          >
                            <option value="">Choose a validated voice</option>
                            {catalog.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.id}{executionMode === "fixture" ? " · fixture" : ""}</option>)}
                          </select>
                        </label>
                        <div className="evaluate-format-note">
                          <p><strong>Exact upstream request format</strong> {catalog.outputFormat}</p>
                          <p><strong>ONE normalized playback</strong> {catalog.normalizedOutput ? `${catalog.normalizedOutput.encoding} · ${catalog.normalizedOutput.sampleRate.toLocaleString()} Hz · ${catalog.normalizedOutput.channels === 1 ? "mono" : `${catalog.normalizedOutput.channels} channels`} · ${catalog.normalizedOutput.mimeType}${catalog.normalizedOutput.serverWrapped ? " · server-wrapped" : ""}` : "Unavailable — this catalog cannot run."}</p>
                        </div>
                        <p className={catalog.source === "unavailable" ? "evaluate-availability-note" : "evaluate-loading-note"} role={catalog.source === "unavailable" ? "status" : undefined}>
                          {catalog.message}
                        </p>
                        <details className="evaluate-disclosure">
                          <summary>Catalog provenance and limitations</summary>
                          <div>
                            <p><strong>Source:</strong> {catalog.source}. <strong>Voices shown:</strong> {catalog.voices.length}{catalog.hasMoreVoices ? " (more exist upstream and are intentionally not loaded)" : ""}.</p>
                            <ul>{catalog.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
                          </div>
                        </details>
                        <AdvancedControls
                          catalog={catalog}
                          disabled={disabled}
                          draft={draft}
                          evaluationMode={evaluationMode}
                          onDraft={(patch) => onDraft(provider.id, patch)}
                        />
                      </>
                    ) : (
                      <div aria-live="polite" className={catalogErrors[provider.id] ? "evaluate-catalog-error" : "evaluate-loading-note"}>
                        <p>{catalogErrors[provider.id] ?? "Loading validated models and voices…"}</p>
                        {catalogErrors[provider.id] ? <button onClick={() => onRetryCatalog(provider.id)} type="button">Retry catalog</button> : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="evaluate-loading-note" role="status">Loading provider readiness without making provider calls…</p>
      )}
    </div>
  );
}

function Readiness({ provider }: { provider: EvaluateProviderCapability }) {
  const states = [
    ["Listed", provider.readiness.listed],
    ["Configured", provider.readiness.configured],
    ["Adapter-backed", provider.readiness.adapterBacked],
    ["Live-enabled", provider.readiness.liveEnabled],
  ] as const;
  return (
    <ul aria-label={`${provider.displayName} readiness`} className="evaluate-readiness">
      {states.map(([label, ready]) => (
        <li className={ready ? "is-ready" : "is-unavailable"} key={label}>
          <span aria-hidden="true" />{label}: {ready ? "yes" : "no"}
        </li>
      ))}
    </ul>
  );
}

function AdvancedControls({
  catalog,
  draft,
  evaluationMode,
  disabled,
  onDraft,
}: {
  catalog: EvaluateCatalog;
  draft: ProviderDraft;
  evaluationMode: EvaluationMode;
  disabled: boolean;
  onDraft: (patch: Partial<ProviderDraft>) => void;
}) {
  const update = (control: AdvancedControl, value: string | number | boolean) => {
    onDraft({
      providerSpecificConfiguration: {
        ...draft.providerSpecificConfiguration,
        [control.id]: value,
      },
    });
  };
  return (
    <details className="evaluate-disclosure evaluate-provider-advanced">
      <summary>Provider-native advanced settings</summary>
      <div>
        <p className="evaluate-comparison-warning">
          These controls are not equivalent across providers. ONE records each exact value and keeps them outside Standardized mode.
        </p>
        {evaluationMode === "standardized" ? (
          <p className="evaluate-loading-note">Switch to Provider-optimized mode to use validated native settings.</p>
        ) : catalog.advancedControls.length ? (
          catalog.advancedControls.map((control) => (
            <AdvancedField
              control={control}
              disabled={disabled}
              key={control.id}
              onChange={(value) => update(control, value)}
              value={primitiveControlValue(draft.providerSpecificConfiguration[control.id]) ?? control.defaultValue}
            />
          ))
        ) : (
          <p className="evaluate-loading-note">This adapter exposes no validated provider-native controls in Phase 1.</p>
        )}
      </div>
    </details>
  );
}

function primitiveControlValue(value: ProviderDraft["providerSpecificConfiguration"][string]) {
  return Array.isArray(value) ? undefined : value;
}

function AdvancedField({
  control,
  value,
  disabled,
  onChange,
}: {
  control: AdvancedControl;
  value: string | number | boolean | null | undefined;
  disabled: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  if (control.kind === "boolean") {
    return (
      <label className="evaluate-native-toggle">
        <input checked={value === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span><strong>{control.label}</strong><small>{control.comparisonNote}</small></span>
      </label>
    );
  }
  return (
    <label className="evaluate-native-field">
      <span>{control.label}</span>
      {control.kind === "select" ? (
        <select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={String(value ?? "")}>
          {(control.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      ) : (
        <input
          disabled={disabled}
          max={control.max}
          min={control.min}
          onChange={(event) => onChange(control.kind === "number" ? event.target.valueAsNumber : event.target.value)}
          step={control.step}
          type={control.kind === "number" ? "number" : "text"}
          value={typeof value === "boolean" ? "" : value ?? ""}
        />
      )}
      <small>{control.comparisonNote}</small>
    </label>
  );
}

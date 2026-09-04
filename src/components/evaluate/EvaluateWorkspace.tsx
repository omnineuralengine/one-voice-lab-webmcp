"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { EvidenceControls } from "@/components/evaluate/EvidenceControls";
import { ProviderConfigurator } from "@/components/evaluate/ProviderConfigurator";
import { ResultCard } from "@/components/evaluate/ResultCard";
import { ScenarioPanel } from "@/components/evaluate/ScenarioPanel";
import {
  fetchEvaluationCapabilities,
  fetchEvaluationCatalog,
  providerName,
  runEvaluation,
} from "@/components/evaluate/client";
import {
  emptyRunState,
  type ClientResult,
  type ClientRunState,
  type EvaluateCapabilities,
  type EvaluateCatalog,
  type ProviderDraft,
} from "@/components/evaluate/types";
import { downloadEvidenceBundle } from "@/lib/evaluation/evidence";
import { EVALUATION_PRESETS, type EvaluationPreset } from "@/lib/evaluation/presets";
import {
  EVALUATION_MAX_TEXT_LENGTH,
  EVALUATION_METRIC_VERSION,
  EVALUATION_SCHEMA_VERSION,
  type EvaluationEvidenceBundle,
  type EvaluationExecutionMode,
  type EvaluationMode,
  type EvaluationProviderEvidence,
  type EvaluationScenario,
  type EvaluationStreamEvent,
  type HumanRating,
} from "@/lib/evaluation/schema";
import type { ProviderId } from "@/lib/providers/types";

const INITIAL_PRESET = EVALUATION_PRESETS[0];

export function EvaluateWorkspace() {
  const [capabilities, setCapabilities] = useState<EvaluateCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [catalogs, setCatalogs] = useState<Partial<Record<ProviderId, EvaluateCatalog>>>({});
  const [catalogErrors, setCatalogErrors] = useState<Partial<Record<ProviderId, string>>>({});
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [selected, setSelected] = useState<ProviderDraft[]>([]);
  const [text, setText] = useState(INITIAL_PRESET.text);
  const [source, setSource] = useState<EvaluationScenario["source"]>("preset");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(INITIAL_PRESET.id);
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>("standardized");
  const [executionMode, setExecutionMode] = useState<EvaluationExecutionMode>("fixture");
  const [blindEnabled, setBlindEnabled] = useState(false);
  const [blindRunActive, setBlindRunActive] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revealedAt, setRevealedAt] = useState<string | null>(null);
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<ClientRunState>(emptyRunState);
  const [results, setResults] = useState<ClientResult[]>([]);
  const [ratings, setRatings] = useState<Partial<Record<ProviderId, HumanRating>>>({});
  const [bundle, setBundle] = useState<EvaluationEvidenceBundle | null>(null);
  const [inspectionOnly, setInspectionOnly] = useState(false);
  const [resultsStale, setResultsStale] = useState(false);
  const [message, setMessage] = useState("Fixture mode is ready. Nothing runs until you confirm.");
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const capabilityControllerRef = useRef<AbortController | null>(null);
  const initializedProvidersRef = useRef(false);
  const catalogLoadsRef = useRef(new Set<string>());
  const catalogControllerRef = useRef(new AbortController());
  const audioUrlsRef = useRef(new Set<string>());
  const audioRefsRef = useRef(new Map<ProviderId, HTMLAudioElement>());
  const playableMeasuredRef = useRef(new Set<ProviderId>());
  const runStartedRef = useRef(0);
  const activeBlindRef = useRef(false);
  const runTokenRef = useRef<symbol | null>(null);

  const maximumLength = Math.min(capabilities?.maximumTextLength ?? EVALUATION_MAX_TEXT_LENGTH, EVALUATION_MAX_TEXT_LENGTH);
  const orderedCapabilities = useMemo(
    () => [...(capabilities?.providers ?? [])].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [capabilities?.providers],
  );
  const selectedKey = selected.map((draft) => draft.providerId).join(":");
  const resultBlindEnabled = bundle?.blind.enabled ?? ((blindRunActive || running || results.length > 0) ? blindRunActive : false);
  const blindUnrevealed = resultBlindEnabled && (blindRunActive || running || results.length > 0) && !revealed;

  const loadCapabilities = useCallback(async () => {
    capabilityControllerRef.current?.abort();
    const controller = new AbortController();
    capabilityControllerRef.current = controller;
    try {
      const next = await fetchEvaluationCapabilities(controller.signal);
      setCapabilityError("");
      setCapabilities(next);
      setMessage("Provider readiness loaded. Catalogs use fixture metadata until you choose a protected live mode.");
      if (!initializedProvidersRef.current) {
        initializedProvidersRef.current = true;
        setSelected(defaultDrafts(next, "fixture"));
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      setCapabilityError(errorMessage(caught, "Provider readiness is unavailable."));
    }
    if (capabilityControllerRef.current === controller) capabilityControllerRef.current = null;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    capabilityControllerRef.current = controller;
    void fetchEvaluationCapabilities(controller.signal)
      .then((next) => {
        setCapabilities(next);
        setCapabilityError("");
        setMessage("Provider readiness loaded. Catalogs use fixture metadata until you choose a protected live mode.");
        if (!initializedProvidersRef.current) {
          initializedProvidersRef.current = true;
          setSelected(defaultDrafts(next, "fixture"));
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setCapabilityError(errorMessage(caught, "Provider readiness is unavailable."));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (inspectionOnly) return;
    const providerIds = selectedKey ? selectedKey.split(":") as ProviderId[] : [];
    const catalogController = catalogControllerRef.current;
    for (const providerId of providerIds) {
      const loadKey = `${executionMode}:${providerId}`;
      if (catalogLoadsRef.current.has(loadKey)) continue;
      catalogLoadsRef.current.add(loadKey);
      void fetchEvaluationCatalog(providerId, executionMode, catalogController.signal)
        .then((catalog) => {
          setCatalogs((current) => ({ ...current, [providerId]: catalog }));
          if (executionMode !== "fixture") setPaidConfirmed(false);
          setResultsStale(true);
          setSelected((current) => current.map((item) => item.providerId === providerId
            ? {
                ...item,
                model: catalog.models.some((model) => model.id === item.model) ? item.model : catalog.models[0]?.id ?? "",
                voice: catalog.voices.some((voice) => voice.id === item.voice) ? item.voice : catalog.voices[0]?.id ?? "",
                outputFormat: catalog.outputFormat,
                providerSpecificConfiguration: defaultsFor(catalog),
              }
            : item));
        })
        .catch((caught) => {
          if (catalogController.signal.aborted) return;
          setCatalogErrors((current) => ({
            ...current,
            [providerId]: errorMessage(caught, `${providerName(providerId)} catalog is unavailable.`),
          }));
        });
    }
    // `selectedKey` tracks provider membership without refetching after model/voice edits.
  }, [catalogEpoch, executionMode, inspectionOnly, selectedKey]);

  useEffect(() => () => {
    abortRef.current?.abort();
    capabilityControllerRef.current?.abort();
    catalogControllerRef.current.abort();
    revokeAudioUrls(audioUrlsRef.current);
  }, []);

  function choosePreset(preset: EvaluationPreset) {
    setPaidConfirmed(false);
    setResultsStale(true);
    setSelectedPresetId(preset.id);
    setSource("preset");
    setText(preset.text);
  }

  function updateText(next: string) {
    setPaidConfirmed(false);
    setResultsStale(true);
    setText(next);
    const preset = EVALUATION_PRESETS.find((candidate) => candidate.id === selectedPresetId);
    setSource(preset ? (next === preset.text ? "preset" : "customized-preset") : "custom");
  }

  function startCustom() {
    setPaidConfirmed(false);
    setResultsStale(true);
    setSelectedPresetId(null);
    setSource("custom");
    setText("");
  }

  function changeExecutionMode(next: EvaluationExecutionMode) {
    setInspectionOnly(false);
    setResultsStale(true);
    setExecutionMode(next);
    if (next !== "fixture") setEvaluationMode("standardized");
    setPaidConfirmed(false);
    setCatalogs({});
    setCatalogErrors({});
    catalogControllerRef.current.abort();
    catalogControllerRef.current = new AbortController();
    catalogLoadsRef.current.clear();
    setCatalogEpoch((current) => current + 1);
    if (capabilities) setSelected(defaultDrafts(capabilities, next));
    setMessage(next === "fixture"
      ? "Fixture mode selected. No provider credits will be used."
      : "Live mode selected. Catalogs will be revalidated and a paid-call confirmation is required.");
  }

  function toggleProvider(providerId: ProviderId, checked: boolean) {
    setPaidConfirmed(false);
    setResultsStale(true);
    setSelected((current) => checked
      ? [...current, blankDraft(providerId)]
      : current.filter((draft) => draft.providerId !== providerId));
  }

  function updateDraft(providerId: ProviderId, patch: Partial<ProviderDraft>) {
    setPaidConfirmed(false);
    setResultsStale(true);
    setSelected((current) => current.map((draft) => draft.providerId === providerId ? { ...draft, ...patch } : draft));
  }

  function retryCatalog(providerId: ProviderId) {
    setPaidConfirmed(false);
    setResultsStale(true);
    catalogLoadsRef.current.delete(`${executionMode}:${providerId}`);
    setCatalogs((current) => omitProvider(current, providerId));
    setCatalogErrors((current) => omitProvider(current, providerId));
    setCatalogEpoch((current) => current + 1);
  }

  async function startRun(startedAtMonotonic: number) {
    if (runTokenRef.current) return;
    const validation = validateRun({ text, maximumLength, selected, catalogs, executionMode, evaluationMode, blindEnabled, paidConfirmed });
    if (validation) {
      setError(validation);
      return;
    }

    const runToken = Symbol("evaluation-run");
    runTokenRef.current = runToken;
    abortRef.current?.abort();
    setInspectionOnly(false);
    const runBlind = blindEnabled;
    activeBlindRef.current = runBlind;
    setBlindRunActive(runBlind);
    revokeAudioUrls(audioUrlsRef.current);
    audioRefsRef.current.clear();
    playableMeasuredRef.current.clear();
    const controller = new AbortController();
    abortRef.current = controller;
    const evaluationId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const seed = `one-blind:${runId}`;
    const preset = EVALUATION_PRESETS.find((candidate) => candidate.id === selectedPresetId);
    const pending = Object.fromEntries(selected.map((draft) => [draft.providerId, "pending"])) as ClientRunState;
    setRunState(pending);
    setResults([]);
    setRatings({});
    setBundle(null);
    setResultsStale(false);
    setRevealed(false);
    setRevealedAt(null);
    setError("");
    setRunning(true);
    setMessage(`Queued ${selected.length} ${executionMode === "fixture" ? "fixture" : "live"} lanes with bounded server concurrency…`);
    runStartedRef.current = startedAtMonotonic;

    try {
      const inputHash = await sha256(text);
      if (controller.signal.aborted) throw new DOMException("Evaluation cancelled.", "AbortError");
      if (runTokenRef.current !== runToken) return;
      const scenario: EvaluationScenario = {
        id: selectedPresetId ?? "custom-script",
        version: preset?.version ?? "1.0.0",
        source,
        presetId: selectedPresetId,
        inputType: "text",
        text,
        inputHash,
      };
      const completedBundle = await runEvaluation({
        schemaVersion: EVALUATION_SCHEMA_VERSION,
        evaluationId,
        runId,
        scenario,
        evaluationMode,
        executionMode,
        providers: selected.map((draft) => ({
          providerId: draft.providerId,
          model: draft.model,
          voice: draft.voice,
          outputFormat: draft.outputFormat,
          providerSpecificConfiguration: evaluationMode === "standardized" ? {} : draft.providerSpecificConfiguration,
        })),
        blind: { enabled: runBlind, seed },
        confirmedPaidCalls: executionMode === "fixture" ? false : paidConfirmed,
      }, controller.signal, (event) => {
        if (runTokenRef.current === runToken) handleStreamEvent(event);
      });
      if (runTokenRef.current !== runToken) return;
      setBundle(completedBundle);
      setMessage("Evaluation complete. Successful evidence remains available even when another provider failed.");
    } catch (caught) {
      if (runTokenRef.current !== runToken) return;
      if (controller.signal.aborted) {
        setRunState((current) => mapActiveStatuses(current, "cancelled"));
        setMessage("Evaluation cancelled. Results that arrived before cancellation are preserved.");
      } else {
        setRunState((current) => mapActiveStatuses(current, "failed"));
        setError(errorMessage(caught, "The evaluation ended before its evidence bundle was complete."));
      }
    } finally {
      if (runTokenRef.current === runToken) {
        runTokenRef.current = null;
        if (abortRef.current === controller) abortRef.current = null;
        if (executionMode !== "fixture") setPaidConfirmed(false);
        setRunning(false);
      }
    }
  }

  function handleStreamEvent(event: EvaluationStreamEvent) {
    if (event.type === "run-started") {
      setMessage(`Run started at ${new Date(event.startedAt).toLocaleTimeString()}. Provider results will arrive independently.`);
      return;
    }
    if (event.type === "provider-state") {
      setRunState((current) => ({ ...current, [event.providerId]: event.status }));
      return;
    }
    if (event.type === "provider-result") {
      const providerId = event.result.provider;
      const audioUrl = event.audioBase64 && event.result.audio.mimeType
        ? audioUrlFromBase64(event.audioBase64, event.result.audio.mimeType)
        : null;
      if (audioUrl) audioUrlsRef.current.add(audioUrl);
      setResults((current) => {
        const previous = current.find((item) => item.evidence.provider === providerId);
        if (previous?.audioUrl && previous.audioUrl !== audioUrl) {
          URL.revokeObjectURL(previous.audioUrl);
          audioUrlsRef.current.delete(previous.audioUrl);
        }
        return [...current.filter((item) => item.evidence.provider !== providerId), { evidence: event.result, audioUrl }];
      });
      setRatings((current) => ({ ...current, [providerId]: event.result.humanRating }));
      setRunState((current) => ({ ...current, [providerId]: event.result.status }));
      const capability = capabilities?.providers.find((provider) => provider.id === providerId);
      const resultLabel = activeBlindRef.current && !revealed
        ? event.result.blindLabel
        : capability?.displayName ?? providerName(providerId);
      setMessage(`${resultLabel} finished with status ${event.result.status}. Other providers continue independently.`);
    }
  }

  function cancelRun() {
    abortRef.current?.abort();
  }

  function resetWorkspace() {
    abortRef.current?.abort();
    runTokenRef.current = null;
    revokeAudioUrls(audioUrlsRef.current);
    audioRefsRef.current.clear();
    playableMeasuredRef.current.clear();
    setResults([]);
    setRatings({});
    setBundle(null);
    setResultsStale(false);
    setRunState(emptyRunState());
    setRevealed(false);
    setBlindRunActive(false);
    activeBlindRef.current = false;
    setRevealedAt(null);
    setPaidConfirmed(false);
    setError("");
    if (inspectionOnly) {
      setInspectionOnly(false);
      setExecutionMode("fixture");
      setCatalogs({});
      setCatalogErrors({});
      catalogLoadsRef.current.clear();
      catalogControllerRef.current.abort();
      catalogControllerRef.current = new AbortController();
      setCatalogEpoch((current) => current + 1);
      setMessage("Imported evidence cleared. Fixture catalogs are loading for a new, no-spend run.");
    } else {
      setMessage("Results cleared. Your current scenario and provider selections are unchanged.");
    }
  }

  function revealProviders() {
    const now = new Date().toISOString();
    setRevealed(true);
    activeBlindRef.current = false;
    setRevealedAt(now);
    setMessage("Provider identities revealed. Ratings retain whether they were entered before or after reveal.");
  }

  function updateRating(providerId: ProviderId, next: HumanRating) {
    const now = new Date().toISOString();
    const hasRating = [next.naturalness, next.intelligibility, next.pronunciation, next.emotionalFit, next.useCaseFit]
      .some((value) => value !== null) || next.overallPreference;
    const normalized: HumanRating = {
      ...next,
      ratedAt: hasRating ? now : null,
      ratedBeforeReveal: hasRating ? (resultBlindEnabled ? !revealed : false) : null,
    };
    setRatings((current) => {
      const clearedPreferences = normalized.overallPreference
        ? Object.fromEntries(Object.entries(current).map(([id, rating]) => [id, rating ? clearOverallPreference(rating) : rating]))
        : current;
      return { ...clearedPreferences, [providerId]: normalized };
    });
    setResults((current) => current.map((item) => {
      const currentProvider = item.evidence.provider;
      const humanRating = currentProvider === providerId
        ? normalized
        : normalized.overallPreference
          ? clearOverallPreference(item.evidence.humanRating)
          : item.evidence.humanRating;
      return { ...item, evidence: { ...item.evidence, humanRating } };
    }));
  }

  function markPlayable(providerId: ProviderId, playableAtMonotonic: number) {
    if (playableMeasuredRef.current.has(providerId)) return;
    playableMeasuredRef.current.add(providerId);
    const value = Math.max(0, playableAtMonotonic - runStartedRef.current);
    const timestamp = new Date().toISOString();
    setResults((current) => current.map((item) => item.evidence.provider === providerId
      ? {
          ...item,
          evidence: {
            ...item.evidence,
            clientPlayableTimestamp: timestamp,
            metrics: replaceClientPlayableMetric(item.evidence, value),
            trace: [...item.evidence.trace, {
              type: "client-playback-ready",
              timestamp,
              offsetMs: value,
              observation: "observed",
              detail: "The browser reported that the normalized audio was ready to play.",
            }],
          },
        }
      : item));
  }

  function registerAudio(providerId: ProviderId, element: HTMLAudioElement | null) {
    if (element) audioRefsRef.current.set(providerId, element);
    else audioRefsRef.current.delete(providerId);
  }

  async function playTogether() {
    const players = [...audioRefsRef.current.values()];
    players.forEach((audio) => { audio.currentTime = 0; });
    const attempts = await Promise.allSettled(players.map((audio) => audio.play()));
    if (attempts.some((attempt) => attempt.status === "rejected")) {
      setMessage("The browser blocked one or more players. Use the individual play controls to continue.");
    }
  }

  function pauseAll() {
    audioRefsRef.current.forEach((audio) => audio.pause());
  }

  function exportEvidence() {
    if (!bundle || blindUnrevealed) return;
    const next = buildExportBundle(bundle, results, ratings, revealed, revealedAt);
    try {
      downloadEvidenceBundle(next, `one-voice-evidence-${next.runId}.json`);
      setMessage("Sanitized evidence exported. Audio and credentials are not embedded.");
    } catch (caught) {
      setError(errorMessage(caught, "Evidence export failed validation."));
    }
  }

  function importEvidence(next: EvaluationEvidenceBundle) {
    abortRef.current?.abort();
    runTokenRef.current = null;
    initializedProvidersRef.current = true;
    revokeAudioUrls(audioUrlsRef.current);
    const importedResults = next.providerResults.map((evidence) => ({ evidence, audioUrl: null }));
    setBundle(next);
    setResultsStale(false);
    setResults(importedResults);
    setRatings(Object.fromEntries(next.providerResults.map((evidence) => [evidence.provider, evidence.humanRating])));
    setRunState(Object.fromEntries(next.providerResults.map((evidence) => [evidence.provider, evidence.status])));
    setText(next.scenario.text);
    setSource(next.scenario.source);
    setSelectedPresetId(next.scenario.presetId);
    setEvaluationMode(next.evaluationMode);
    setExecutionMode("fixture");
    setInspectionOnly(true);
    setCatalogs({});
    setCatalogErrors({});
    catalogLoadsRef.current.clear();
    catalogControllerRef.current.abort();
    catalogControllerRef.current = new AbortController();
    setSelected(next.providerResults.map((evidence) => ({
      providerId: evidence.provider,
      model: evidence.model,
      voice: evidence.voice,
      outputFormat: "",
      providerSpecificConfiguration: evidence.providerSpecificConfiguration,
    })));
    setBlindEnabled(next.blind.enabled);
    setBlindRunActive(next.blind.enabled && !next.blind.revealed);
    activeBlindRef.current = next.blind.enabled;
    setRevealed(next.blind.revealed);
    setRevealedAt(next.blind.revealedAt);
    setPaidConfirmed(false);
    setError("");
    setMessage("Imported evidence is inspection-only. Reset results before preparing a new fixture run.");
  }

  const orderedResults = useMemo(() => [...results].sort((left, right) => {
    if (resultBlindEnabled) return left.evidence.blindLabel.localeCompare(right.evidence.blindLabel);
    const order = orderedCapabilities.map((provider) => provider.id);
    return order.indexOf(left.evidence.provider) - order.indexOf(right.evidence.provider);
  }), [orderedCapabilities, resultBlindEnabled, results]);
  const completeAudioCount = results.filter((result) => result.evidence.status === "complete" && result.audioUrl).length;
  const hasPreference = Object.values(ratings).some((rating) => rating?.overallPreference);
  const activeCount = Object.values(runState).filter((status) => status === "pending" || status === "streaming").length;
  const canExport = Boolean(bundle) && !blindUnrevealed;
  const currentValidation = inspectionOnly
    ? "Imported evidence is inspection-only. Reset results before starting another run."
    : validateRun({ text, maximumLength, selected, catalogs, executionMode, evaluationMode, blindEnabled, paidConfirmed });

  function changeEvaluationMethod(next: EvaluationMode) {
    if (next === "provider-optimized" && (blindEnabled || executionMode !== "fixture")) return;
    setEvaluationMode(next);
    setPaidConfirmed(false);
    setResultsStale(true);
  }

  function handleMethodKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const choices = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button[role='radio']:not(:disabled)") ?? [])];
    if (!choices.length) return;
    event.preventDefault();
    const currentIndex = choices.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? choices.length - 1
        : (currentIndex + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
    choices[nextIndex]?.focus();
    choices[nextIndex]?.click();
  }

  return (
    <div className="evaluate-workspace">
      <section aria-label="Evaluation method" className="evaluate-mode-bar">
        <div>
          <span>Execution evidence</span>
          <select
            aria-label="Execution evidence mode"
            disabled={running || blindUnrevealed || inspectionOnly}
            onChange={(event) => changeExecutionMode(event.target.value as EvaluationExecutionMode)}
            value={executionMode}
          >
            <option value="fixture">Fixture-backed demonstration · free</option>
            <option disabled={!capabilities?.liveEvaluationsEnabled} value="protected-live">Protected live · may incur cost</option>
            <option disabled={!capabilities?.localLiveAvailable} value="local-live">Local development live · explicit only</option>
          </select>
        </div>
        <div className="evaluate-method-toggle" role="radiogroup" aria-label="Comparison method">
          <button aria-checked={evaluationMode === "standardized"} disabled={running || blindUnrevealed || inspectionOnly} onClick={() => changeEvaluationMethod("standardized")} onKeyDown={handleMethodKeyDown} role="radio" tabIndex={evaluationMode === "standardized" ? 0 : -1} type="button">Standardized</button>
          <button aria-checked={evaluationMode === "provider-optimized"} disabled={running || blindUnrevealed || blindEnabled || inspectionOnly || executionMode !== "fixture"} onClick={() => changeEvaluationMethod("provider-optimized")} onKeyDown={handleMethodKeyDown} role="radio" tabIndex={evaluationMode === "provider-optimized" ? 0 : -1} type="button">Provider-optimized</button>
        </div>
      </section>
      <p className="evaluate-mode-explainer">
        {executionMode !== "fixture"
          ? "Live comparisons are Standardized-only in Phase 1. ONE validates 24 kHz PCM and wraps it as playable WAV; native live formats remain unavailable until their playback and provenance boundary is implemented."
          : evaluationMode === "standardized"
          ? `Standardized mode aligns the exact text and comparable PCM/WAV output boundary. It does not claim provider controls are equivalent.${blindEnabled ? " Blind listening requires this normalized WAV boundary so provider-native container metadata cannot reveal identity." : ""}`
          : "Provider-optimized mode records native settings separately. Differences may reflect configuration as well as provider behavior."}
      </p>

      {capabilityError ? (
        <section className="evaluate-boundary-error" role="alert">
          <p>{capabilityError}</p><button onClick={() => void loadCapabilities()} type="button">Retry readiness check</button>
        </section>
      ) : null}

      {inspectionOnly ? (
        <section className="evaluate-blind-setup-boundary" aria-labelledby="inspection-only-heading">
          <p className="evaluate-kicker">Imported evidence</p>
          <h2 id="inspection-only-heading">Inspection only—no provider discovery or paid calls</h2>
          <p>The imported configuration is displayed exactly as evidence. Reset results to load safe fixture catalogs before preparing another run.</p>
        </section>
      ) : blindUnrevealed ? (
        <section className="evaluate-blind-setup-boundary" aria-labelledby="blind-setup-heading">
          <p className="evaluate-kicker">Blind comparison active</p>
          <h2 id="blind-setup-heading">Comparison setup hidden until reveal</h2>
          <p>The script, provider order, model, voice, and native controls are temporarily suppressed so they cannot identify a result. Rate what you hear, then submit a preference or reveal explicitly.</p>
        </section>
      ) : (
        <>
          <section className="evaluate-composer-panel">
            <ScenarioPanel
              disabled={running}
              maximumLength={maximumLength}
              onCustom={startCustom}
              onPreset={choosePreset}
              onText={updateText}
              selectedPresetId={selectedPresetId}
              source={source}
              text={text}
            />
          </section>
          <section className="evaluate-composer-panel">
            <ProviderConfigurator
              capabilities={orderedCapabilities}
              catalogErrors={catalogErrors}
              catalogs={catalogs}
              disabled={running}
              evaluationMode={evaluationMode}
              executionMode={executionMode}
              onDraft={updateDraft}
              onRetryCatalog={retryCatalog}
              onToggle={toggleProvider}
              selected={selected}
            />
          </section>

          <section aria-labelledby="evaluate-review-heading" className="evaluate-review-panel">
            <div>
              <p className="evaluate-kicker">03 · Review</p>
              <h2 id="evaluate-review-heading">Confirm the evidence boundary</h2>
            </div>
            <label className="evaluate-native-toggle">
              <input
                checked={blindEnabled}
                disabled={running}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setBlindEnabled(enabled);
                  if (enabled) setEvaluationMode("standardized");
                  setPaidConfirmed(false);
                  setResultsStale(true);
                }}
                type="checkbox"
              />
              <span><strong>Blind listening mode</strong><small>Random order and neutral labels remain hidden until preference or explicit reveal.</small></span>
            </label>
            {executionMode !== "fixture" ? (
              <label className="evaluate-paid-confirmation">
                <input checked={paidConfirmed} disabled={running} onChange={(event) => setPaidConfirmed(event.target.checked)} type="checkbox" />
                <span><strong>I confirm these paid live calls</strong><small>Every selected provider may consume account usage. Browser cancellation cannot guarantee provider billing cancellation.</small></span>
              </label>
            ) : (
              <p className="evaluate-fixture-boundary"><strong>No provider spend.</strong> Fixture mode replays deterministic evidence and does not contact provider APIs.</p>
            )}
          </section>
        </>
      )}

      {running || Object.values(runState).some((status) => status && status !== "idle") ? (
        <section aria-label="Independent provider lane status" className="evaluate-lane-statuses">
          {blindUnrevealed ? (
            <>
              {orderedResults.map((result) => (
                <div key={result.evidence.blindLabel}>
                  <span>{result.evidence.blindLabel}</span>
                  <strong className="evaluate-status">{result.evidence.status === "complete" ? "Ready" : "Unavailable"}</strong>
                </div>
              ))}
              {activeCount ? (
                <div>
                  <span>Unidentified voice lanes</span>
                  <strong className="evaluate-status">{activeCount} active</strong>
                </div>
              ) : null}
            </>
          ) : selected.map((draft) => {
              const capability = capabilities?.providers.find((provider) => provider.id === draft.providerId);
              const status = runState[draft.providerId] ?? "idle";
              return (
                <div key={draft.providerId}>
                  <span>{capability?.displayName ?? providerName(draft.providerId)}</span>
                  <strong className={`evaluate-status evaluate-status--${status}`}>{status === "timed-out" ? "Timed out" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`}</strong>
                </div>
              );
            })}
        </section>
      ) : null}

      <div aria-label="Evaluation actions" className="evaluate-action-dock">
        <div aria-atomic="true" aria-live="polite" className="evaluate-run-message" role="status">
          <span className={running ? "is-running" : ""} aria-hidden="true" />
          <p>{error || message}{running && activeCount ? ` ${activeCount} provider${activeCount === 1 ? "" : "s"} still active.` : ""}</p>
        </div>
        <div>
          {currentValidation ? <p className="evaluate-run-validation" id="evaluate-run-validation">{currentValidation}</p> : null}
          <button aria-describedby={currentValidation ? "evaluate-run-validation" : undefined} className="evaluate-button evaluate-button--primary" disabled={running || blindUnrevealed || Boolean(currentValidation)} onClick={(event) => void startRun(event.timeStamp)} type="button">
            {results.length ? "Rerun comparison" : "Run comparison"}
          </button>
          <button className="evaluate-button evaluate-button--danger" disabled={!running} onClick={cancelRun} type="button">Cancel</button>
          <button className="evaluate-button" disabled={running} onClick={resetWorkspace} type="button">Reset results</button>
        </div>
      </div>

      {results.length || running ? (
        <section aria-labelledby="evaluate-results-heading" className="evaluate-results-section">
          <div className="evaluate-results-heading">
            <div><p className="evaluate-kicker">04 · Evidence</p><h2 id="evaluate-results-heading">Listen, inspect, and rate</h2></div>
            <div className="evaluate-evidence-legend" aria-label="Evidence categories">
              <span><i className="is-measured" />Measured</span>
              <span><i className="is-human" />Human-rated</span>
              <span><i className="is-reserved" />Model-judged · reserved</span>
            </div>
          </div>
          {resultsStale ? <p className="evaluate-stale-results" role="status">These results belong to the previous configuration. Rerun to evaluate your current changes.</p> : null}
          {completeAudioCount >= 2 ? (
            <div aria-label="Synchronized listening controls" className="evaluate-sync-toolbar">
              <span>Listen together</span>
              <button onClick={() => void playTogether()} type="button">Play together</button>
              <button onClick={pauseAll} type="button">Pause all</button>
              <small>Individual replay stays available in each audio control.</small>
            </div>
          ) : null}
          {resultBlindEnabled && !revealed && results.length ? (
            <div className="evaluate-reveal-toolbar">
              <p>Identities remain hidden. Choose one overall preference, or reveal without submitting one.</p>
              <div>
                <button disabled={!hasPreference} onClick={revealProviders} type="button">Submit preference and reveal</button>
                <button onClick={revealProviders} type="button">Reveal without preference</button>
              </div>
            </div>
          ) : null}
          <div className="evaluate-results-grid">
            {orderedResults.map((result) => {
              const providerId = result.evidence.provider;
              const capability = capabilities?.providers.find((provider) => provider.id === providerId);
              return (
                <ResultCard
                  blind={resultBlindEnabled}
                  key={providerId}
                  onAudio={(element) => registerAudio(providerId, element)}
                  onPlayable={(playableAtMonotonic) => markPlayable(providerId, playableAtMonotonic)}
                  onRating={(rating) => updateRating(providerId, rating)}
                  providerDisplayName={capability?.displayName ?? providerName(providerId)}
                  rating={ratings[providerId] ?? result.evidence.humanRating}
                  result={result}
                  revealed={revealed}
                />
              );
            })}
          </div>
        </section>
      ) : (
        <section className="evaluate-empty-results">
          <span aria-hidden="true" />
          <h2>Full evidence begins after one explicit run</h2>
          <p>Each provider will finish independently. A timeout or failure never erases another provider’s successful audio.</p>
        </section>
      )}

      <EvidenceControls
        canExport={canExport}
        disabled={running}
        onExport={exportEvidence}
        onImport={importEvidence}
      />
      {blindUnrevealed ? <p className="evaluate-export-boundary">Evidence export stays disabled until reveal because exact provider, model, and voice identifiers are required for reproducibility.</p> : null}
    </div>
  );
}

function defaultDrafts(capabilities: EvaluateCapabilities, mode: EvaluationExecutionMode): ProviderDraft[] {
  return [...capabilities.providers]
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .filter((provider) => providerAvailable(provider, capabilities, mode))
    .slice(0, 2)
    .map((provider) => blankDraft(provider.id));
}

function providerAvailable(
  provider: EvaluateCapabilities["providers"][number],
  capabilities: EvaluateCapabilities,
  mode: EvaluationExecutionMode,
): boolean {
  if (mode === "fixture") return provider.fixtureAvailable;
  if (mode === "local-live") {
    return capabilities.localLiveAvailable && provider.localLiveAvailable;
  }
  return capabilities.liveEvaluationsEnabled && provider.protectedLiveAvailable;
}

function blankDraft(providerId: ProviderId): ProviderDraft {
  return { providerId, model: "", voice: "", outputFormat: "", providerSpecificConfiguration: {} };
}

function defaultsFor(catalog: EvaluateCatalog): ProviderDraft["providerSpecificConfiguration"] {
  return Object.fromEntries(catalog.advancedControls
    .filter((control) => control.defaultValue !== undefined)
    .map((control) => [control.id, control.defaultValue ?? null]));
}

function validateRun({
  text,
  maximumLength,
  selected,
  catalogs,
  executionMode,
  evaluationMode,
  blindEnabled,
  paidConfirmed,
}: {
  text: string;
  maximumLength: number;
  selected: readonly ProviderDraft[];
  catalogs: Partial<Record<ProviderId, EvaluateCatalog>>;
  executionMode: EvaluationExecutionMode;
  evaluationMode: EvaluationMode;
  blindEnabled: boolean;
  paidConfirmed: boolean;
}): string {
  if (!text.trim()) return "Enter a test script before running.";
  if (text !== text.trim()) return "Remove leading or trailing whitespace so the recorded script matches the provider input exactly.";
  if (text.length > maximumLength) return `Shorten the script to ${maximumLength} characters or fewer.`;
  if (selected.length < 2 || selected.length > 4) return "Select between two and four available providers.";
  for (const draft of selected) {
    const catalog = catalogs[draft.providerId];
    if (!catalog) return `Wait for the ${providerName(draft.providerId)} catalog before running.`;
    if (!catalog.models.some((model) => model.id === draft.model)) return `Choose a validated ${providerName(draft.providerId)} model for this execution mode.`;
    if (!catalog.voices.some((voice) => voice.id === draft.voice)) return `Choose a validated ${providerName(draft.providerId)} voice for this execution mode.`;
    if (!draft.outputFormat) return `${providerName(draft.providerId)} does not expose a validated output format.`;
    if (!catalog.normalizedOutput) return `${providerName(draft.providerId)} does not expose a validated normalized playback boundary.`;
  }
  if (blindEnabled && evaluationMode !== "standardized") return "Blind listening requires Standardized mode and normalized WAV output.";
  if (executionMode !== "fixture" && evaluationMode !== "standardized") return "Live evaluation requires Standardized mode in Phase 1.";
  if (executionMode !== "fixture" && !paidConfirmed) return "Confirm the paid live calls before running.";
  return "";
}

function mapActiveStatuses(state: ClientRunState, next: "cancelled" | "failed"): ClientRunState {
  return Object.fromEntries(Object.entries(state).map(([providerId, status]) => [
    providerId,
    status === "pending" || status === "streaming" ? next : status,
  ])) as ClientRunState;
}

function clearOverallPreference(rating: HumanRating): HumanRating {
  const hasDimensions = [
    rating.naturalness,
    rating.intelligibility,
    rating.pronunciation,
    rating.emotionalFit,
    rating.useCaseFit,
  ].some((value) => value !== null);
  return {
    ...rating,
    overallPreference: false,
    ...(!hasDimensions ? { ratedAt: null, ratedBeforeReveal: null } : {}),
  };
}

function audioUrlFromBase64(base64: string, mimeType: string): string {
  const payload = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function revokeAudioUrls(urls: Set<string>) {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
}

function replaceClientPlayableMetric(evidence: EvaluationProviderEvidence, value: number): EvaluationProviderEvidence["metrics"] {
  const metric = {
    name: "client_time_to_playable" as const,
    value,
    unit: "milliseconds" as const,
    availability: "measured" as const,
    measurementPoint: "one-browser" as const,
    metricVersion: EVALUATION_METRIC_VERSION,
    provenance: {
      clock: "browser-monotonic" as const,
      description: "Measured in this browser from the local run start until the normalized audio element emitted canplay.",
    },
  };
  return [...evidence.metrics.filter((candidate) => candidate.name !== metric.name), metric];
}

function buildExportBundle(
  bundle: EvaluationEvidenceBundle,
  results: readonly ClientResult[],
  ratings: Partial<Record<ProviderId, HumanRating>>,
  revealed: boolean,
  revealedAt: string | null,
): EvaluationEvidenceBundle {
  const resultMap = new Map(results.map((result) => [result.evidence.provider, result.evidence]));
  const providerResults = bundle.providerResults.map((evidence) => {
    const current = resultMap.get(evidence.provider) ?? evidence;
    return { ...current, humanRating: ratings[evidence.provider] ?? current.humanRating };
  });
  return {
    ...bundle,
    exportedAt: new Date().toISOString(),
    blind: { ...bundle.blind, revealed, revealedAt: revealed ? revealedAt ?? new Date().toISOString() : null },
    providerResults,
    evidenceCategories: {
      ...bundle.evidenceCategories,
      humanRated: providerResults.some((evidence) => evidence.humanRating.ratedAt !== null),
    },
  };
}

async function sha256(value: string): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function omitProvider<T>(record: Partial<Record<ProviderId, T>>, providerId: ProviderId): Partial<Record<ProviderId, T>> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== providerId)) as Partial<Record<ProviderId, T>>;
}

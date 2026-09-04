"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { useVoiceLabActions } from "@/components/actions/VoiceLabActionProvider";
import { useRegisterVoiceLabAction } from "@/components/actions/useRegisterVoiceLabAction";
import { benchmarkCategoryCatalog, benchmarkMethodologyCatalog } from "@/lib/evaluation/benchmark-catalog";
import {
  createFixtureLeaderboardPreview,
  planBenchmark,
  type BenchmarkPlanningProvider,
} from "@/lib/evaluation/benchmark-engine";
import {
  BENCHMARK_FIXTURE_CONFIGURATION,
  BENCHMARK_FIXTURE_METHODOLOGY_ID,
  BENCHMARK_FIXTURE_METHODOLOGY_VERSION,
  BENCHMARK_FIXTURE_SCENARIO_ID,
  BENCHMARK_FIXTURE_SCENARIO_VERSION,
} from "@/lib/evaluation/benchmark-fixture-definition";
import { runFixtureBenchmarkPlan } from "@/lib/evaluation/benchmark-fixture";
import {
  BENCHMARK_METHODOLOGY_VERSION,
  BENCHMARK_PLAN_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  benchmarkLeaderboardSnapshotSchema,
  type BenchmarkResult,
  type BenchmarkLeaderboardSnapshot,
} from "@/lib/evaluation/benchmark-schema";
import { providerIdSchema, type ProviderId } from "@/lib/providers/types";

const ALL = "all";
const initialFixtureSnapshot = benchmarkLeaderboardSnapshotSchema.parse(createFixtureLeaderboardPreview());

type LeaderboardEntry = BenchmarkLeaderboardSnapshot["entries"][number];
type SetupState = "idle" | "validating" | "completed" | "error";

export function BenchmarkWorkspace({
  providerCatalog,
}: {
  providerCatalog?: readonly BenchmarkPlanningProvider[];
}) {
  const { dispatch } = useVoiceLabActions();
  const [fixtureSnapshot, setFixtureSnapshot] = useState(initialFixtureSnapshot);
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [refreshMessage, setRefreshMessage] = useState("Ready. This preview makes no provider call.");
  const [category, setCategory] = useState<string>(fixtureSnapshot.category);
  const [modality, setModality] = useState<string>(ALL);
  const [provider, setProvider] = useState<string>(ALL);
  const [model, setModel] = useState<string>(ALL);
  const [language, setLanguage] = useState<string>(ALL);
  const [region, setRegion] = useState<string>(ALL);
  const [methodology, setMethodology] = useState<string>(fixtureSnapshot.methodologyVersion);
  const [scoringProfile, setScoringProfile] = useState<string>(scoringProfileKey(fixtureSnapshot));
  const [evidenceClass, setEvidenceClass] = useState<string>(ALL);
  const [deployment, setDeployment] = useState<string>(ALL);
  const [timeWindow, setTimeWindow] = useState<string>(timeWindowKey(fixtureSnapshot));
  const [freshness, setFreshness] = useState<string>(ALL);
  const [selectedProviderIds, setSelectedProviderIds] = useState<ProviderId[]>(() => (
    fixtureSnapshot.entries.map((entry) => providerIdSchema.parse(entry.providerId))
  ));
  const [setupState, setSetupState] = useState<SetupState>("idle");
  const [setupMessage, setSetupMessage] = useState("Ready to validate a nonbillable fixture benchmark.");
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const setupLockRef = useRef(false);

  useRegisterVoiceLabAction("benchmark.plan", (input) => {
    const decision = planBenchmark(input.plan, { providerCatalog });
    return { decision: { ...decision, reasons: [...decision.reasons] } };
  });

  useRegisterVoiceLabAction("benchmark.runFixture", async (input, context) => {
    const execution = await runFixtureBenchmarkPlan(input.plan, {
      signal: context.signal,
      providerCatalog,
    });
    return { bundle: execution.bundle, results: [...execution.results] };
  });

  useRegisterVoiceLabAction("benchmark.fixtureLeaderboard", () => ({
    snapshot: createFixtureLeaderboardPreview(),
  }), {
    isAvailable: () => refreshState !== "running",
    unavailableMessage: "The deterministic fixture snapshot is already being rebuilt.",
  });

  async function refreshFixtureSnapshot() {
    setRefreshState("running");
    setRefreshMessage("Rebuilding the deterministic fixture locally.");
    const result = await dispatch("benchmark.fixtureLeaderboard", {}, { source: "ui" });
    if (result.ok) {
      setFixtureSnapshot(benchmarkLeaderboardSnapshotSchema.parse(result.data.snapshot));
      setRefreshState("complete");
      setRefreshMessage("Fixture snapshot rebuilt. Zero provider calls were made.");
      return;
    }
    setRefreshState("error");
    setRefreshMessage(result.error.message);
  }

  function toggleSetupProvider(providerId: ProviderId, checked: boolean) {
    setBenchmarkResult(null);
    setSetupState("idle");
    setSetupMessage("Setup changed. Validate the fixture benchmark when ready.");
    setSelectedProviderIds((current) => checked
      ? [...current, providerId].slice(0, 4)
      : current.filter((candidate) => candidate !== providerId));
  }

  async function runFixtureBenchmark() {
    if (setupLockRef.current || selectedProviderIds.length < 2) return;
    setupLockRef.current = true;
    setSetupState("validating");
    setSetupMessage("Validating the bounded fixture plan…");
    setBenchmarkResult(null);
    try {
      const selectedEntries = fixtureSnapshot.entries.filter((entry) => selectedProviderIds.includes(providerIdSchema.parse(entry.providerId)));
      const plan = {
        schemaVersion: BENCHMARK_PLAN_VERSION,
        planId: "benchmark-plan/evaluate-fixture",
        category: "tts" as const,
        methodology: { id: BENCHMARK_FIXTURE_METHODOLOGY_ID, version: BENCHMARK_FIXTURE_METHODOLOGY_VERSION },
        executionMode: "fixture" as const,
        cases: [{ id: BENCHMARK_FIXTURE_SCENARIO_ID, version: BENCHMARK_FIXTURE_SCENARIO_VERSION }],
        providers: selectedEntries.map((entry) => ({
          providerId: entry.providerId,
          modelId: entry.metadata.modelId,
          voiceId: entry.metadata.voiceId,
          configuration: BENCHMARK_FIXTURE_CONFIGURATION,
        })),
        repetitions: 1,
        confirmedPaidCalls: false,
      };
      const planResult = await dispatch("benchmark.plan", { plan }, { source: "ui" });
      if (!planResult.ok) throw new Error(planResult.error.message);
      if (planResult.data.decision.status !== "ready") {
        throw new Error(planResult.data.decision.reasons.map((reason) => reason.message).join(" ") || "The fixture plan is not ready.");
      }

      setSetupMessage("Plan valid. Running the canonical local fixture service…");
      const executed = await dispatch("benchmark.runFixture", { plan }, { source: "ui" });
      if (!executed.ok) throw new Error(executed.error.message);
      const result = executed.data.results[0];
      if (!result) throw new Error("The fixture action returned no canonical benchmark result.");
      setBenchmarkResult(result);
      setSetupState("completed");
      setSetupMessage(`Fixture benchmark completed with ${result.run.participants.length} comparable lanes. Zero provider calls were made.`);
    } catch (error) {
      setSetupState("error");
      setSetupMessage(error instanceof Error ? error.message : "The fixture benchmark could not be materialized.");
    } finally {
      setupLockRef.current = false;
    }
  }

  const entries = useMemo(() => fixtureSnapshot.entries.filter((entry) => (
    entry.metadata.modality === category
    && (modality === ALL || entry.metadata.modality === modality)
    && (provider === ALL || entry.providerId === provider)
    && (model === ALL || entry.metadata.modelId === model)
    && (language === ALL || entry.metadata.comparablePopulation.language === language)
    && (region === ALL || (entry.metadata.comparablePopulation.region ?? "unknown") === region)
    && methodology === fixtureSnapshot.methodologyVersion
    && scoringProfile === scoringProfileKey(fixtureSnapshot)
    && (evidenceClass === ALL || entry.metadata.evidenceClass === evidenceClass)
    && (deployment === ALL || entry.metadata.deployment === deployment)
    && timeWindow === timeWindowKey(fixtureSnapshot)
    && (freshness === ALL || entry.metadata.freshness.status === freshness)
  )), [category, deployment, evidenceClass, fixtureSnapshot, freshness, language, methodology, modality, model, provider, region, scoringProfile, timeWindow]);

  const categoryRecord = benchmarkCategoryCatalog.find((item) => item.id === fixtureSnapshot.category);
  const methodologyRecord = benchmarkMethodologyCatalog.find((item) => item.category === fixtureSnapshot.category);
  const providers = unique(fixtureSnapshot.entries.map((entry) => entry.providerId));
  const models = unique(fixtureSnapshot.entries.map((entry) => entry.metadata.modelId));
  const languages = unique(fixtureSnapshot.entries.map((entry) => entry.metadata.comparablePopulation.language));
  const regions = unique(fixtureSnapshot.entries.map((entry) => entry.metadata.comparablePopulation.region ?? "unknown"));
  const modalities = unique(fixtureSnapshot.entries.map((entry) => entry.metadata.modality));
  const evidenceClasses = unique(fixtureSnapshot.entries.map((entry) => entry.metadata.evidenceClass));
  const deployments = unique(fixtureSnapshot.entries.map((entry) => entry.metadata.deployment));
  const freshnessStates = unique(fixtureSnapshot.entries.map((entry) => entry.metadata.freshness.status));

  return (
    <section aria-labelledby="benchmark-preview-title" className="benchmark-workspace" id="benchmark-preview">
      <header className="benchmark-workspace__header">
        <div>
          <p className="evaluate-kicker">Canonical benchmark preview</p>
          <h2 id="benchmark-preview-title">Verifiable results, without a composite winner</h2>
          <p>
            Explore a deterministic, synthetic leaderboard fixture. It is nonbillable, makes no provider-quality claim,
            and is not eligible for public evidence or publication.
          </p>
          <div aria-label="Benchmark preview boundaries" className="benchmark-workspace__badges">
            <span className="benchmark-workspace__badge benchmark-workspace__badge--green">Fixture-only</span>
            <span className="benchmark-workspace__badge">Nonbillable</span>
            <span className="benchmark-workspace__badge">Synthetic evidence</span>
            <span className="benchmark-workspace__badge benchmark-workspace__badge--neutral">Non-public preview</span>
            <span className="benchmark-workspace__badge benchmark-workspace__badge--neutral">{BENCHMARK_SCHEMA_VERSION}</span>
            <span className="benchmark-workspace__badge benchmark-workspace__badge--neutral">{BENCHMARK_METHODOLOGY_VERSION}</span>
          </div>
        </div>
        <div className="benchmark-workspace__header-actions">
          <button
            className="benchmark-workspace__methodology-link"
            data-voice-action="benchmark.fixtureLeaderboard"
            disabled={refreshState === "running"}
            onClick={refreshFixtureSnapshot}
            type="button"
          >
            {refreshState === "running" ? "Rebuilding fixture…" : "Rebuild fixture snapshot"}
          </button>
          <Link className="benchmark-workspace__methodology-link" href="/methodology">
            Open methodology
          </Link>
          <p aria-atomic="true" aria-live="polite" className="benchmark-workspace__action-status" role="status">
            {refreshMessage}
          </p>
        </div>
      </header>

      <section aria-labelledby="benchmark-setup-title" className="benchmark-workspace__setup">
        <div className="benchmark-workspace__setup-heading">
          <div>
            <p className="evaluate-kicker">Benchmark setup</p>
            <h3 id="benchmark-setup-title">Validate one canonical fixture observation</h3>
            <p>
              Choose two to four exact fixture lanes. ONE validates the plan through the shared action runtime, then
              materializes one canonical private result locally.
            </p>
          </div>
          <span className="benchmark-workspace__badge benchmark-workspace__badge--green">Nonbillable · zero provider calls</span>
        </div>

        <div className="benchmark-setup-grid">
          <StaticSelect label="Category" value="tts">
            <option value="tts">Text-to-speech · implemented</option>
            <option disabled value="stt">Speech-to-text · execution unavailable</option>
            <option disabled value="realtime">Realtime voice · execution unavailable</option>
          </StaticSelect>
          <StaticSelect label="Suite" value="one-evaluate-private-suite">
            <option value="one-evaluate-private-suite">ONE Evaluate private suite · v1.0.0</option>
          </StaticSelect>
          <StaticSelect label="Methodology" value={BENCHMARK_FIXTURE_METHODOLOGY_ID}>
            <option value={BENCHMARK_FIXTURE_METHODOLOGY_ID}>Identical-script TTS · v{BENCHMARK_FIXTURE_METHODOLOGY_VERSION}</option>
          </StaticSelect>
          <StaticSelect label="Run mode" value="fixture">
            <option value="fixture">Fixture only · available</option>
            <option disabled value="protected-live">Protected live · disabled in Stage 3</option>
            <option disabled value="local-live">Local live · disabled in Stage 3</option>
          </StaticSelect>
          <StaticSelect label="Configuration" value="fixture-standardized">
            <option value="fixture-standardized">Standardized local WAV · 24 kHz mono</option>
          </StaticSelect>
          <StaticSelect label="Visibility" value="private">
            <option value="private">Private · ephemeral</option>
            <option disabled value="public-candidate">Public candidate · fixture ineligible</option>
          </StaticSelect>
        </div>

        <fieldset className="benchmark-provider-setup">
          <legend>Providers and exact fixture models</legend>
          <p>Fixture comparability is available for every listed lane; adapter readiness is disclosed separately.</p>
          <div className="benchmark-provider-setup__grid">
            {fixtureSnapshot.entries.map((entry, index) => {
              const providerId = providerIdSchema.parse(entry.providerId);
              const selected = selectedProviderIds.includes(providerId);
              const descriptionId = `benchmark-fixture-lane-${index + 1}`;
              return (
                <label className="benchmark-provider-option" key={entry.providerId}>
                  <input
                    aria-describedby={descriptionId}
                    aria-label={`Select fixture lane ${index + 1}`}
                    checked={selected}
                    disabled={(!selected && selectedProviderIds.length >= 4) || setupState === "validating"}
                    onChange={(event) => toggleSetupProvider(providerId, event.target.checked)}
                    type="checkbox"
                  />
                  <span id={descriptionId}>
                    <strong>{entry.metadata.providerSnapshot.displayName}</strong>
                    <small>Model: {entry.metadata.modelId}</small>
                    <small>Voice: {entry.metadata.voiceId}</small>
                    <small>Comparable fixture: ready · {sentenceCase(entry.metadata.providerSnapshot.readiness)}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <aside aria-label="Fixture eligibility limits" className="benchmark-eligibility-warning">
          <strong>Eligibility boundary</strong>
          <ul>
            <li>Synthetic fixture evidence validates the workflow only; it is not provider performance evidence.</li>
            <li>Visibility remains private, retention remains ephemeral, and publication is disabled.</li>
            <li>Live modes and unsupported benchmark categories remain visibly disabled.</li>
            <li>{selectedProviderIds.length < 2 ? "Select at least two provider lanes before validation." : `${selectedProviderIds.length} provider lanes selected within the two-to-four lane bound.`}</li>
          </ul>
        </aside>

        <div className="benchmark-setup-actions">
          <button
            aria-describedby="benchmark-setup-status"
            className="evaluate-button evaluate-button--primary"
            data-voice-action="benchmark.runFixture"
            disabled={setupState === "validating" || selectedProviderIds.length < 2}
            onClick={() => void runFixtureBenchmark()}
            type="button"
          >
            {setupState === "validating" ? "Validating fixture…" : "Validate and materialize fixture"}
          </button>
          <p aria-atomic="true" aria-live="polite" id="benchmark-setup-status" role="status">
            <strong>{sentenceCase(setupState)}:</strong> {setupMessage}
          </p>
        </div>

        {benchmarkResult ? <BenchmarkResultDetail result={benchmarkResult} /> : null}
      </section>

      <section aria-labelledby="benchmark-filters-title" className="benchmark-workspace__filters">
        <h3 id="benchmark-filters-title">Filter this fixture snapshot</h3>
        <p>Only dimensions represented by this deterministic fixture are available.</p>
        <div className="benchmark-filter-grid">
          <Filter label="Category" onChange={setCategory} value={category}>
            <option value={fixtureSnapshot.category}>{categoryRecord?.name ?? fixtureSnapshot.category.toUpperCase()}</option>
          </Filter>
          <Filter label="Modality" onChange={setModality} value={modality}>
            <option value={ALL}>All available</option>
            {modalities.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
          </Filter>
          <Filter label="Provider" onChange={setProvider} value={provider}>
            <option value={ALL}>All providers</option>
            {providers.map((value) => {
              const snapshot = fixtureSnapshot.entries.find((entry) => entry.providerId === value)?.metadata.providerSnapshot;
              return <option key={value} value={value}>{snapshot?.displayName ?? providerLabel(value)}</option>;
            })}
          </Filter>
          <Filter label="Model" onChange={setModel} value={model}>
            <option value={ALL}>All models</option>
            {models.map((value) => <option key={value} value={value}>{value}</option>)}
          </Filter>
          <Filter label="Language or locale" onChange={setLanguage} value={language}>
            <option value={ALL}>All available</option>
            {languages.map((value) => <option key={value} value={value}>{value}</option>)}
          </Filter>
          <Filter label="Region" onChange={setRegion} value={region}>
            <option value={ALL}>All available</option>
            {regions.map((value) => <option key={value} value={value}>{value === "unknown" ? "Unknown / not applicable" : value}</option>)}
          </Filter>
          <Filter label="Methodology" onChange={setMethodology} value={methodology}>
            <option value={fixtureSnapshot.methodologyVersion}>
              {methodologyRecord?.name ?? fixtureSnapshot.methodologyVersion}
            </option>
          </Filter>
          <Filter label="Evidence class" onChange={setEvidenceClass} value={evidenceClass}>
            <option value={ALL}>All available</option>
            {evidenceClasses.map((value) => <option key={value} value={value}>{evidenceLabel(value)}</option>)}
          </Filter>
          <Filter label="Deployment" onChange={setDeployment} value={deployment}>
            <option value={ALL}>All available</option>
            {deployments.map((value) => <option key={value} value={value}>{sentenceCase(value)}</option>)}
          </Filter>
          <Filter label="Time window" onChange={setTimeWindow} value={timeWindow}>
            <option value={timeWindowKey(fixtureSnapshot)}>{formatTimeWindow(fixtureSnapshot)}</option>
          </Filter>
          <Filter label="Scoring profile" onChange={setScoringProfile} value={scoringProfile}>
            <option value={scoringProfileKey(fixtureSnapshot)}>
              {fixtureSnapshot.scoringProfile.profileId} · v{fixtureSnapshot.scoringProfile.version}
            </option>
          </Filter>
          <Filter label="Freshness" onChange={setFreshness} value={freshness}>
            <option value={ALL}>All available</option>
            {freshnessStates.map((value) => <option key={value} value={value}>{sentenceCase(value)}</option>)}
          </Filter>
        </div>
      </section>

      <section aria-label="Benchmark evidence classes" className="benchmark-workspace__evidence-boundary">
        <EvidenceBoundary label="Objective measurements" detail="Displayed below with metric provenance and sample statistics." />
        <EvidenceBoundary label="Human judgments" detail="Kept separate. This synthetic preview contains no human ratings." />
        <EvidenceBoundary label="Automated judgments" detail="Reserved and isolated. No model-judged evidence appears here." />
      </section>

      {entries.length ? (
        <div aria-label="Deterministic fixture leaderboard" className="benchmark-card-grid">
          {entries.map((entry) => (
            <BenchmarkCard entry={entry} key={entry.candidateId} snapshot={fixtureSnapshot} />
          ))}
        </div>
      ) : (
        <section aria-live="polite" className="benchmark-workspace__empty">
          <h3>No fixture entries match</h3>
          <p>Change one of the filters to inspect the available deterministic evidence.</p>
        </section>
      )}
    </section>
  );
}

function BenchmarkCard({ entry, snapshot }: { entry: LeaderboardEntry; snapshot: BenchmarkLeaderboardSnapshot }) {
  const exclusions = entry.exclusions.length
    ? entry.exclusions
    : [{ code: "synthetic-fixture", detail: "Synthetic fixture evidence is not public benchmark evidence." }];
  const methodology = benchmarkMethodologyCatalog.find((item) => item.category === snapshot.category);

  return (
    <article className="benchmark-card" data-benchmark-provider={entry.providerId}>
      <div className="benchmark-card__heading">
        <div>
          <p className="evaluate-kicker">Exact provider</p>
          <h3 aria-label={`Benchmark fixture result: ${entry.metadata.providerSnapshot.displayName}`}>
            {entry.metadata.providerSnapshot.displayName}
          </h3>
        </div>
        <span className="benchmark-card__rank">{rankLabel(entry)}</span>
      </div>

      <div>
        <p className="evaluate-kicker">Exact model</p>
        <p className="benchmark-card__model">{entry.metadata.modelId}</p>
      </div>

      <div className="benchmark-card__badges">
        <span className="benchmark-workspace__badge benchmark-workspace__badge--green">{evidenceLabel(entry.metadata.evidenceClass)}</span>
        <span className="benchmark-workspace__badge benchmark-workspace__badge--neutral">{sentenceCase(entry.metadata.deployment)}</span>
        <span className="benchmark-workspace__badge benchmark-workspace__badge--neutral">{sentenceCase(entry.status)}</span>
      </div>

      <dl className="benchmark-card__metrics">
        <Metric label="Metric" value={`${entry.metricId} · ${formatBenchmarkMetric(entry.value, entry.unit, snapshot.scoringProfile.decimalPlaces)}`} />
        <Metric label="Sample count" value={`n=${entry.sampleCount}`} />
        <Metric label="Median" value={formatStatistic(entry.statistics.median, entry.unit, snapshot.scoringProfile.decimalPlaces)} />
        <Metric label="p95" value={formatStatistic(entry.statistics.p95, entry.unit, snapshot.scoringProfile.decimalPlaces)} />
        <Metric label="Freshness" value={`${sentenceCase(entry.metadata.freshness.status)} · ${formatTimestamp(entry.metadata.freshness.observedAt)}`} />
        <Metric label="Public eligibility" value={entry.metadata.publicEligibility && snapshot.publicEligibility ? "Eligible" : "Not eligible"} />
        <Metric label="Visibility" value={sentenceCase(snapshot.visibility)} />
        <Metric label="Publication" value={sentenceCase(snapshot.publication)} />
        <Metric label="Integrity" value={sentenceCase(snapshot.integrity.state)} />
        <Metric label="Signature status" value={sentenceCase(snapshot.signatureStatus)} />
        <Metric label="Suite" value={`${entry.metadata.comparablePopulation.suiteRef.id} v${entry.metadata.comparablePopulation.suiteRef.version}`} />
        <Metric label="Case" value={`${entry.metadata.comparablePopulation.caseRef.id} v${entry.metadata.comparablePopulation.caseRef.version}`} />
        <Metric label="Input hash" value={entry.metadata.comparablePopulation.caseRef.inputHash} />
        <Metric label="Exact voice" value={entry.metadata.voiceId ?? "Not applicable"} />
        <Metric label="Configuration hash" value={entry.metadata.configurationHash} />
        <Metric label="Provider readiness" value={entry.metadata.providerSnapshot.readiness} />
        <Metric label="Adapter version" value={entry.metadata.providerSnapshot.adapterVersion} />
        <Metric label="Model version" value={entry.metadata.providerSnapshot.modelVersion ?? "Not reported"} />
        <Metric label="Sponsorship" value={formatSponsorship(entry)} />
        <Metric label="Runtime environment" value={entry.metadata.comparablePopulation.environment} />
        <Metric label="Region" value={entry.metadata.comparablePopulation.region ?? "Unknown / not applicable"} />
        <Metric label="Transport" value={entry.metadata.comparablePopulation.transport} />
        <Metric label="Codec" value={mediaDescription(entry)} />
        <Metric label="Exclusions" value={`${exclusions.length}`} />
      </dl>

      <details>
        <summary>Why ranked here?</summary>
        <div className="benchmark-card__explanation">
          <p>
            <strong>Methodology:</strong> {methodology?.name ?? "Canonical fixture methodology"} ({snapshot.comparablePopulation.methodologyRef.id} v{snapshot.comparablePopulation.methodologyRef.version}).
            Profile {snapshot.scoringProfile.profileId} v{snapshot.scoringProfile.version} compares {snapshot.scoringProfile.statistic} for {entry.metricId}; {sentenceCase(snapshot.scoringProfile.direction)}.
          </p>
          <p>
            <strong>Comparable input:</strong> suite {snapshot.comparablePopulation.suiteRef.id} v{snapshot.comparablePopulation.suiteRef.version}; case {snapshot.comparablePopulation.caseRef.id} v{snapshot.comparablePopulation.caseRef.version}; input {snapshot.comparablePopulation.caseRef.inputHash}.
          </p>
          <p>
            <strong>Measurement provenance:</strong> {snapshot.scoringProfile.measurementScope.source}; {snapshot.scoringProfile.measurementScope.measurementPoint}; {snapshot.scoringProfile.measurementScope.clock}; {snapshot.scoringProfile.measurementScope.observation}; method {snapshot.scoringProfile.measurementScope.method}; source schema {snapshot.scoringProfile.measurementScope.sourceSchemaVersion}.
          </p>
          <p>
            <strong>Runtime:</strong> {snapshot.comparablePopulation.environment}; {snapshot.comparablePopulation.deployment}; {snapshot.comparablePopulation.transport}; {mediaDescription(entry)}.
          </p>
          <p><strong>Sample count:</strong> n={entry.sampleCount}; this profile requires n≥{snapshot.scoringProfile.minimumSampleCount}. Median and p95 are shown only when their own minimum sample requirements are met.</p>
          <p><strong>Evidence:</strong> {evidenceLabel(entry.metadata.evidenceClass)} synthetic fixture measurements; no human or automated judgments are merged into this rank.</p>
          <p><strong>Sponsorship:</strong> {formatSponsorship(entry)}. Sponsorship never changes rank or defaults.</p>
          <p><strong>Freshness:</strong> {sentenceCase(entry.metadata.freshness.status)} as of {formatTimestamp(entry.metadata.freshness.observedAt)}.</p>
          <p><strong>Integrity:</strong> {sentenceCase(snapshot.integrity.state)} under {snapshot.integrity.canonicalization}.</p>
          <p><strong>Visibility, publication, and signature:</strong> {sentenceCase(snapshot.visibility)}; {sentenceCase(snapshot.publication)}; {sentenceCase(snapshot.signatureStatus)}.</p>
          <p className="benchmark-card__hash"><strong>Digest:</strong> {snapshot.integrity.digest ?? "Unavailable for this fixture snapshot"}</p>
          <div>
            <strong>Exclusions:</strong>
            <ul>
              {exclusions.map((exclusion) => <li key={`${exclusion.code}:${exclusion.detail}`}>{exclusion.detail}</li>)}
            </ul>
          </div>
          <div>
            <strong>Limitations:</strong>
            <ul>
              {snapshot.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </div>
          <p>No composite score is produced. Equal fixture measurements remain tied and do not imply provider quality.</p>
        </div>
      </details>
    </article>
  );
}

function BenchmarkResultDetail({ result }: { result: BenchmarkResult }) {
  const providerNames = new Map(result.run.participants.map((participant) => [
    participant.providerId,
    participant.providerMetadataSnapshot.displayName,
  ]));
  const costMeasurements = result.objectiveMeasurements.filter((measurement) => measurement.metricId === "estimated-cost");
  const costState = costMeasurements.length > 0 && costMeasurements.every((measurement) => measurement.availability === "unavailable")
    ? "Unavailable · no verified versioned pricing evidence"
    : `${costMeasurements.length} attributed cost measurement${costMeasurements.length === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="benchmark-result-title" className="benchmark-result-detail">
      <div className="benchmark-result-detail__heading">
        <div>
          <p className="evaluate-kicker">Canonical result detail</p>
          <h4 id="benchmark-result-title">Private fixture evidence materialized</h4>
        </div>
        <span className="benchmark-workspace__badge benchmark-workspace__badge--green">{sentenceCase(result.status)}</span>
      </div>
      <dl className="benchmark-card__metrics">
        <Metric label="Result ID" value={result.resultId} />
        <Metric label="Schema" value={result.schemaVersion} />
        <Metric label="Category" value={categoryLabel(result.category)} />
        <Metric label="Run mode" value={sentenceCase(result.run.executionMode)} />
        <Metric label="Comparison mode" value={result.run.evaluationMode ? sentenceCase(result.run.evaluationMode) : "Not applicable"} />
        <Metric label="Suite" value={`${result.run.suiteRef.id} v${result.run.suiteRef.version}`} />
        <Metric label="Case" value={`${result.run.caseRef.id} v${result.run.caseRef.version}`} />
        <Metric label="Input hash" value={result.run.caseRef.inputHash} />
        <Metric label="Methodology" value={`${result.run.methodologyRef.id} v${result.run.methodologyRef.version}`} />
        <Metric label="Provider lanes" value={`${result.run.participants.length}`} />
        <Metric label="Objective measurements" value={`${result.objectiveMeasurements.length}`} />
        <Metric label="Estimated cost evidence" value={costState} />
        <Metric label="Human judgments" value={result.humanJudgments.length ? `${result.humanJudgments.length} · separate evidence class` : "None recorded · separate evidence class"} />
        <Metric label="Automated judgments" value={result.automatedJudgments.length ? `${result.automatedJudgments.length} · separate evidence class` : "None produced · reserved evidence boundary"} />
        <Metric label="Runtime environment" value={`${result.run.runtime.environment} · ${result.run.runtime.deployment}`} />
        <Metric label="Runtime region" value={result.run.runtime.region ?? "Unknown / not applicable"} />
        <Metric label="Recorded at" value={formatTimestamp(result.run.recordedAt)} />
        <Metric label="Queued at" value={formatOptionalTimestamp(result.run.timestamps.queuedAt)} />
        <Metric label="Started at" value={formatOptionalTimestamp(result.run.timestamps.startedAt)} />
        <Metric label="Completed at" value={formatOptionalTimestamp(result.run.timestamps.completedAt)} />
        <Metric label="Failure" value={result.run.failure ? `${result.run.failure.code} · ${result.run.failure.message}` : "None · all selected fixture lanes completed"} />
        <Metric label="Public eligibility" value={result.eligibility.publicEligible ? "Eligible" : "Not eligible"} />
        <Metric label="Ranking eligibility" value={result.eligibility.rankingEligible ? "Eligible" : "Not eligible"} />
        <Metric label="Visibility" value={sentenceCase(result.visibility)} />
        <Metric label="Publication" value={sentenceCase(result.publication)} />
        <Metric label="Retention" value={sentenceCase(result.retention)} />
        <Metric label="Integrity" value={sentenceCase(result.integrity.state)} />
        <Metric label="Integrity digest" value={result.integrity.digest ?? "No digest attached · private unsigned result"} />
        <Metric label="Canonicalization" value={result.integrity.canonicalization} />
        <Metric label="Integrity checked at" value={formatOptionalTimestamp(result.integrity.checkedAt)} />
        <Metric label="Signature state" value={result.integrity.state === "signature-verified" ? "Verified signature" : "No signature attached"} />
      </dl>
      <details>
        <summary>Inspect objective measurement evidence</summary>
        <div className="benchmark-result-measurements">
          <p>
            Every value remains attributable to its exact provider lane, unit, availability state, sample count,
            measurement point, clock, observation class, method, and source schema.
          </p>
          <ul aria-label="Canonical objective measurements" className="benchmark-result-measurements__list">
            {result.objectiveMeasurements.map((measurement) => (
              <li className="benchmark-result-measurement" key={measurement.measurementId}>
                <div className="benchmark-result-measurement__heading">
                  <div>
                    <strong>{measurement.metricId}</strong>
                    <span>{providerNames.get(measurement.providerId) ?? measurement.providerId}</span>
                  </div>
                  <span className="benchmark-workspace__badge benchmark-workspace__badge--neutral">{sentenceCase(measurement.availability)}</span>
                </div>
                <dl className="benchmark-card__metrics">
                  <Metric label="Value" value={formatObjectiveMeasurement(measurement.value, measurement.unit, measurement.availability)} />
                  <Metric label="Sample count" value={`n=${measurement.sampleCount}`} />
                  <Metric label="Measurement point" value={sentenceCase(measurement.provenance.measurementPoint)} />
                  <Metric label="Evidence source" value={sentenceCase(measurement.source)} />
                  <Metric label="Clock" value={sentenceCase(measurement.provenance.clock)} />
                  <Metric label="Observation" value={sentenceCase(measurement.provenance.observation)} />
                  <Metric label="Method" value={measurement.method} />
                  <Metric label="Source schema" value={measurement.provenance.sourceSchemaVersion} />
                  <Metric label="Measured at" value={formatTimestamp(measurement.measuredAt)} />
                  <Metric label="Synthetic" value={measurement.synthetic ? "Yes · fixture only" : "No"} />
                </dl>
                <p><strong>Provenance:</strong> {measurement.provenance.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </details>
      <details>
        <summary>Inspect exact lanes and exclusions</summary>
        <div className="benchmark-card__explanation">
          <ul>
            {result.run.participants.map((participant) => (
              <li key={`${participant.providerId}:${participant.configurationHash}`}>
                <strong>{participant.providerMetadataSnapshot.displayName}</strong>: {participant.modelId} · {participant.voiceId ?? "voice not applicable"} · {sentenceCase(participant.providerMetadataSnapshot.readiness)} · {participant.configurationHash}
              </li>
            ))}
          </ul>
          <p><strong>Configuration:</strong> deterministic neutral fixture, standardized WAV, 24 kHz, mono.</p>
          <p><strong>Evidence classes:</strong> objective measurements are retained separately from human and automated judgments.</p>
          <div>
            <strong>Eligibility exclusions:</strong>
            <ul>
              {result.eligibility.exclusions.map((exclusion) => <li key={`${exclusion.code}:${exclusion.scope}`}>{exclusion.detail}</li>)}
            </ul>
          </div>
          <p className="benchmark-card__hash"><strong>Run ID:</strong> {result.run.runId}</p>
        </div>
      </details>
    </section>
  );
}

function Filter({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <select aria-label={label} onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  );
}

function StaticSelect({ children, label, value }: { children: ReactNode; label: string; value: string }) {
  return (
    <label>
      <span>{label}</span>
      <select aria-label={label} onChange={() => undefined} value={value}>
        {children}
      </select>
    </label>
  );
}

function EvidenceBoundary({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="benchmark-evidence-class">
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function rankLabel(entry: LeaderboardEntry) {
  if (entry.rank === null) return "Not ranked";
  return entry.tied ? `Tie · #${entry.rank}` : `Rank #${entry.rank}`;
}

function formatStatistic(
  statistic: LeaderboardEntry["statistics"]["median"],
  unit: string,
  decimalPlaces: number,
) {
  if (statistic.availability !== "available" || statistic.value === null) {
    return `Unavailable · needs n≥${statistic.minimumSamples}`;
  }
  return formatBenchmarkMetric(statistic.value, unit, decimalPlaces);
}

export function formatBenchmarkMetric(value: number | null, unit: string, decimalPlaces: number) {
  if (value === null) return "Unavailable";
  const precision = Math.max(0, Math.min(9, Math.trunc(decimalPlaces)));
  const formatted = value.toFixed(precision);
  return `${formatted} ${unit}`;
}

function formatTimestamp(value: string) {
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function formatOptionalTimestamp(value: string | null) {
  return value === null ? "Unavailable / not observed" : formatTimestamp(value);
}

function formatObjectiveMeasurement(
  value: number | null,
  unit: string,
  availability: BenchmarkResult["objectiveMeasurements"][number]["availability"],
) {
  if (availability === "unavailable" || value === null) return `Unavailable · unit ${unit}`;
  return `${String(value)} ${unit} · ${sentenceCase(availability)}`;
}

function timeWindowKey(snapshot: BenchmarkLeaderboardSnapshot) {
  return `${snapshot.timeWindow.start}/${snapshot.timeWindow.end}`;
}

function formatTimeWindow(snapshot: BenchmarkLeaderboardSnapshot) {
  return `${formatTimestamp(snapshot.timeWindow.start)} — ${formatTimestamp(snapshot.timeWindow.end)}`;
}

function scoringProfileKey(snapshot: BenchmarkLeaderboardSnapshot) {
  return `${snapshot.scoringProfile.profileId}@${snapshot.scoringProfile.version}`;
}

function mediaDescription(entry: LeaderboardEntry) {
  const population = entry.metadata.comparablePopulation;
  const sampleRate = population.sampleRateHz === null ? "sample rate not applicable" : `${population.sampleRateHz} Hz`;
  const channels = population.channels === null ? "channels not applicable" : `${population.channels} channel${population.channels === 1 ? "" : "s"}`;
  return `${population.codec} · ${sampleRate} · ${channels}`;
}

function formatSponsorship(entry: LeaderboardEntry) {
  return entry.metadata.sponsorshipDisclosures.length
    ? entry.metadata.sponsorshipDisclosures.join("; ")
    : "None disclosed for this evidence";
}

function providerLabel(value: string) {
  return value.split("-").map((part) => part.length <= 3
    ? part.toUpperCase()
    : `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

function categoryLabel(value: string) {
  return benchmarkCategoryCatalog.find((category) => category.id === value)?.name ?? value.toUpperCase();
}

function evidenceLabel(value: string) {
  return `${sentenceCase(value)} evidence`;
}

function sentenceCase(value: string) {
  const normalized = value.replace(/[-_]/g, " ");
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function unique<T extends string>(values: readonly T[]) {
  return [...new Set(values)];
}

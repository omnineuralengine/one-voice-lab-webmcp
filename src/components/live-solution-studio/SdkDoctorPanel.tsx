"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  analyzeSdkDoctor,
  buildSdkDoctorDocsQuery,
  buildSdkDoctorCodexHandoff,
  buildSdkDoctorSupportBrief,
  toSessionSafeSdkDiagnosis,
} from "@/lib/sdk-doctor";
import { analyzeTechnicalArtifact, buildApiLabWorkbenchHandoff } from "@/lib/payload-code-workbench";
import { buildTechnicalDocsQuery, redactTechnicalInput, type DocsSearchInput } from "@/lib/live-solution-docs";
import { docsEvidenceResultSchema, type DocsEvidenceMode, type SolutionLane } from "@/types/live-solution-studio";
import type { ApiLabWorkbenchHandoff, TechnicalArtifact } from "@/types/payload-code-workbench";
import type {
  SdkDiagnosis,
  SdkDoctorSource,
} from "@/types/sdk-doctor";
import type { StackAdapterInput } from "@/types/questline";

const button =
  "inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-fuchsia-200/30 hover:bg-fuchsia-200/[.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${button} border-fuchsia-200/30 bg-fuchsia-200/[.12] text-fuchsia-50`;
const input =
  "w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-fuchsia-200/35 focus:outline-none focus:ring-2 focus:ring-fuchsia-200/15";

const STAGES = ["evidence", "environment", "diagnose", "repair", "sources", "validate", "handoff"] as const;
type Stage = (typeof STAGES)[number];

const LANGUAGES = ["auto", "javascript", "typescript", "python", "go", "dotnet", "java", "rust", "raw-http", "other"] as const;
const RUNTIMES = ["auto", "browser", "nodejs", "nextjs-client", "nextjs-server", "nextjs-route-handler", "vercel-function", "cloudflare-worker", "deno", "bun", "react-native", "python-sync", "python-async", "fastapi", "flask", "django", "go-service", "aspnet", "java-service", "spring", "rust-tokio", "cli", "container", "other"] as const;
const PRODUCTS = ["auto", "listen-prerecorded", "listen-v1-streaming", "listen-v2-flux", "speak-rest", "speak-streaming", "voice-agent", "read-text-intelligence", "manage", "auth", "self-hosted-management", "unknown"] as const;
const DEPLOYMENTS = ["auto", "deepgram-hosted", "us-global", "eu-regional", "au-regional", "deepgram-dedicated", "self-hosted", "aws-sagemaker", "customer-proxy", "unknown"] as const;
const OUTCOMES = ["fix-installed-version", "explain-error", "minimal-patch", "compare-current-stable", "plan-major-migration", "find-rest-fallback", "prepare-support-escalation", "local-validation-plan"] as const;

type Props = {
  open: boolean;
  requestedArtifactId: string | null;
  sessionId: string;
  artifacts: TechnicalArtifact[];
  diagnoses: SdkDiagnosis[];
  lanes: SolutionLane[];
  stack: StackAdapterInput;
  constraints: string[];
  onOpenChange: (open: boolean) => void;
  onRequestedArtifactHandled: () => void;
  onDiagnosesChange: (diagnoses: SdkDiagnosis[]) => void;
  onNotice: (message: string) => void;
  onSendToApiLab: (handoff: ApiLabWorkbenchHandoff) => void;
};

function humanize(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeTechnicalText(value: string, max = 500) {
  return redactTechnicalInput(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/(?:https?|wss?):\/\/\S+/gi, "[URL removed]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeDocsSources(value: unknown): { mode: DocsEvidenceMode; message: string; sources: SdkDoctorSource[] } {
  const parsed = docsEvidenceResultSchema.parse(value);
  return {
    mode: parsed.mode,
    message: parsed.message,
    sources: parsed.evidence.slice(0, 8).map((item) => ({
      id: `docs-${item.id}`.slice(0, 200),
      title: item.title,
      canonicalUrl: item.officialUrl,
      authority: "official-deepgram-docs" as const,
      sourceType: /feature|matrix/i.test(item.title) ? "feature-matrix" as const : "guide" as const,
      supportsClaim: item.supportedClaim,
      relevantToVersion: null,
      retrievedAt: item.retrievedAt,
      lastVerifiedAt: item.retrievedAt,
      freshness: item.verificationState === "live-retrieved" ? "fresh" as const : "offline-cached" as const,
      verificationState: item.verificationState === "live-retrieved" ? "live-retrieved" as const : "cached-fallback" as const,
    })),
  };
}

function focusTab(event: ReactKeyboardEvent<HTMLButtonElement>, stage: Stage, setStage: (stage: Stage) => void) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = STAGES.indexOf(stage);
  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? STAGES.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + STAGES.length) % STAGES.length;
  const next = STAGES[nextIndex];
  setStage(next);
  requestAnimationFrame(() => event.currentTarget.closest<HTMLElement>("[role=tablist]")?.querySelector<HTMLButtonElement>(`[data-sdk-doctor-stage='${next}']`)?.focus());
}

export function SdkDoctorPanel({
  open,
  requestedArtifactId,
  sessionId,
  artifacts,
  diagnoses,
  lanes,
  stack,
  constraints,
  onOpenChange,
  onRequestedArtifactHandled,
  onDiagnosesChange,
  onNotice,
  onSendToApiLab,
}: Props) {
  const regionId = useId();
  const [stage, setStage] = useState<Stage>("evidence");
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [code, setCode] = useState("");
  const [errorText, setErrorText] = useState("");
  const [stackTrace, setStackTrace] = useState("");
  const [manifest, setManifest] = useState("");
  const [lockfile, setLockfile] = useState("");
  const [installedPackageOutput, setInstalledPackageOutput] = useState("");
  const [environment, setEnvironment] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [observedBehavior, setObservedBehavior] = useState("");
  const [framework, setFramework] = useState("");
  const [operatingSystem, setOperatingSystem] = useState("");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>("auto");
  const [runtime, setRuntime] = useState<(typeof RUNTIMES)[number]>("auto");
  const [product, setProduct] = useState<(typeof PRODUCTS)[number]>("auto");
  const [deployment, setDeployment] = useState<(typeof DEPLOYMENTS)[number]>("auto");
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]>("fix-installed-version");
  const [targetVersion, setTargetVersion] = useState("");
  const [diagnosis, setDiagnosis] = useState<SdkDiagnosis | null>(null);
  const [liveSources, setLiveSources] = useState<SdkDoctorSource[]>([]);
  const [docsMode, setDocsMode] = useState<DocsEvidenceMode | "idle">("idle");
  const [docsMessage, setDocsMessage] = useState("");
  const [searchingDocs, setSearchingDocs] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [showCodex, setShowCodex] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [customerImpact, setCustomerImpact] = useState("");

  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;
  const docsQuery = diagnosis ? buildSdkDoctorDocsQuery(diagnosis) : "";

  const docsInput = useMemo<DocsSearchInput | null>(() => {
    if (!diagnosis || !docsQuery) return null;
    const safeStack = Object.fromEntries(Object.entries(stack).map(([key, value]) => [key, safeTechnicalText(String(value ?? ""), 120)]).filter(([, value]) => value && !/^unknown$/i.test(value))) as Partial<StackAdapterInput>;
    return {
      confirmedProblem: docsQuery,
      lanes,
      stack: safeStack,
      constraints: constraints.map((item) => safeTechnicalText(item, 240)).filter(Boolean).slice(0, 8),
      desiredOutcome: humanize(outcome),
    };
  }, [constraints, diagnosis, docsQuery, lanes, outcome, stack]);
  const outgoingQuery = useMemo(() => docsInput ? buildTechnicalDocsQuery(docsInput) : "", [docsInput]);
  const apiLabArtifact = useMemo(() => {
    if (selectedArtifact) return selectedArtifact;
    if (!diagnosis || !code.trim()) return null;
    try {
      const candidate = analyzeTechnicalArtifact({
        id: `sdk-doctor-api-${diagnosis.id}`.slice(0, 200),
        sessionId,
        input: code,
        now: diagnosis.analyzedAt,
      });
      return candidate.normalizedRepresentation.request && candidate.extractedEndpoint ? candidate : null;
    } catch { return null; }
  }, [code, diagnosis, selectedArtifact, sessionId]);

  useEffect(() => {
    if (!requestedArtifactId) return;
    const artifact = artifacts.find((item) => item.id === requestedArtifactId);
    if (artifact) loadArtifact(artifact);
    onRequestedArtifactHandled();
    // loadArtifact is intentionally event-driven; the artifact ID is the stable trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedArtifactId]);

  function loadArtifact(artifact: TechnicalArtifact) {
    setSelectedArtifactId(artifact.id);
    if (["error-message", "application-log", "raw-http-response", "json-response"].includes(artifact.artifactType)) {
      setErrorText(artifact.redactedInput);
    } else {
      setCode(artifact.redactedInput);
    }
    setLanguage(artifact.detectedLanguage === "javascript" || artifact.detectedLanguage === "typescript" || artifact.detectedLanguage === "python" ? artifact.detectedLanguage : "auto");
    setDiagnosis(null);
    setLiveSources([]);
    setDocsMode("idle");
    setDocsMessage("");
    setAnalysisError("");
    setStage("evidence");
    onOpenChange(true);
    onNotice("SDK Doctor loaded the persisted redacted artifact. Nothing was analyzed or submitted automatically.");
  }

  function analyze(sources = liveSources) {
    if (![code, errorText, stackTrace, manifest, lockfile, installedPackageOutput, environment, expectedBehavior, observedBehavior].some((value) => value.trim()) && !selectedArtifact) {
      setAnalysisError("Add code, an exact error, dependency evidence, or environment detail before diagnosing.");
      return null;
    }
    try {
      const next = analyzeSdkDoctor({
        id: diagnosis?.id,
        sessionId,
        sourceArtifacts: selectedArtifact ? [selectedArtifact] : [],
        code,
        errorText,
        stackTrace,
        manifest,
        lockfile,
        installedPackageOutput,
        environment,
        expectedBehavior,
        observedBehavior,
        operatingSystem: operatingSystem || null,
        framework: framework || null,
        selections: {
          language,
          runtime,
          deepgramProduct: product,
          deploymentTarget: deployment,
          desiredOutcome: outcome,
          targetSdkVersion: targetVersion || null,
        },
        documentationSources: sources,
        includeInSession: true,
        includeInExport: diagnosis?.includeInExport ?? true,
        includeCodeInExport: diagnosis?.includeCodeInExport ?? false,
      });
      setDiagnosis(next);
      setAnalysisError("");
      setStage("diagnose");
      onNotice("Redacted evidence analyzed locally. No code ran and no network request was made.");
      return next;
    } catch {
      setAnalysisError("The SDK evidence could not be validated. Shorten the input or correct the selected environment details.");
      return null;
    }
  }

  async function searchOfficialDocs() {
    if (!docsInput || !diagnosis) return;
    setSearchingDocs(true);
    setDocsMessage("");
    try {
      const response = await fetch("/api/deepgram-docs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docsInput),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string" ? String((body as Record<string, unknown>).error) : "Official documentation search is unavailable.");
      const normalized = normalizeDocsSources(body);
      setLiveSources(normalized.sources);
      setDocsMode(normalized.mode);
      setDocsMessage(normalized.message);
      analyze(normalized.sources);
      setStage("sources");
      onNotice(normalized.mode === "live-docs" ? "Diagnosis refreshed with live official Deepgram evidence." : "Live docs were unavailable; the dated official fallback is labeled clearly.");
    } catch (error) {
      setDocsMode("unavailable");
      setDocsMessage(error instanceof Error ? error.message : "Official documentation source unavailable.");
      setStage("sources");
      onNotice("Official docs search failed. The local version-aware diagnosis and dated source snapshot remain available.");
    } finally {
      setSearchingDocs(false);
    }
  }

  function attachDiagnosis() {
    if (!diagnosis) return;
    try {
      const safe = toSessionSafeSdkDiagnosis(diagnosis);
      const next = diagnoses.some((item) => item.id === safe.id) ? diagnoses.map((item) => item.id === safe.id ? safe : item) : [...diagnoses, safe];
      onDiagnosesChange(next);
      onNotice("SDK diagnosis attached to this session in redacted form. Local validation remains pending.");
    } catch {
      onNotice("The diagnosis could not be validated for redacted session storage.");
    }
  }

  function openDiagnosis(item: SdkDiagnosis) {
    const safe = toSessionSafeSdkDiagnosis(item);
    setDiagnosis(safe);
    setCode(safe.codeRedacted);
    setErrorText(safe.errorTextRedacted);
    setStackTrace(safe.stackTraceRedacted);
    setManifest(safe.manifestRedacted);
    setEnvironment(safe.normalizedEnvironment.environmentNotesRedacted);
    setExpectedBehavior(safe.expectedBehavior);
    setObservedBehavior(safe.observedBehavior);
    setLanguage(safe.language === "unknown" ? "auto" : safe.language);
    setRuntime(safe.runtime === "unknown" ? "auto" : safe.runtime);
    setProduct(safe.deepgramProduct);
    setDeployment(safe.deploymentTarget);
    setOutcome(safe.desiredOutcome);
    setTargetVersion(safe.targetSdkVersion ?? "");
    setSelectedArtifactId(safe.sourceArtifactIds[0] ?? "");
    setLiveSources(safe.documentationSources.filter((source) => source.verificationState === "live-retrieved"));
    setStage("diagnose");
    onOpenChange(true);
    onNotice("Editing the persisted redacted diagnosis. Original unredacted evidence was not retained.");
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(`${label} copied. Local review is required.`);
    } catch {
      onNotice("Clipboard access is unavailable. Use the preview to copy manually.");
    }
  }

  function sendToApiLab() {
    if (!apiLabArtifact) return;
    try {
      onSendToApiLab(buildApiLabWorkbenchHandoff(apiLabArtifact, { sourceDiagnosisId: diagnosis?.id ?? null }));
      onNotice("Normalized redacted request prepared for API Lab. Nothing was executed.");
    } catch {
      onNotice("The selected evidence does not contain a supported normalized API request.");
    }
  }

  const codexPrompt = diagnosis ? buildSdkDoctorCodexHandoff(diagnosis) : "";
  const supportBrief = diagnosis ? `${buildSdkDoctorSupportBrief(diagnosis)}\n\n## Customer impact (entered manually)\n\n${safeTechnicalText(customerImpact, 2_000) || "Not provided."}` : "";

  return (
    <section className="border-t border-fuchsia-200/15 bg-fuchsia-300/[.025]" data-testid="sdk-doctor">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`${regionId}-title`} className="text-sm font-semibold text-white">Deepgram SDK Doctor <span aria-hidden="true">🧪</span></h3>
            <span className="rounded-full border border-fuchsia-200/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-fuchsia-100">analysis first</span>
            {diagnoses.length ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-slate-400">{diagnoses.length} diagnosis{diagnoses.length === 1 ? "" : "es"} attached</span> : null}
          </div>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-slate-500">Diagnose Deepgram SDK, API, runtime, version, and integration evidence. No customer code, command, connection, audio, or billable operation is executed.</p>
        </div>
        <button type="button" className={open ? primary : button} aria-expanded={open} aria-controls={`${regionId}-body`} onClick={() => onOpenChange(!open)}>{open ? "Close SDK Doctor" : "Open SDK Doctor"}</button>
      </div>

      {open ? <div id={`${regionId}-body`} className="border-t border-white/8 p-3 sm:p-4">
        <div role="tablist" aria-label="SDK Doctor stages" className="flex gap-1 overflow-x-auto pb-2">
          {STAGES.map((item, index) => <button key={item} type="button" role="tab" data-sdk-doctor-stage={item} aria-selected={stage === item} aria-controls={`${regionId}-${item}`} tabIndex={stage === item ? 0 : -1} className={stage === item ? primary : button} onKeyDown={(event) => focusTab(event, stage, setStage)} onClick={() => setStage(item)}>{index + 1}. {humanize(item)}</button>)}
        </div>

        <div id={`${regionId}-${stage}`} role="tabpanel" className="mt-3 rounded-lg border border-white/8 bg-black/15 p-3">
          {stage === "evidence" ? <EvidenceStage artifacts={artifacts} selectedArtifactId={selectedArtifactId} setSelectedArtifactId={(id) => { const artifact = artifacts.find((item) => item.id === id); if (artifact) loadArtifact(artifact); else setSelectedArtifactId(""); }} code={code} setCode={setCode} errorText={errorText} setErrorText={setErrorText} stackTrace={stackTrace} setStackTrace={setStackTrace} manifest={manifest} setManifest={setManifest} lockfile={lockfile} setLockfile={setLockfile} installedPackageOutput={installedPackageOutput} setInstalledPackageOutput={setInstalledPackageOutput} expectedBehavior={expectedBehavior} setExpectedBehavior={setExpectedBehavior} observedBehavior={observedBehavior} setObservedBehavior={setObservedBehavior} /> : null}
          {stage === "environment" ? <EnvironmentStage language={language} setLanguage={setLanguage} runtime={runtime} setRuntime={setRuntime} product={product} setProduct={setProduct} deployment={deployment} setDeployment={setDeployment} outcome={outcome} setOutcome={setOutcome} framework={framework} setFramework={setFramework} operatingSystem={operatingSystem} setOperatingSystem={setOperatingSystem} environment={environment} setEnvironment={setEnvironment} targetVersion={targetVersion} setTargetVersion={setTargetVersion} /> : null}
          {stage === "diagnose" ? <DiagnosisStage diagnosis={diagnosis} onAnalyze={() => analyze()} /> : null}
          {stage === "repair" ? <RepairStage diagnosis={diagnosis} /> : null}
          {stage === "sources" ? <SourcesStage diagnosis={diagnosis} query={outgoingQuery} mode={docsMode} message={docsMessage} searching={searchingDocs} onSearch={() => void searchOfficialDocs()} /> : null}
          {stage === "validate" ? <ValidationStage diagnosis={diagnosis} /> : null}
          {stage === "handoff" ? <HandoffStage diagnosis={diagnosis} codexPrompt={codexPrompt} supportBrief={supportBrief} customerImpact={customerImpact} setCustomerImpact={setCustomerImpact} showCodex={showCodex} setShowCodex={setShowCodex} showSupport={showSupport} setShowSupport={setShowSupport} canSendToApiLab={Boolean(apiLabArtifact)} onCopy={copyText} onAttach={attachDiagnosis} onSendToApiLab={sendToApiLab} onExportChange={(key, checked) => setDiagnosis((current) => current ? { ...current, [key]: checked, updatedAt: new Date().toISOString() } : current)} /> : null}
        </div>

        {analysisError ? <p role="alert" className="mt-3 rounded-md border border-rose-200/20 bg-rose-200/[.06] p-2 text-xs text-rose-100">{analysisError}</p> : null}
        {!diagnosis && stage !== "diagnose" ? <button type="button" className={`${primary} mt-3 w-full sm:w-auto`} onClick={() => analyze()}>Diagnose redacted evidence</button> : null}
        <p className="mt-3 text-[9px] leading-4 text-slate-600">The Doctor is not a compiler or service reproduction. Confidence is categorical, source freshness is visible, and generated repairs require validation in the real project.</p>
      </div> : null}

      {diagnoses.length ? <div className="border-t border-white/8 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Attached SDK diagnoses</p>
        <div className="mt-2 grid gap-2">
          {diagnoses.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/15 p-3">
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">SDK Doctor / {humanize(item.language)}</p><p className="mt-1 text-[10px] text-slate-400">{item.packageName ?? "SDK package unknown"}{item.resolvedSdkVersion ? ` / ${item.resolvedSdkVersion} from ${humanize(item.versionSource)}` : " / exact version unknown"} / {humanize(item.deepgramProduct)}</p><p className="mt-1 text-[10px] text-fuchsia-100">{item.diagnosisItems[0]?.title ?? "More evidence required"} / {item.confidence} confidence / {humanize(item.status)}</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => openDiagnosis(item)}>Open diagnosis</button><button type="button" className={button} onClick={() => onDiagnosesChange(diagnoses.map((candidate) => candidate.id === item.id ? { ...candidate, includeInExport: !candidate.includeInExport, updatedAt: new Date().toISOString() } : candidate))}>{item.includeInExport ? "Exclude from export" : "Include in export"}</button><button type="button" className={button} onClick={() => onDiagnosesChange(diagnoses.filter((candidate) => candidate.id !== item.id))}>Remove</button></div>
          </article>)}
        </div>
      </div> : null}
    </section>
  );
}

type EvidenceSetter = (value: string) => void;
function EvidenceStage(props: { artifacts: TechnicalArtifact[]; selectedArtifactId: string; setSelectedArtifactId: EvidenceSetter; code: string; setCode: EvidenceSetter; errorText: string; setErrorText: EvidenceSetter; stackTrace: string; setStackTrace: EvidenceSetter; manifest: string; setManifest: EvidenceSetter; lockfile: string; setLockfile: EvidenceSetter; installedPackageOutput: string; setInstalledPackageOutput: EvidenceSetter; expectedBehavior: string; setExpectedBehavior: EvidenceSetter; observedBehavior: string; setObservedBehavior: EvidenceSetter }) {
  return <div><h4 className="text-xs font-semibold text-white">Observed customer evidence</h4><p className="mt-1 text-[10px] leading-4 text-slate-500">Paste the smallest useful excerpts. Secrets are redacted before diagnosis persistence; unredacted drafts disappear on refresh.</p>
    {props.artifacts.length ? <label className="mt-3 block text-[10px] text-slate-400">Attached technical artifact<select aria-label="SDK Doctor source artifact" value={props.selectedArtifactId} onChange={(event) => props.setSelectedArtifactId(event.target.value)} className={`mt-1 ${input}`}><option value="">None selected</option>{props.artifacts.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.title} · {artifact.artifactType}</option>)}</select></label> : null}
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <TextEvidence label="Relevant code or API request" value={props.code} setValue={props.setCode} rows={10} maxLength={120000} placeholder="Paste the smallest failing Deepgram integration excerpt…" />
      <div className="grid gap-3"><TextEvidence label="Exact error" value={props.errorText} setValue={props.setErrorText} rows={4} maxLength={40000} placeholder="Paste the exact redacted error…" /><TextEvidence label="Stack trace or relevant logs" value={props.stackTrace} setValue={props.setStackTrace} rows={4} maxLength={60000} placeholder="Paste a bounded excerpt…" /></div>
      <TextEvidence label="Dependency manifest" value={props.manifest} setValue={props.setManifest} rows={6} maxLength={80000} placeholder="package.json, pyproject.toml, go.mod, .csproj, pom.xml, Cargo.toml…" />
      <div className="grid gap-3"><TextEvidence label="Lockfile excerpt" value={props.lockfile} setValue={props.setLockfile} rows={4} maxLength={100000} placeholder="Paste only the relevant resolved dependency entry…" /><TextEvidence label="Installed-package output" value={props.installedPackageOutput} setValue={props.setInstalledPackageOutput} rows={3} maxLength={40000} placeholder="npm list, pip freeze, go list -m, dotnet list package…" /></div>
      <TextEvidence label="Expected behavior" value={props.expectedBehavior} setValue={props.setExpectedBehavior} rows={3} maxLength={12000} placeholder="What should happen?" />
      <TextEvidence label="Observed behavior" value={props.observedBehavior} setValue={props.setObservedBehavior} rows={3} maxLength={12000} placeholder="What happens instead?" />
    </div>
  </div>;
}

function TextEvidence({ label, value, setValue, rows, maxLength, placeholder }: { label: string; value: string; setValue: EvidenceSetter; rows: number; maxLength: number; placeholder: string }) {
  return <label className="block text-[10px] text-slate-400">{label}<textarea aria-label={label} value={value} onChange={(event) => setValue(event.target.value)} rows={rows} maxLength={maxLength} placeholder={placeholder} className={`mt-1 resize-y font-mono leading-5 ${input}`} /><span className="mt-1 block text-right text-[9px] text-slate-600">{value.length.toLocaleString()} / {maxLength.toLocaleString()}</span></label>;
}

function EnvironmentStage(props: { language: (typeof LANGUAGES)[number]; setLanguage: (value: (typeof LANGUAGES)[number]) => void; runtime: (typeof RUNTIMES)[number]; setRuntime: (value: (typeof RUNTIMES)[number]) => void; product: (typeof PRODUCTS)[number]; setProduct: (value: (typeof PRODUCTS)[number]) => void; deployment: (typeof DEPLOYMENTS)[number]; setDeployment: (value: (typeof DEPLOYMENTS)[number]) => void; outcome: (typeof OUTCOMES)[number]; setOutcome: (value: (typeof OUTCOMES)[number]) => void; framework: string; setFramework: EvidenceSetter; operatingSystem: string; setOperatingSystem: EvidenceSetter; environment: string; setEnvironment: EvidenceSetter; targetVersion: string; setTargetVersion: EvidenceSetter }) {
  const select = <T extends string>(label: string, value: T, values: readonly T[], setter: (value: T) => void) => <label className="text-[10px] text-slate-400">{label}<select aria-label={`SDK Doctor ${label}`} value={value} onChange={(event) => setter(event.target.value as T)} className={`mt-1 ${input}`}>{values.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label>;
  return <div><h4 className="text-xs font-semibold text-white">Environment and repair intent</h4><p className="mt-1 text-[10px] text-slate-500">Auto is acceptable. Unknown details stay unknown and become prioritized evidence requests when they change the diagnosis.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{select("language", props.language, LANGUAGES, props.setLanguage)}{select("runtime", props.runtime, RUNTIMES, props.setRuntime)}{select("Deepgram product", props.product, PRODUCTS, props.setProduct)}{select("deployment", props.deployment, DEPLOYMENTS, props.setDeployment)}{select("desired outcome", props.outcome, OUTCOMES, props.setOutcome)}<label className="text-[10px] text-slate-400">Target SDK version (optional)<input aria-label="SDK Doctor target version" className={`mt-1 ${input}`} value={props.targetVersion} onChange={(event) => props.setTargetVersion(event.target.value)} placeholder="Do not guess" /></label><label className="text-[10px] text-slate-400">Framework<input aria-label="SDK Doctor framework" className={`mt-1 ${input}`} value={props.framework} onChange={(event) => props.setFramework(event.target.value)} placeholder="Auto / unknown" /></label><label className="text-[10px] text-slate-400">Operating system<input aria-label="SDK Doctor operating system" className={`mt-1 ${input}`} value={props.operatingSystem} onChange={(event) => props.setOperatingSystem(event.target.value)} placeholder="Unknown" /></label></div><label className="mt-3 block text-[10px] text-slate-400">Deployment and runtime notes<textarea aria-label="SDK Doctor environment notes" className={`mt-1 resize-y ${input}`} rows={4} maxLength={12000} value={props.environment} onChange={(event) => props.setEnvironment(event.target.value)} placeholder="Framework mode, server/client boundary, proxy, region, Dedicated, self-hosted, SageMaker, audio configuration…" /></label></div>;
}

function DiagnosisStage({ diagnosis, onAnalyze }: { diagnosis: SdkDiagnosis | null; onAnalyze: () => void }) {
  if (!diagnosis) return <EmptyResult title="No diagnosis yet" detail="Analysis runs locally only after you choose Diagnose redacted evidence." action="Diagnose redacted evidence" onAction={onAnalyze} />;
  return <div><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-xs font-semibold text-white">Deterministic diagnosis</h4><p className="mt-1 text-[10px] text-slate-500">{humanize(diagnosis.status)} · {diagnosis.confidence} confidence · analyzed {new Date(diagnosis.analyzedAt).toLocaleString()}</p></div><button type="button" className={button} onClick={onAnalyze}>Re-run local analysis</button></div><dl className="mt-3 grid gap-2 rounded-lg border border-white/8 bg-white/[.02] p-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4"><SummaryFact label="Language" value={`${humanize(diagnosis.language)} (${diagnosis.languageConfidence})`} /><SummaryFact label="SDK" value={`${diagnosis.packageName ?? "Unknown"} · ${diagnosis.resolvedSdkVersion ?? diagnosis.declaredSdkVersion ?? "exact version unknown"}`} /><SummaryFact label="Version source" value={humanize(diagnosis.versionSource)} /><SummaryFact label="Support status" value={humanize(diagnosis.sdkSupportStatus)} /><SummaryFact label="Runtime" value={`${humanize(diagnosis.runtime)} (${diagnosis.runtimeConfidence})`} /><SummaryFact label="Product" value={humanize(diagnosis.deepgramProduct)} /><SummaryFact label="Deployment" value={humanize(diagnosis.deploymentTarget)} /><SummaryFact label="Source freshness" value={humanize(diagnosis.sourceFreshness.status)} /></dl><div className="mt-3 grid gap-3 lg:grid-cols-2"><EvidenceList title="Observed customer evidence" items={diagnosis.observedEvidence.map((item) => `${item.label}: ${item.value}`)} tone="emerald" /><EvidenceList title="Inferred evidence" items={diagnosis.inferredEvidence.map((item) => `${item.label}: ${item.value}`)} tone="amber" /></div><div className="mt-3 space-y-2">{diagnosis.diagnosisItems.map((item) => <article key={item.id} className="rounded-lg border border-white/8 bg-white/[.02] p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-white">{item.title}</strong><span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">{item.status}</span><span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">{item.layer}</span><span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">{item.confidence}</span></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{item.explanation}</p>{!item.safeToStateAsFact ? <p className="mt-2 text-[9px] text-amber-200">Interpretation—not safe to state as a confirmed fact without more evidence.</p> : null}</article>)}</div>{diagnosis.missingEvidence.length ? <div className="mt-3 rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3"><h5 className="text-[10px] font-bold uppercase tracking-wide text-amber-100">Most useful next evidence</h5><ol className="mt-2 space-y-2 text-[10px] text-slate-300">{diagnosis.missingEvidence.map((item, index) => <li key={item.id}>{index + 1}. <strong>{item.label}</strong> — {item.whyItMatters}</li>)}</ol></div> : null}</div>;
}

function RepairStage({ diagnosis }: { diagnosis: SdkDiagnosis | null }) {
  if (!diagnosis) return <EmptyResult title="Diagnosis required" detail="Repair candidates are generated only after deterministic analysis." />;
  return <div><h4 className="text-xs font-semibold text-white">Repair options</h4><p className="mt-1 text-[10px] text-slate-500">Nothing below was applied, compiled, or run. “Minimal” targets the detected installed version; migration remains a separate option.</p><div className="mt-3 space-y-3">{diagnosis.suggestedRepairs.map((repair) => { const diff = diagnosis.generatedDiffs.find((item) => item.id === repair.diffId); return <article key={repair.id} className="rounded-lg border border-white/8 bg-white/[.02] p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-white">{repair.title}</strong><span className="rounded border border-fuchsia-200/15 px-1.5 py-0.5 text-[9px] text-fuchsia-100">{humanize(repair.mode)}</span><span className="text-[9px] text-slate-500">{repair.confidence} confidence</span></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{repair.explanation}</p><dl className="mt-2 grid gap-2 text-[10px] sm:grid-cols-2"><div><dt className="text-slate-500">Security impact</dt><dd className="text-slate-300">{repair.securityImpact}</dd></div><div><dt className="text-slate-500">Compatibility impact</dt><dd className="text-slate-300">{repair.compatibilityImpact}</dd></div></dl>{diff ? <details className="mt-3 rounded border border-white/8 p-2"><summary className="cursor-pointer text-[10px] font-semibold text-fuchsia-100">Focused diff · local validation required</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-slate-300">{diff.unifiedDiff}</pre></details> : null}</article>; })}</div></div>;
}

function SourcesStage({ diagnosis, query, mode, message, searching, onSearch }: { diagnosis: SdkDiagnosis | null; query: string; mode: DocsEvidenceMode | "idle"; message: string; searching: boolean; onSearch: () => void }) {
  if (!diagnosis) return <EmptyResult title="Diagnosis required" detail="A bounded technical query is available after local analysis." />;
  return <div><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-xs font-semibold text-white">Current official Deepgram evidence</h4><p className="mt-1 max-w-3xl text-[10px] leading-4 text-slate-500">Only this derived technical query and confirmed stack/constraints leave the browser after your explicit action. Code, errors, manifests, lockfiles, transcripts, request IDs, customer details, and secrets are excluded.</p></div><button type="button" className={primary} disabled={searching || !query} onClick={onSearch}>{searching ? "Searching…" : "Search official docs"}</button></div><label className="mt-3 block text-[10px] text-slate-400">Outgoing SDK documentation query<textarea aria-label="Outgoing SDK Doctor docs query" readOnly rows={5} className={`mt-1 resize-y ${input}`} value={query} /></label><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400">{mode === "idle" ? "not searched" : mode}</span><span className="text-[9px] text-slate-500">Snapshot: {diagnosis.sourceFreshness.status}{diagnosis.sourceFreshness.newestVerifiedAt ? ` · ${new Date(diagnosis.sourceFreshness.newestVerifiedAt).toLocaleDateString()}` : ""}</span></div>{message ? <p className="mt-2 text-[10px] text-slate-400">{message}</p> : null}{diagnosis.sourceFreshness.warning ? <p className="mt-2 text-[10px] text-amber-200">{diagnosis.sourceFreshness.warning}</p> : null}<div className="mt-3 grid gap-2">{[...diagnosis.documentationSources, ...diagnosis.migrationSources].filter((source, index, all) => all.findIndex((candidate) => candidate.canonicalUrl === source.canonicalUrl) === index).map((source) => <article key={source.id} className="rounded-lg border border-white/8 bg-white/[.02] p-3"><div className="flex flex-wrap items-center gap-2"><a className="text-xs font-semibold text-cyan-200 underline decoration-cyan-200/30 underline-offset-2" href={source.canonicalUrl} target="_blank" rel="noreferrer">{source.title}</a><span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">{source.authority}</span><span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">{source.verificationState}</span></div><p className="mt-2 text-[10px] leading-4 text-slate-300">Supports: {source.supportsClaim}</p><p className="mt-1 text-[9px] text-slate-600">{source.freshness} · last verified {source.lastVerifiedAt ? new Date(source.lastVerifiedAt).toLocaleString() : "unknown"}</p></article>)}</div></div>;
}

function ValidationStage({ diagnosis }: { diagnosis: SdkDiagnosis | null }) {
  if (!diagnosis) return <EmptyResult title="Diagnosis required" detail="The Doctor creates a safe validation plan but does not run it." />;
  return <div><h4 className="text-xs font-semibold text-white">Validation plan</h4><p className="mt-1 text-[10px] text-slate-500">Generated commands are copy-only and adapted to detected tooling. Review project scripts before running them; “Executed” remains false until evidence is attached from the real project.</p>{(["static-review", "local-project", "safe-deepgram-test"] as const).map((level, index) => <section key={level} className="mt-3 rounded-lg border border-white/8 bg-white/[.02] p-3"><h5 className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Level {index + 1} / {humanize(level)}</h5><ul className="mt-2 space-y-2">{diagnosis.generatedValidationPlan.filter((item) => item.level === level).map((item) => <li key={item.id} className="text-[10px] leading-4 text-slate-300"><strong>{item.label}</strong> — {item.rationale}{item.command ? <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[10px] text-cyan-100">{item.command}</pre> : null}<span className="mt-1 block text-[9px] text-slate-600">Generated / not executed / {item.safe ? "read-only command" : "review project-defined behavior first"}{item.requiresExplicitConfirmation ? " / explicit confirmation required" : ""}</span></li>)}</ul></section>)}</div>;
}

function HandoffStage({ diagnosis, codexPrompt, supportBrief, customerImpact, setCustomerImpact, showCodex, setShowCodex, showSupport, setShowSupport, canSendToApiLab, onCopy, onAttach, onSendToApiLab, onExportChange }: { diagnosis: SdkDiagnosis | null; codexPrompt: string; supportBrief: string; customerImpact: string; setCustomerImpact: EvidenceSetter; showCodex: boolean; setShowCodex: (value: boolean) => void; showSupport: boolean; setShowSupport: (value: boolean) => void; canSendToApiLab: boolean; onCopy: (value: string, label: string) => Promise<void>; onAttach: () => void; onSendToApiLab: () => void; onExportChange: (key: "includeInExport" | "includeCodeInExport", checked: boolean) => void }) {
  if (!diagnosis) return <EmptyResult title="Diagnosis required" detail="Codex and support handoffs are generated only from a validated redacted diagnosis." />;
  return <div><h4 className="text-xs font-semibold text-white">Reviewable handoffs</h4><p className="mt-1 text-[10px] leading-4 text-slate-500">Nothing is sent automatically. Preview every redacted artifact and validate it inside the real customer project before sharing.</p><label className="mt-3 block text-[10px] text-slate-400">Customer impact (optional; support brief only)<textarea aria-label="SDK Doctor customer impact" value={customerImpact} onChange={(event) => setCustomerImpact(event.target.value)} rows={3} maxLength={2000} className={`mt-1 resize-y ${input}`} placeholder="Describe impact without customer identifiers or transcript content…" /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primary} onClick={onAttach}>Attach diagnosis to session</button><button type="button" className={button} onClick={() => setShowCodex(!showCodex)}>Preview Codex repair prompt</button><button type="button" className={button} onClick={() => void onCopy(codexPrompt, "Redacted Codex repair prompt")}>Copy Redacted Codex Repair Prompt</button><button type="button" className={button} onClick={() => setShowSupport(!showSupport)}>Preview support brief</button><button type="button" className={button} onClick={() => void onCopy(supportBrief, "Support brief")}>Prepare Support Brief</button><button type="button" className={button} disabled={!canSendToApiLab} onClick={onSendToApiLab}>Send normalized request to API Lab</button></div><div className="mt-3 flex flex-wrap gap-4"><label className="flex items-center gap-2 text-[10px] text-slate-300"><input type="checkbox" checked={diagnosis.includeInExport} onChange={(event) => onExportChange("includeInExport", event.target.checked)} />Include diagnosis in field brief</label><label className="flex items-center gap-2 text-[10px] text-slate-300"><input type="checkbox" checked={diagnosis.includeCodeInExport} onChange={(event) => onExportChange("includeCodeInExport", event.target.checked)} />Include redacted code/diff in export</label></div><p className="mt-2 text-[9px] text-amber-200">Local validation required. Support brief is prepared only; it is never submitted.</p>{showCodex ? <Preview label="Redacted Codex repair prompt" value={codexPrompt} /> : null}{showSupport ? <Preview label="Redacted support brief" value={supportBrief} /> : null}</div>;
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-slate-200">{value}</dd></div>;
}

function EvidenceList({ title, items, tone }: { title: string; items: string[]; tone: "emerald" | "amber" }) {
  return <section className={`rounded-lg border p-3 ${tone === "emerald" ? "border-emerald-200/15 bg-emerald-200/[.04]" : "border-amber-200/15 bg-amber-200/[.04]"}`}><h5 className={`text-[10px] font-bold uppercase tracking-wide ${tone === "emerald" ? "text-emerald-100" : "text-amber-100"}`}>{title}</h5><ul className="mt-2 space-y-1 text-[10px] leading-4 text-slate-300">{items.length ? items.slice(0, 12).map((item, index) => <li key={`${index}-${item}`}>• {item}</li>) : <li>None observed.</li>}</ul></section>;
}

function EmptyResult({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="grid min-h-40 place-items-center text-center"><div><p className="text-xs font-semibold text-white">{title}</p><p className="mt-2 max-w-md text-[10px] leading-4 text-slate-500">{detail}</p>{action && onAction ? <button type="button" className={`${primary} mt-3`} onClick={onAction}>{action}</button> : null}</div></div>;
}

function Preview({ label, value }: { label: string; value: string }) {
  return <label className="mt-3 block text-[10px] text-slate-400">{label}<textarea aria-label={label} readOnly rows={14} className={`mt-1 resize-y font-mono leading-5 ${input}`} value={value} /></label>;
}

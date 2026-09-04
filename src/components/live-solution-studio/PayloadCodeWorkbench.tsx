"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  analyzeTechnicalArtifact,
  buildApiLabWorkbenchHandoff,
  buildTechnicalArtifactDocsQuery,
  buildTechnicalArtifactDocsSearchInput,
  detectTechnicalArtifact,
  MAX_TECHNICAL_ARTIFACT_INPUT,
  toSessionSafeTechnicalArtifact,
} from "@/lib/payload-code-workbench";
import {
  buildTechnicalDocsQuery,
  redactTechnicalInput,
  type DocsSearchInput,
} from "@/lib/live-solution-docs";
import type {
  ApiLabWorkbenchHandoff,
  DetectedTechnicalLanguage,
  RelatedTechnicalDocumentation,
  TechnicalArtifact,
  TechnicalArtifactType,
} from "@/types/payload-code-workbench";
import {
  DETECTED_TECHNICAL_LANGUAGES,
  TECHNICAL_ARTIFACT_TYPES,
} from "@/types/payload-code-workbench";
import type {
  DocsEvidenceResult,
  DocsEvidenceMode,
  SolutionLane,
} from "@/types/live-solution-studio";
import { docsEvidenceResultSchema } from "@/types/live-solution-studio";
import type { SdkDiagnosis } from "@/types/sdk-doctor";
import type { StackAdapterInput } from "@/types/questline";
import { SdkDoctorPanel } from "@/components/live-solution-studio/SdkDoctorPanel";
import { SDK_DOCTOR_OPEN_EVENT } from "@/lib/sdk-doctor-events";

const button =
  "inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:bg-cyan-200/[.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${button} border-cyan-200/30 bg-cyan-200/[.12] text-cyan-50`;
const input =
  "w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-200/30 focus:outline-none focus:ring-2 focus:ring-cyan-200/20";

const WORKBENCH_CATEGORIES = [
  { id: "payload", label: "Payload" },
  { id: "code", label: "Code" },
  { id: "request", label: "Request" },
  { id: "response", label: "Response" },
  { id: "error-log", label: "Error / Log" },
] as const;

const ANALYSIS_VIEWS = [
  { id: "original", label: "Original" },
  { id: "redacted", label: "Redacted" },
  { id: "formatted", label: "Formatted" },
  { id: "parsed", label: "Parsed" },
  { id: "suggested-fix", label: "Suggested Fix" },
  { id: "documentation", label: "Documentation" },
] as const;

type WorkbenchCategory = (typeof WORKBENCH_CATEGORIES)[number]["id"];
type AnalysisView = (typeof ANALYSIS_VIEWS)[number]["id"];

export type EphemeralTechnicalDraft = {
  input: string;
  category: WorkbenchCategory;
  artifactType?: TechnicalArtifactType;
  detectedLanguage?: DetectedTechnicalLanguage;
};

type Props = {
  sessionId: string;
  artifacts: TechnicalArtifact[];
  diagnoses: SdkDiagnosis[];
  confirmedProblem: string;
  lanes: SolutionLane[];
  stack: StackAdapterInput;
  constraints: string[];
  initialEphemeralDraft?: string | Partial<EphemeralTechnicalDraft> | null;
  onEphemeralDraftChange?: (draft: EphemeralTechnicalDraft | null) => void;
  onArtifactsChange: (artifacts: TechnicalArtifact[]) => void;
  onDiagnosesChange: (diagnoses: SdkDiagnosis[]) => void;
  onNotice: (message: string) => void;
  onSendToApiLab: (handoff: ApiLabWorkbenchHandoff) => void;
};

type DraftIdentity = { id: string; createdAt: string };

function newDraftIdentity(): DraftIdentity {
  const createdAt = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `technical-artifact-${Date.now().toString(36)}`,
    createdAt,
  };
}

function initialDraftValue(
  draft: Props["initialEphemeralDraft"],
): EphemeralTechnicalDraft {
  if (typeof draft === "string") {
    return { input: draft.slice(0, MAX_TECHNICAL_ARTIFACT_INPUT), category: "payload" };
  }
  return {
    input: (draft?.input ?? "").slice(0, MAX_TECHNICAL_ARTIFACT_INPUT),
    category: isWorkbenchCategory(draft?.category) ? draft.category : "payload",
    artifactType: draft?.artifactType,
    detectedLanguage: draft?.detectedLanguage,
  };
}

function isWorkbenchCategory(value: unknown): value is WorkbenchCategory {
  return WORKBENCH_CATEGORIES.some((item) => item.id === value);
}

function humanize(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanDocsContext(value: string, limit = 240) {
  return redactTechnicalInput(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/https?:\/\/\S+/gi, "[URL removed]")
    .replace(/\b(?:Bearer|Token|Basic)\s+[A-Za-z0-9._~+\/-]{8,}={0,2}\b/gi, "[credential removed]")
    .replace(/\b(?:sk|dg|ghp|github_pat|AIza)[-_A-Za-z0-9]{10,}\b/g, "[credential removed]")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function safeDocsStack(stack: StackAdapterInput): Partial<StackAdapterInput> {
  return Object.fromEntries(
    Object.entries(stack)
      .map(([key, value]) => [key, cleanDocsContext(String(value ?? ""), 120)] as const)
      .filter(([, value]) => value && !/^unknown$/i.test(value)),
  ) as Partial<StackAdapterInput>;
}

function isDocsEvidenceResult(value: unknown): value is DocsEvidenceResult {
  return docsEvidenceResultSchema.safeParse(value).success;
}

function normalizeRelatedDocumentation(
  result: DocsEvidenceResult,
): RelatedTechnicalDocumentation[] {
  return result.evidence
    .filter((item) => {
      try {
        const url = new URL(item.officialUrl);
        return url.protocol === "https:" && url.hostname === "developers.deepgram.com";
      } catch {
        return false;
      }
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.id.slice(0, 200),
      title: item.title.slice(0, 300),
      canonicalUrl: item.officialUrl,
      whyRelevant: item.whyItMatters.slice(0, 1_000),
      supportedClaim: item.supportedClaim.slice(0, 1_000),
      retrievedAt: Number.isFinite(Date.parse(item.retrievedAt)) ? item.retrievedAt : null,
      verificationState:
        item.verificationState === "live-retrieved"
          ? "live-retrieved"
          : "curated-last-verified",
    }));
}

function moveTab<T extends string>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  items: readonly { id: T }[],
  current: T,
  onChange: (next: T) => void,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.id === current),
  );
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + items.length) %
          items.length;
  const next = items[nextIndex].id;
  onChange(next);
  const tabList = event.currentTarget.closest<HTMLElement>("[role='tablist']");
  window.requestAnimationFrame(() => {
    tabList
      ?.querySelector<HTMLButtonElement>(`[data-workbench-tab='${next}']`)
      ?.focus();
  });
}

export function PayloadCodeWorkbench({
  sessionId,
  artifacts,
  diagnoses,
  confirmedProblem,
  lanes,
  stack,
  constraints,
  initialEphemeralDraft,
  onEphemeralDraftChange,
  onArtifactsChange,
  onDiagnosesChange,
  onNotice,
  onSendToApiLab,
}: Props) {
  const [initialDraft] = useState(() => initialDraftValue(initialEphemeralDraft));
  const [open, setOpen] = useState(Boolean(initialDraft.input));
  const [category, setCategory] = useState<WorkbenchCategory>(initialDraft.category);
  const [rawInput, setRawInput] = useState(initialDraft.input);
  const [typeOverride, setTypeOverride] = useState<TechnicalArtifactType | "">(
    initialDraft.artifactType ?? "",
  );
  const [languageOverride, setLanguageOverride] = useState<
    DetectedTechnicalLanguage | ""
  >(initialDraft.detectedLanguage ?? "");
  const [title, setTitle] = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [customerContext, setCustomerContext] = useState("");
  const [includeInExport, setIncludeInExport] = useState(true);
  const [includeInHandoff, setIncludeInHandoff] = useState(true);
  const [activeView, setActiveView] = useState<AnalysisView>("redacted");
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<DraftIdentity>(() => newDraftIdentity());
  const [relatedDocumentation, setRelatedDocumentation] = useState<
    RelatedTechnicalDocumentation[] | null
  >(null);
  const [docsMode, setDocsMode] = useState<DocsEvidenceMode | "idle">("idle");
  const [docsMessage, setDocsMessage] = useState("");
  const [searchingDocs, setSearchingDocs] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorArtifactId, setDoctorArtifactId] = useState<string | null>(null);
  const regionId = useId();
  const categoryPanelId = `${regionId}-category-panel`;

  useEffect(() => {
    const openDoctor = () => {
      setOpen(false);
      setDoctorOpen(true);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const doctor = document.querySelector<HTMLElement>("[data-testid='sdk-doctor']");
          doctor?.scrollIntoView({ block: "nearest" });
          doctor?.querySelector<HTMLButtonElement>("[role='tab']")?.focus();
        });
      });
    };
    window.addEventListener(SDK_DOCTOR_OPEN_EVENT, openDoctor);
    return () => window.removeEventListener(SDK_DOCTOR_OPEN_EVENT, openDoctor);
  }, []);

  const detection = useMemo(() => {
    if (!rawInput.trim()) return null;
    try {
      return detectTechnicalArtifact(rawInput);
    } catch {
      return null;
    }
  }, [rawInput]);

  const analyzedArtifact = useMemo(() => {
    if (!rawInput.trim()) return null;
    try {
      return analyzeTechnicalArtifact({
        input: rawInput,
        sessionId,
        artifactType: typeOverride || undefined,
        detectedLanguage: languageOverride || undefined,
        title: title.trim() || undefined,
        includeInExport,
        id: identity.id,
        now: identity.createdAt,
      });
    } catch {
      return null;
    }
  }, [identity, includeInExport, languageOverride, rawInput, sessionId, title, typeOverride]);

  const currentArtifact = useMemo<TechnicalArtifact | null>(() => {
    if (!analyzedArtifact) return null;
    return {
      ...analyzedArtifact,
      relatedDocumentation: relatedDocumentation ?? analyzedArtifact.relatedDocumentation,
      takeaway: takeaway.slice(0, 4_000),
      customerContext: customerContext.slice(0, 4_000),
      includeInExport,
      includeInHandoff,
      updatedAt: new Date().toISOString(),
    };
  }, [
    analyzedArtifact,
    customerContext,
    includeInExport,
    includeInHandoff,
    relatedDocumentation,
    takeaway,
  ]);

  const artifactDocsQuery = useMemo(() => {
    if (!currentArtifact) return "";
    try {
      return buildTechnicalArtifactDocsQuery(currentArtifact);
    } catch {
      return "";
    }
  }, [currentArtifact]);

  const docsSearchInput = useMemo<DocsSearchInput | null>(() => {
    if (!currentArtifact || !artifactDocsQuery) return null;
    try {
      return {
        ...buildTechnicalArtifactDocsSearchInput(currentArtifact, {
          lanes,
          stack: safeDocsStack(stack),
          constraints: constraints
            .map((constraint) => cleanDocsContext(constraint, 300))
            .filter(Boolean)
            .slice(0, 8),
        }),
        confirmedProblem: artifactDocsQuery,
      };
    } catch {
      return null;
    }
  }, [artifactDocsQuery, constraints, currentArtifact, lanes, stack]);

  const docsQuery = useMemo(
    () => (docsSearchInput ? buildTechnicalDocsQuery(docsSearchInput) : ""),
    [docsSearchInput],
  );

  const parsedPreview = useMemo(() => {
    if (!currentArtifact) return "";
    return JSON.stringify(
      {
        observed: currentArtifact.observed,
        inferred: currentArtifact.inferred,
        normalized: currentArtifact.normalizedRepresentation,
        endpoint: currentArtifact.extractedEndpoint,
        method: currentArtifact.extractedMethod,
        model: currentArtifact.extractedModel,
        features: currentArtifact.extractedFeatures,
        statusCode: currentArtifact.extractedStatusCode,
        errorCode: currentArtifact.extractedErrorCode,
      },
      null,
      2,
    );
  }, [currentArtifact]);

  function updateEphemeralInput(value: string, nextCategory = category) {
    setRawInput(value);
    setRelatedDocumentation(null);
    setDocsMode("idle");
    setDocsMessage("");
    setAnalysisError("");
    onEphemeralDraftChange?.(
      value
        ? {
            input: value,
            category: nextCategory,
            artifactType: typeOverride || undefined,
            detectedLanguage: languageOverride || undefined,
          }
        : null,
    );
  }

  function changeTypeOverride(value: TechnicalArtifactType | "") {
    setTypeOverride(value);
    setRelatedDocumentation(null);
    setDocsMode("idle");
    setDocsMessage("");
    onEphemeralDraftChange?.(
      rawInput
        ? {
            input: rawInput,
            category,
            artifactType: value || undefined,
            detectedLanguage: languageOverride || undefined,
          }
        : null,
    );
  }

  function changeLanguageOverride(value: DetectedTechnicalLanguage | "") {
    setLanguageOverride(value);
    setRelatedDocumentation(null);
    setDocsMode("idle");
    setDocsMessage("");
    onEphemeralDraftChange?.(
      rawInput
        ? {
            input: rawInput,
            category,
            artifactType: typeOverride || undefined,
            detectedLanguage: value || undefined,
          }
        : null,
    );
  }

  function chooseCategory(next: WorkbenchCategory) {
    setCategory(next);
    onEphemeralDraftChange?.(
      rawInput
        ? {
            input: rawInput,
            category: next,
            artifactType: typeOverride || undefined,
            detectedLanguage: languageOverride || undefined,
          }
        : null,
    );
  }

  function clearDraft() {
    setRawInput("");
    setTypeOverride("");
    setLanguageOverride("");
    setTitle("");
    setTakeaway("");
    setCustomerContext("");
    setIncludeInExport(true);
    setIncludeInHandoff(true);
    setRelatedDocumentation(null);
    setDocsMode("idle");
    setDocsMessage("");
    setEditingArtifactId(null);
    setIdentity(newDraftIdentity());
    setAnalysisError("");
    onEphemeralDraftChange?.(null);
  }

  async function copyRedacted() {
    if (!currentArtifact) return;
    try {
      await navigator.clipboard.writeText(currentArtifact.redactedInput);
      onNotice("Redacted technical evidence copied. Review it before sharing.");
    } catch {
      onNotice("Clipboard access is unavailable. Select the redacted view and copy manually.");
    }
  }

  function attachArtifact() {
    if (!currentArtifact) {
      setAnalysisError("Paste a technical artifact before attaching it.");
      return;
    }
    try {
      const safeArtifact = toSessionSafeTechnicalArtifact(currentArtifact);
      const next = editingArtifactId
        ? artifacts.map((artifact) =>
            artifact.id === editingArtifactId ? safeArtifact : artifact,
          )
        : [...artifacts, safeArtifact];
      onArtifactsChange(next);
      onNotice(
        editingArtifactId
          ? "Technical evidence updated with its redacted representation."
          : "Technical evidence attached to this session in redacted form.",
      );
      clearDraft();
    } catch {
      setAnalysisError("The redacted artifact could not be validated for session storage.");
    }
  }

  function editArtifact(artifact: TechnicalArtifact) {
    setOpen(true);
    setEditingArtifactId(artifact.id);
    setIdentity({ id: artifact.id, createdAt: artifact.createdAt });
    setRawInput(artifact.redactedInput);
    setTypeOverride(artifact.artifactType);
    setLanguageOverride(artifact.detectedLanguage);
    setTitle(artifact.title);
    setTakeaway(artifact.takeaway);
    setCustomerContext(artifact.customerContext);
    setIncludeInExport(artifact.includeInExport);
    setIncludeInHandoff(artifact.includeInHandoff);
    setRelatedDocumentation(artifact.relatedDocumentation);
    setDocsMode(
      artifact.relatedDocumentation.some((item) => item.verificationState === "live-retrieved")
        ? "live-docs"
        : artifact.relatedDocumentation.length
          ? "curated-fallback"
          : "idle",
    );
    setDocsMessage(
      "Editing the persisted redacted copy. The unredacted original was not retained.",
    );
    setActiveView("redacted");
    setAnalysisError("");
    onEphemeralDraftChange?.({
      input: artifact.redactedInput,
      category,
      artifactType: artifact.artifactType,
      detectedLanguage: artifact.detectedLanguage,
    });
  }

  function removeArtifact(id: string) {
    onArtifactsChange(artifacts.filter((artifact) => artifact.id !== id));
    if (editingArtifactId === id) clearDraft();
    onNotice("Technical evidence removed from this session.");
  }

  async function searchOfficialDocs() {
    if (!currentArtifact || !docsQuery || !docsSearchInput) {
      setDocsMessage("Analyze an artifact before searching official documentation.");
      return;
    }
    setSearchingDocs(true);
    setDocsMessage("");
    try {
      const response = await fetch("/api/deepgram-docs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docsSearchInput),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const apiMessage =
          body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string"
            ? String((body as Record<string, unknown>).error)
            : "Official documentation search is unavailable.";
        throw new Error(apiMessage);
      }
      if (!isDocsEvidenceResult(body)) {
        throw new Error("The documentation response could not be validated.");
      }
      const normalized = normalizeRelatedDocumentation(body);
      setRelatedDocumentation(normalized);
      setDocsMode(body.mode);
      setDocsMessage(
        normalized.length
          ? body.message
          : "Official documentation returned no compatible developer-documentation references.",
      );
      onNotice(
        body.mode === "live-docs"
          ? "Official Deepgram evidence retrieved live. Review it before relying on a claim."
          : body.mode === "curated-fallback"
            ? "Live docs were unavailable; curated official references are labeled as fallback."
            : "Official documentation is unavailable. Local deterministic analysis remains available.",
      );
    } catch (error) {
      setDocsMode("unavailable");
      setDocsMessage(
        error instanceof Error ? error.message : "Official documentation search is unavailable.",
      );
      onNotice("Official docs search failed. The redacted local analysis is still available.");
    } finally {
      setSearchingDocs(false);
    }
  }

  function sendToApiLab() {
    if (!currentArtifact) return;
    try {
      const handoff = buildApiLabWorkbenchHandoff(currentArtifact);
      onSendToApiLab(handoff);
      onNotice(
        "Redacted supported fields were prepared for API Lab. Nothing was executed.",
      );
    } catch {
      onNotice(
        "This artifact does not contain enough supported request detail for an API Lab handoff.",
      );
    }
  }

  return (
    <section
      aria-labelledby={`${regionId}-title`}
      className="min-w-0 max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#071016]/80 shadow-[0_20px_60px_rgba(0,0,0,.18)]"
      data-testid="payload-code-workbench"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${regionId}-title`} className="text-sm font-semibold text-white">
              Payload &amp; Code Workbench
            </h2>
            <span className="rounded-full border border-cyan-200/20 bg-cyan-200/[.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.12em] text-cyan-100">
              Technical Evidence
            </span>
            {artifacts.length || diagnoses.length ? (
              <span className="text-[10px] text-slate-500">
                {artifacts.length} attached{diagnoses.length ? ` Â· ${diagnoses.length} SDK diagnosis${diagnoses.length === 1 ? "" : "es"}` : ""}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-slate-500">
            Inspect, redact, and attach pasted technical material. This workspace never
            executes code or sends an API request.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={doctorOpen ? primary : button}

            onClick={() => { setOpen(false); setDoctorOpen(true); }}
          >
            SDK Doctor ðŸ§ª
          </button>
          <button
            type="button"
            className={open ? primary : button}
            aria-expanded={open}
            aria-controls={categoryPanelId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close workbench" : "Open workbench"}
          </button>
        </div>
      </div>

      {open ? (
        <div id={categoryPanelId} className="border-t border-white/10 p-3 sm:p-4">
          <div
            role="tablist"
            aria-label="Technical artifact category"
            className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-white/[.07] bg-black/20 p-1"
          >
            {WORKBENCH_CATEGORIES.map((item) => (
              <button
                key={item.id}
                id={`${regionId}-category-${item.id}`}
                type="button"
                role="tab"
                aria-selected={category === item.id}
                aria-controls={`${regionId}-editor`}
                tabIndex={category === item.id ? 0 : -1}
                data-workbench-tab={item.id}
                onKeyDown={(event) =>
                  moveTab(event, WORKBENCH_CATEGORIES, category, chooseCategory)
                }
                onClick={() => chooseCategory(item.id)}
                className={`min-h-10 shrink-0 rounded-md px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-cyan-200 ${
                  category === item.id
                    ? "bg-cyan-200 text-slate-950"
                    : "text-slate-400 hover:bg-white/[.04] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            id={`${regionId}-editor`}
            role="tabpanel"
            aria-labelledby={`${regionId}-category-${category}`}
            className="mt-3"
          >
            <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
              Ephemeral paste surface
              <textarea
                aria-label="Technical artifact input"
                value={rawInput}
                onChange={(event) => updateEphemeralInput(event.target.value)}
                maxLength={MAX_TECHNICAL_ARTIFACT_INPUT}
                rows={10}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Paste JSON, cURL, JavaScript, Python, an HTTP request, API response, or error message."
                className="mt-2 min-h-56 w-full resize-y rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-slate-200 placeholder:font-sans placeholder:text-slate-600 focus:border-cyan-200/30 focus:outline-none focus:ring-2 focus:ring-cyan-200/20"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2" aria-live="polite">
              <p className="text-[10px] leading-4 text-slate-500">
                The original remains only in ephemeral client memory. Session storage and exports use the redacted copy. Redaction is conservative, not infallible.
              </p>
              {detection ? (
                <p className="rounded-full border border-white/10 bg-white/[.03] px-2.5 py-1 text-[10px] text-slate-300">
                  Detected: <strong className="text-cyan-100">{humanize(detection.artifactType)}</strong>
                  {" Â· "}Confidence: <strong>{humanize(detection.confidence)}</strong>
                </p>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-[10px] font-semibold text-slate-400">
                Artifact type override
                <select
                  aria-label="Artifact type override"
                  value={typeOverride}
                  onChange={(event) =>
                    changeTypeOverride(event.target.value as TechnicalArtifactType | "")
                  }
                  className={`mt-1 ${input}`}
                >
                  <option value="">Use detection</option>
                  {TECHNICAL_ARTIFACT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {humanize(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] font-semibold text-slate-400">
                Language override
                <select
                  aria-label="Detected language override"
                  value={languageOverride}
                  onChange={(event) =>
                    changeLanguageOverride(event.target.value as DetectedTechnicalLanguage | "")
                  }
                  className={`mt-1 ${input}`}
                >
                  <option value="">Use detection</option>
                  {DETECTED_TECHNICAL_LANGUAGES.map((value) => (
                    <option key={value} value={value}>
                      {humanize(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] font-semibold text-slate-400 sm:col-span-2">
                Artifact title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, 300))}
                  maxLength={300}
                  placeholder={currentArtifact?.title ?? "Generated from the detected artifact"}
                  className={`mt-1 ${input}`}
                />
              </label>
            </div>

            {currentArtifact ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryStat label="Validation" value={humanize(currentArtifact.validationStatus)} />
                  <SummaryStat label="Secrets detected" value={String(currentArtifact.secretFindings.reduce((total, finding) => total + finding.count, 0))} tone={currentArtifact.secretFindings.length ? "amber" : "slate"} />
                  <SummaryStat label="Endpoint" value={currentArtifact.extractedEndpoint ?? "Not observed"} />
                  <SummaryStat label="Model" value={currentArtifact.extractedModel ?? "Not observed"} />
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <label className="text-[10px] font-semibold text-slate-400">
                    Takeaway
                    <textarea
                      value={takeaway}
                      onChange={(event) => setTakeaway(event.target.value.slice(0, 4_000))}
                      maxLength={4_000}
                      rows={2}
                      placeholder="What should the solution brief retain from this evidence?"
                      className={`mt-1 resize-y ${input}`}
                    />
                  </label>
                  <label className="text-[10px] font-semibold text-slate-400">
                    Customer context â€” confirmed only
                    <textarea
                      value={customerContext}
                      onChange={(event) => setCustomerContext(event.target.value.slice(0, 4_000))}
                      maxLength={4_000}
                      rows={2}
                      placeholder="Optional confirmed context; do not turn an inference into a customer statement."
                      className={`mt-1 resize-y ${input}`}
                    />
                  </label>
                </div>

                <div
                  role="tablist"
                  aria-label="Technical artifact analysis views"
                  className="mt-4 flex max-w-full gap-1 overflow-x-auto border-b border-white/10"
                >
                  {ANALYSIS_VIEWS.map((item) => (
                    <button
                      key={item.id}
                      id={`${regionId}-view-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={activeView === item.id}
                      aria-controls={`${regionId}-analysis-panel`}
                      tabIndex={activeView === item.id ? 0 : -1}
                      data-workbench-tab={item.id}
                      onKeyDown={(event) =>
                        moveTab(event, ANALYSIS_VIEWS, activeView, setActiveView)
                      }
                      onClick={() => setActiveView(item.id)}
                      className={`min-h-10 shrink-0 border-b-2 px-3 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-cyan-200 ${
                        activeView === item.id
                          ? "border-cyan-200 text-cyan-100"
                          : "border-transparent text-slate-500 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div
                  id={`${regionId}-analysis-panel`}
                  role="tabpanel"
                  aria-labelledby={`${regionId}-view-${activeView}`}
                  className="mt-3 min-w-0 rounded-lg border border-white/[.08] bg-black/20 p-3"
                >
                  {activeView === "original" ? (
                    <CodeBlock
                      value={rawInput}
                      label="Ephemeral original â€” never attached or exported"
                      tone="amber"
                    />
                  ) : null}
                  {activeView === "redacted" ? (
                    <CodeBlock value={currentArtifact.redactedInput} label="Persisted and exported representation" />
                  ) : null}
                  {activeView === "formatted" ? (
                    <CodeBlock value={currentArtifact.formattedInput || currentArtifact.redactedInput} label="Redacted formatted representation" />
                  ) : null}
                  {activeView === "parsed" ? (
                    <div className="space-y-3">
                      <EvidenceGroups artifact={currentArtifact} />
                      <CodeBlock value={parsedPreview} label="Redacted normalized representation" />
                    </div>
                  ) : null}
                  {activeView === "suggested-fix" ? (
                    <SuggestedFixes artifact={currentArtifact} />
                  ) : null}
                  {activeView === "documentation" ? (
                    <DocumentationView
                      query={docsQuery}
                      mode={docsMode}
                      message={docsMessage}
                      searching={searchingDocs}
                      documentation={currentArtifact.relatedDocumentation}
                      contextAvailable={Boolean(confirmedProblem.trim())}
                      onSearch={() => void searchOfficialDocs()}
                      onRemove={(id) =>
                        setRelatedDocumentation((current) =>
                          (current ?? currentArtifact.relatedDocumentation).filter(
                            (item) => item.id !== id,
                          ),
                        )
                      }
                    />
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex min-h-10 items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeInExport}
                      onChange={(event) => setIncludeInExport(event.target.checked)}
                      className="accent-cyan-200"
                    />
                    Include redacted artifact in export
                  </label>
                  <label className="inline-flex min-h-10 items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeInHandoff}
                      onChange={(event) => setIncludeInHandoff(event.target.checked)}
                      className="accent-cyan-200"
                    />
                    Include in solution handoff
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={primary} onClick={attachArtifact}>
                    {editingArtifactId ? "Update attached artifact" : "Attach to session"}
                  </button>
                  <button type="button" className={button} onClick={() => void copyRedacted()}>
                    Copy redacted
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={!includeInHandoff}
                    onClick={sendToApiLab}
                  >
                    Send redacted request to API Lab
                  </button>
                  <button type="button" className={button} onClick={clearDraft}>
                    Discard ephemeral draft
                  </button>
                </div>
              </>
            ) : rawInput.trim() ? (
              <p className="mt-3 rounded-md border border-amber-200/20 bg-amber-200/[.05] p-3 text-xs text-amber-100" role="status">
                Deterministic analysis could not validate this paste. The original remains unchanged and has not been attached or sent anywhere.
              </p>
            ) : null}

            {analysisError ? (
              <p className="mt-3 text-xs text-rose-200" role="alert">
                {analysisError}
              </p>
            ) : null}
          </div>

          {artifacts.length ? (
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-[.14em] text-slate-300">
                  Attached technical evidence
                </h3>
                <span className="text-[10px] text-slate-600">Redacted only</span>
              </div>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {artifacts.map((artifact) => (
                  <article
                    key={artifact.id}
                    className="min-w-0 rounded-lg border border-white/[.08] bg-black/15 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{artifact.title}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {humanize(artifact.artifactType)} Â· {humanize(artifact.validationStatus)} Â· {artifact.secretFindings.length ? `${artifact.secretFindings.length} secret pattern${artifact.secretFindings.length === 1 ? "" : "s"} redacted` : "no detected secrets"}
                        </p>
                        <p className="mt-1 truncate font-mono text-[10px] text-cyan-100/80">
                          {[artifact.extractedMethod, artifact.extractedEndpoint, artifact.extractedModel]
                            .filter(Boolean)
                            .join(" Â· ") || "No endpoint or model observed"}
                        </p>
                        <p className="mt-1 text-[9px] text-slate-600">
                          {artifact.relatedDocumentation.length} official reference{artifact.relatedDocumentation.length === 1 ? "" : "s"} Â· {new Date(artifact.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" className={button} onClick={() => editArtifact(artifact)}>
                          Open / edit
                        </button>
                        <button type="button" className={button} onClick={() => { setDoctorArtifactId(artifact.id); setOpen(false); setDoctorOpen(true); }}>
                          Diagnose
                        </button>
                        <button type="button" className={button} onClick={() => removeArtifact(artifact.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <SdkDoctorPanel
        open={doctorOpen}
        requestedArtifactId={doctorArtifactId}
        sessionId={sessionId}
        artifacts={artifacts}
        diagnoses={diagnoses}
        lanes={lanes}
        stack={stack}
        constraints={constraints}
        onOpenChange={setDoctorOpen}
        onRequestedArtifactHandled={() => setDoctorArtifactId(null)}
        onDiagnosesChange={onDiagnosesChange}
        onNotice={onNotice}
        onSendToApiLab={onSendToApiLab}
      />
    </section>
  );
}

function SummaryStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber";
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/[.08] bg-black/20 p-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-600">{label}</p>
      <p className={`mt-1 truncate text-xs font-semibold ${tone === "amber" ? "text-amber-100" : "text-slate-200"}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function CodeBlock({
  value,
  label,
  tone = "slate",
}: {
  value: string;
  label: string;
  tone?: "slate" | "amber";
}) {
  return (
    <div className="min-w-0">
      <p className={`mb-2 text-[10px] font-semibold ${tone === "amber" ? "text-amber-200" : "text-slate-500"}`}>
        {label}
      </p>
      <pre tabIndex={0} className="max-h-96 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/[.07] bg-[#02070a] p-3 font-mono text-[11px] leading-5 text-slate-300 focus-visible:outline-2 focus-visible:outline-cyan-200">
        <code>{value || "No representation is available."}</code>
      </pre>
    </div>
  );
}

function EvidenceGroups({ artifact }: { artifact: TechnicalArtifact }) {
  const groups = [
    { title: "Observed in artifact", values: artifact.observed, tone: "text-emerald-100" },
    { title: "Inferred", values: artifact.inferred, tone: "text-amber-100" },
    { title: "Recommended", values: artifact.recommended, tone: "text-cyan-100" },
  ];
  return (
    <div className="grid gap-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title} className="rounded-md border border-white/[.07] bg-white/[.02] p-3">
          <h4 className={`text-[10px] font-bold uppercase tracking-[.12em] ${group.tone}`}>{group.title}</h4>
          {group.values.length ? (
            <ul className="mt-2 space-y-1 text-[10px] leading-4 text-slate-400">
              {group.values.map((value, index) => <li key={`${group.title}-${index}`}>â€¢ {value}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-[10px] text-slate-600">Nothing recorded.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function SuggestedFixes({ artifact }: { artifact: TechnicalArtifact }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Validation findings</h4>
        {artifact.validationErrors.length ? (
          <ul className="mt-2 space-y-2">
            {artifact.validationErrors.map((issue) => (
              <li key={issue.id} className="rounded-md border border-white/[.07] p-2.5 text-[10px] leading-4 text-slate-300">
                <strong className={issue.severity === "error" ? "text-rose-200" : issue.severity === "warning" ? "text-amber-200" : "text-cyan-100"}>{humanize(issue.classification)}</strong>
                {" â€” "}{issue.message}
                {issue.line ? <span className="text-slate-600"> (line {issue.line}{issue.column ? `, column ${issue.column}` : ""})</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-[10px] text-slate-600">No deterministic issues were recorded.</p>}
      </div>
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Suggested â€” never applied automatically</h4>
        {artifact.suggestedFixes.length ? artifact.suggestedFixes.map((fix) => (
          <details key={fix.id} className="mt-2 rounded-md border border-white/[.07] bg-black/15 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-200">{fix.label}</summary>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">{fix.explanation}</p>
            {fix.replacement ? <div className="mt-2"><CodeBlock value={fix.replacement} label={`${fix.source === "ai-assisted" ? "AI-assisted" : "Deterministic"} proposed replacement`} /></div> : null}
          </details>
        )) : <p className="mt-2 text-[10px] text-slate-600">No corrected version can be generated safely from the available structure.</p>}
      </div>
      {artifact.generatedVariants.length ? (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Redacted alternatives</h4>
          {artifact.generatedVariants.map((variant) => (
            <details key={variant.id} className="mt-2 rounded-md border border-white/[.07] bg-black/15 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-200">{variant.label}</summary>
              <div className="mt-2"><CodeBlock value={variant.code} label={`Generated ${variant.language} â€” not executed`} /></div>
              {variant.environmentVariables.length ? <p className="mt-2 text-[10px] text-slate-500">Required environment placeholders: {variant.environmentVariables.join(", ")}</p> : null}
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DocumentationView({
  query,
  mode,
  message,
  searching,
  documentation,
  contextAvailable,
  onSearch,
  onRemove,
}: {
  query: string;
  mode: DocsEvidenceMode | "idle";
  message: string;
  searching: boolean;
  documentation: RelatedTechnicalDocumentation[];
  contextAvailable: boolean;
  onSearch: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-white">Official Deepgram documentation</h4>
          <p className="mt-1 max-w-2xl text-[10px] leading-4 text-slate-500">Only the derived, redacted technical query and confirmed technical context below leave the browser after this explicit action. The pasted artifact is never submitted verbatim.</p>
        </div>
        <button type="button" className={primary} disabled={searching || !query} onClick={onSearch}>
          {searching ? "Searching official docsâ€¦" : "Search official docs"}
        </button>
      </div>
      <label className="mt-3 block text-[10px] font-semibold text-slate-400">
        Outgoing technical query preview
        <textarea aria-label="Outgoing technical artifact docs query" value={query} readOnly rows={5} className={`mt-1 resize-y ${input}`} />
      </label>
      <p className="mt-2 text-[9px] text-slate-600">{contextAvailable ? "Confirmed problem context is available locally; the original problem text is not placed in this artifact query." : "No confirmed problem context is available; documentation matching uses only observed artifact details."}</p>
      {mode !== "idle" || message ? (
        <p className="mt-3 text-[10px] text-slate-400" role="status">
          <strong className={mode === "live-docs" ? "text-emerald-200" : mode === "curated-fallback" ? "text-amber-200" : "text-rose-200"}>{mode === "idle" ? "Not searched" : mode}</strong>{message ? ` Â· ${message}` : ""}
        </p>
      ) : null}
      {documentation.length ? (
        <div className="mt-3 space-y-2">
          {documentation.map((item) => (
            <article key={item.id} className="rounded-md border border-white/[.08] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a href={item.canonicalUrl} target="_blank" rel="noreferrer" className="break-words text-xs font-semibold text-cyan-100 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-200">{item.title} â†—</a>
                  <p className="mt-1 text-[10px] leading-4 text-slate-300"><strong>Supported claim:</strong> {item.supportedClaim}</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.whyRelevant}</p>
                  <p className="mt-1 text-[9px] text-slate-600">{humanize(item.verificationState)}{item.retrievedAt ? ` Â· ${new Date(item.retrievedAt).toLocaleString()}` : ""}</p>
                </div>
                <button type="button" className={button} onClick={() => onRemove(item.id)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      ) : mode !== "idle" && !searching ? <p className="mt-3 text-[10px] text-slate-600">No official source is attached. The artifact analysis remains available without a fabricated citation.</p> : null}
    </div>
  );
}

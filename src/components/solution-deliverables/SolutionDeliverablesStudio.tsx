"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  LIVE_SOLUTION_STORAGE_KEY,
  parseSession,
} from "@/lib/live-solution-studio";
import {
  assessDeliverableReadiness,
  auditDeliverableManualEdits,
  buildBriefMarkdown,
  buildPresentationStoryboard,
  buildSourceManifest,
  describeMermaid,
  generateMermaid,
  mermaidToSafeSvg,
  validateMermaid,
} from "@/lib/solution-deliverables";
import { ModulePageShell } from "@/components/one";
import {
  northstarDeliverableCase,
  SYNTHETIC_DELIVERABLE_SCENARIOS,
} from "@/lib/solution-deliverable-scenarios";
import type { SolutionCaseBundle } from "@/types/live-solution-case";
import type {
  DeliverableManualEdits,
  DeliverableProfile,
} from "@/types/solution-deliverables";
const btn =
    "rounded-md border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-200/30 focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-40",
  primary = `${btn} border-cyan-200/30 bg-cyan-200/[.12]`;
type Generated = {
  schemaVersion: string;
  generatedAt: string;
  readiness: ReturnType<typeof assessDeliverableReadiness>;
  brief: {
    pageCount: number;
    fit: boolean;
    wordCount: number;
    warnings: string[];
  };
  presentation: { slideCount: number; titles: string[] };
  mermaid: { valid: boolean; errors: string[] };
  editAudit: {
    userEdited: boolean;
    status: "passed" | "qualified" | "blocked";
    unsupportedFields: string[];
    message: string;
  };
  artifacts: {
    type: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    base64: string;
    valid: boolean;
  }[];
};
type ExportHistoryEntry = {
  generatedAt: string;
  profile: DeliverableProfile;
  readiness: string;
  artifactCount: number;
  caseRevision: number;
};
const EXPORT_HISTORY_KEY = "deepgram-deliverables:history:v1";
export function SolutionDeliverablesStudio() {
  const [bundle, setBundle] = useState<SolutionCaseBundle | null>(null),
    [profile, setProfile] = useState<DeliverableProfile>(
      "customer-solution-pack",
    ),
    [customer, setCustomer] = useState("Synthetic Customer"),
    [pageSize, setPageSize] = useState("Letter"),
    [presentationType, setPresentationType] = useState("product"),
    [includeCase, setIncludeCase] = useState(false),
    [scenarioId, setScenarioId] = useState("active"),
    [tab, setTab] = useState("readiness"),
    [generated, setGenerated] = useState<Generated | null>(null),
    [generatedFingerprint, setGeneratedFingerprint] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(
      "Deterministic compiler ready. Nothing is uploaded or shared automatically.",
    ),
    [editedMermaid, setEditedMermaid] = useState(""),
    [manualEdits, setManualEdits] = useState<DeliverableManualEdits>({}),
    [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  useEffect(() => {
    const session = parseSession(
      localStorage.getItem(LIVE_SOLUTION_STORAGE_KEY),
    );
    queueMicrotask(() => {
      const active = session?.problems.find(
        (p) => p.id === session.activeProblemId,
      );
      const initialBundle = active?.solutionCase ?? northstarDeliverableCase();
      setBundle(initialBundle);
      setScenarioId(active?.solutionCase ? "active" : "northstar");
      setCustomer(
        active?.solutionCase.case.optionalCustomerDisplayName ??
          active?.solutionCase.case.displayName ??
          "Northstar Appointments",
      );
      try {
        const history = JSON.parse(
          localStorage.getItem(EXPORT_HISTORY_KEY) ?? "[]",
        ) as unknown;
        if (Array.isArray(history))
          setExportHistory(
            history
              .filter(
                (entry): entry is ExportHistoryEntry =>
                  Boolean(
                    entry &&
                      typeof entry === "object" &&
                      typeof (entry as ExportHistoryEntry).generatedAt ===
                        "string",
                  ),
              )
              .slice(0, 20),
          );
      } catch {
        setExportHistory([]);
      }
    });
  }, []);
  const readiness = useMemo(
    () => (bundle ? assessDeliverableReadiness(bundle, profile) : null),
    [bundle, profile],
  );
  const mermaid = useMemo(
    () => (bundle ? generateMermaid(bundle, profile) : null),
    [bundle, profile],
  );
  const brief = useMemo(
    () =>
      bundle
        ? buildBriefMarkdown(bundle, profile, customer, manualEdits)
        : null,
    [bundle, profile, customer, manualEdits],
  );
  const originalBrief = useMemo(
    () => (bundle ? buildBriefMarkdown(bundle, profile, customer) : null),
    [bundle, profile, customer],
  );
  const storyboard = useMemo(
    () =>
      bundle
        ? buildPresentationStoryboard(
            bundle,
            profile,
            customer,
            presentationType as "product" | "technical" | "poc",
            manualEdits,
          )
        : null,
    [bundle, profile, customer, presentationType, manualEdits],
  );
  const sources = useMemo(
    () => (bundle ? buildSourceManifest(bundle, profile, manualEdits) : []),
    [bundle, profile, manualEdits],
  );
  const editAudit = useMemo(
    () =>
      bundle
        ? auditDeliverableManualEdits(bundle, manualEdits)
        : {
            userEdited: false,
            status: "passed" as const,
            secretFields: [],
            localPathFields: [],
            unsupportedFields: [],
            message: "No manual edits are active.",
          },
    [bundle, manualEdits],
  );
  useEffect(() => {
    if (mermaid) queueMicrotask(() => setEditedMermaid(mermaid.source));
  }, [mermaid]);
  const inputFingerprint = JSON.stringify({
    caseRevision: bundle?.case.revision ?? 0,
    profile,
    customer,
    pageSize,
    presentationType,
    includeCase,
    editedMermaid,
    manualEdits,
  });
  async function generate() {
    if (!bundle) return;
    const fingerprintAtRequest = inputFingerprint;
    setBusy(true);
    try {
      const response = await fetch("/api/deliverables/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseBundle: bundle,
          profile,
          customerDisplayName: customer,
          pageSize,
          presentationType,
          includeRedactedCase: includeCase,
          manualEdits,
          mermaidSource: editedMermaid,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Generation failed");
      setGenerated(data);
      setGeneratedFingerprint(fingerprintAtRequest);
      const entry: ExportHistoryEntry = {
        generatedAt: data.generatedAt,
        profile,
        readiness: data.readiness.state,
        artifactCount: data.artifacts.length,
        caseRevision: bundle.case.revision,
      };
      const nextHistory = [entry, ...exportHistory].slice(0, 20);
      setExportHistory(nextHistory);
      localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(nextHistory));
      setNotice(
        `Validated ${data.artifacts.length} artifacts locally on the server. No external share occurred.`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Generation failed safely.");
    } finally {
      setBusy(false);
    }
  }
  function artifactAvailable(type: string) {
    return Boolean(
      generatedFingerprint === inputFingerprint &&
        generated?.artifacts.find((artifact) => artifact.type === type)?.valid,
    );
  }
  function setLines(
    field:
      | "slideTitles"
      | "slideTakeaways"
      | "openQuestions"
      | "nextActions",
    value: string,
  ) {
    setManualEdits((current) => ({
      ...current,
      [field]: value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    }));
  }
  function download(type: string) {
    if (generatedFingerprint !== inputFingerprint) return;
    const a = generated?.artifacts.find((x) => x.type === type);
    if (!a?.valid) return;
    const bytes = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: a.mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = a.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function copyGeneratedText(type: string) {
    if (!artifactAvailable(type)) return;
    const artifact = generated?.artifacts.find((item) => item.type === type);
    if (!artifact) return;
    const bytes = Uint8Array.from(atob(artifact.base64), (value) =>
      value.charCodeAt(0),
    );
    await navigator.clipboard.writeText(new TextDecoder().decode(bytes));
    setNotice(`Copied validated ${type} output.`);
  }
  function loadSyntheticScenario(id: string) {
    const fixture = SYNTHETIC_DELIVERABLE_SCENARIOS.find(
      (scenario) => scenario.id === id,
    );
    if (!fixture) return;
    const next = fixture.create();
    setScenarioId(id);
    setBundle(next);
    setCustomer(
      next.case.optionalCustomerDisplayName ?? next.case.displayName,
    );
    setManualEdits({});
    setGenerated(null);
    setGeneratedFingerprint("");
    setNotice(
      `Loaded fictional ${next.case.optionalCustomerDisplayName ?? id} rehearsal case.`,
    );
  }
  const validation = validateMermaid(editedMermaid);
  if (!bundle || !readiness || !mermaid || !brief || !storyboard)
    return (
      <ModulePageShell className="min-h-screen bg-[#03080d] p-8 text-white" evolutionModuleId="deliverables">
        Loading local caseâ€¦
      </ModulePageShell>
    );
  return (
    <ModulePageShell
      className="min-h-screen bg-[#03080d] text-slate-200"

      evolutionModuleId="deliverables"
    >
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#03080d]/95 p-4">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">
              Live Solution Lab
            </p>
            <h1 className="text-xl font-semibold text-white">
              Solution Deliverables Studio
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Compile the accepted case graph into source-grounded customer
              takeaway materials.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/live-solution-studio" className={btn}>
              Back to case
            </Link>
            <button
              className={primary}
              disabled={
                busy || editAudit.status === "blocked" || !validation.valid
              }

              onClick={() => void generate()}
            >
              {busy ? "Validating artifactsâ€¦" : "Generate validated draft"}
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] p-3 lg:p-5">
        <section className="rounded-xl border border-white/10 bg-[#071016] p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            <label className="text-[10px]">
              Case source
              <select
                aria-label="Synthetic scenario"
                className="mt-1 w-full rounded bg-black/20 p-2"
                value={scenarioId}
                onChange={(event) => loadSyntheticScenario(event.target.value)}
              >
                {scenarioId === "active" ? (
                  <option value="active">Active local case</option>
                ) : null}
                {SYNTHETIC_DELIVERABLE_SCENARIOS.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    Fictional: {scenario.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px]">
              Profile
              <select
                className="mt-1 w-full rounded bg-black/20 p-2"
                value={profile}
                onChange={(e) => {
                  setProfile(e.target.value as DeliverableProfile);
                  setGenerated(null);
                }}
              >
                {[
                  "customer-solution-pack",
                  "internal-solution-review",
                  "poc-kickoff-pack",
                  "executive-takeaway",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] lg:col-span-2">
              Safe customer display name
              <input
                className="mt-1 w-full rounded bg-black/20 p-2"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                maxLength={80}
              />
            </label>
            <label className="text-[10px]">
              Page
              <select
                className="mt-1 w-full rounded bg-black/20 p-2"
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
              >
                <option>Letter</option>
                <option>A4</option>
              </select>
            </label>
            <label className="text-[10px]">
              Deck
              <select
                className="mt-1 w-full rounded bg-black/20 p-2"
                value={presentationType}
                onChange={(e) => setPresentationType(e.target.value)}
              >
                <option value="product">Product / executive</option>
                <option value="technical">Technical</option>
                <option value="poc">POC kickoff</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-[10px]">
              <input
                type="checkbox"
                checked={includeCase}
                onChange={(e) => setIncludeCase(e.target.checked)}
              />{" "}
              Include redacted case
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            <span className="rounded border border-emerald-300/15 px-2 py-1 text-emerald-200">
              Deterministic-only generation
            </span>
            <span>
              Optional case export is an allowlisted redacted projection; raw
              transcripts, code, private notes, and credentials remain
              excluded.
            </span>
          </div>
          <p className="mt-2 text-[10px] text-emerald-200" aria-live="polite">
            {notice}
          </p>
          <button
            type="button"
            className={`${btn} mt-2`}

            onClick={() =>
              setNotice(
                `Claim audit ${editAudit.status}. Readiness ${readiness?.state ?? "unknown"}; ${readiness?.claimAudit.excluded.length ?? 0} items excluded.`,
              )
            }
          >
            Run claim audit
          </button>
          <details className="mt-3 rounded-lg border border-white/10 bg-black/15 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-white">
              Bounded manual edits
            </summary>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">
              Edits preserve the source-generated version, trigger claim and
              secret checks, and remain qualified when no direct case evidence
              supports the new wording.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <EditField
                label="Artifact title"
                value={manualEdits.title ?? ""}
                maxLength={160}
                onChange={(value) =>
                  setManualEdits((current) => ({
                    ...current,
                    title: value,
                  }))
                }
              />
              <EditField
                label="Executive summary"
                value={manualEdits.executiveSummary ?? ""}
                maxLength={1200}
                multiline
                onChange={(value) =>
                  setManualEdits((current) => ({
                    ...current,
                    executiveSummary: value,
                  }))
                }
              />
              <EditField
                label="Recommended-solution wording"
                value={manualEdits.sectionWording ?? ""}
                maxLength={1800}
                multiline
                onChange={(value) =>
                  setManualEdits((current) => ({
                    ...current,
                    sectionWording: value,
                  }))
                }
              />
              <EditField
                label="Slide titles â€” one per line"
                value={(manualEdits.slideTitles ?? []).join("\n")}
                maxLength={800}
                multiline
                onChange={(value) => setLines("slideTitles", value)}
              />
              <EditField
                label="Slide takeaways â€” one per line"
                value={(manualEdits.slideTakeaways ?? []).join("\n")}
                maxLength={2400}
                multiline
                onChange={(value) => setLines("slideTakeaways", value)}
              />
              <EditField
                label="Open questions â€” one per line"
                value={(manualEdits.openQuestions ?? []).join("\n")}
                maxLength={3000}
                multiline
                onChange={(value) => setLines("openQuestions", value)}
              />
              <EditField
                label="Next actions â€” one per line"
                value={(manualEdits.nextActions ?? []).join("\n")}
                maxLength={3000}
                multiline
                onChange={(value) => setLines("nextActions", value)}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btn}
                onClick={() => setManualEdits({})}
              >
                Reset all wording
              </button>
              <span
                className={
                  editAudit.status === "blocked"
                    ? "text-xs text-rose-200"
                    : editAudit.status === "qualified"
                      ? "text-xs text-amber-200"
                      : "text-xs text-emerald-200"
                }
                aria-live="polite"
              >
                Edit audit: {editAudit.status}. {editAudit.message}
              </span>
            </div>
            {editAudit.unsupportedFields.length ? (
              <p className="mt-2 text-[10px] text-amber-200">
                Needs evidence review:{" "}
                {editAudit.unsupportedFields.join(", ")}.
              </p>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] text-slate-400">
                View preserved source-generated brief
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/25 p-3 text-[10px] text-slate-400">
                {originalBrief?.markdown}
              </pre>
            </details>
          </details>
        </section>
        <nav
          className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:overflow-x-auto"
          aria-label="Deliverables Studio views"
        >
          {[
            "readiness",
            "architecture",
            "brief",
            "presentation",
            "pack",
            "sources",
            "history",
          ].map((x) => (
            <button
              key={x}
              className={tab === x ? primary : btn}

              onClick={() => setTab(x)}
            >
              {x[0].toUpperCase() + x.slice(1)}
            </button>
          ))}
        </nav>
        {tab === "readiness" ? (
          <Panel title="Deliverable readiness">
            <p className="text-lg font-semibold text-white">
              Current state:{" "}
              <span className="text-cyan-200">{readiness.state}</span>
            </p>
            <Grid title="Ready" values={readiness.ready} />
            <Grid title="Needs attention" values={readiness.needsAttention} />
            <Grid title="Blocked" values={readiness.blocked} />
            <p className="mt-3 text-xs text-slate-500">
              Generation success never changes readiness. Blocking cases may
              produce internal drafts but cannot download a misleading
              customer-ready pack.
            </p>
          </Panel>
        ) : null}
        {tab === "architecture" ? (
          <Panel title="Solution Architecture">
            <textarea
              aria-label="Mermaid source"
              className="min-h-64 w-full rounded bg-black/20 p-3 font-mono text-xs"
              value={editedMermaid}
              onChange={(e) => setEditedMermaid(e.target.value)}
            />
            <p
              className={`mt-2 text-xs ${validation.valid ? "text-emerald-200" : "text-rose-200"}`}
            >
              {validation.valid
                ? `Valid strict Mermaid Â· ${validation.nodeCount} nodes Â· ${validation.edgeCount} edges`
                : validation.errors.join(" ")}
            </p>
            {validation.valid ? (
              <div
                className="mt-3 overflow-auto rounded border border-white/10 p-2"
                dangerouslySetInnerHTML={{
                  __html: mermaidToSafeSvg(editedMermaid),
                }}
              />
            ) : null}
            <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-500">
              {describeMermaid(editedMermaid)}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={btn}
                disabled={!validation.valid || !artifactAvailable("mermaid")}
                onClick={() => void copyGeneratedText("mermaid")}
              >
                Copy Mermaid
              </button>
              <button
                className={btn}
                onClick={() => setEditedMermaid(mermaid.source)}
              >
                Reset generated version
              </button>
              {generated ? (
                <>
                  <button
                    className={btn}
                    disabled={!artifactAvailable("mermaid")}
                    onClick={() => download("mermaid")}
                  >
                    Download .mmd
                  </button>
                  <button
                    className={btn}
                    disabled={!artifactAvailable("svg")}
                    onClick={() => download("svg")}
                  >
                    Download .svg
                  </button>
                </>
              ) : null}
            </div>
          </Panel>
        ) : null}
        {tab === "brief" ? (
          <Panel title="One-Page Technical Solution Brief">
            <p className="text-xs text-slate-500">
              {brief.wordCount} words Â·{" "}
              {brief.fit
                ? "Within deterministic one-page content budget"
                : "One-page fit requires review"}
            </p>
            <pre className="mt-3 max-h-[65vh] overflow-auto whitespace-pre-wrap rounded bg-white p-5 text-xs text-slate-900">
              {brief.markdown}
            </pre>
            {generated ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={btn}
                  disabled={!artifactAvailable("brief-pdf")}
                  onClick={() => download("brief-pdf")}
                >
                  Download validated PDF
                </button>
                <button
                  className={btn}
                  disabled={!artifactAvailable("brief-markdown")}
                  onClick={() => download("brief-markdown")}
                >
                  Download Markdown
                </button>
                <button
                  className={btn}
                  disabled={!artifactAvailable("brief-markdown")}
                  onClick={() => void copyGeneratedText("brief-markdown")}
                >
                  Copy Markdown
                </button>
                <button
                  className={btn}
                  disabled={!artifactAvailable("internal-reviewer-brief")}
                  onClick={() => download("internal-reviewer-brief")}
                >
                  Download internal reviewer brief
                </button>
              </div>
            ) : null}
          </Panel>
        ) : null}
        {tab === "presentation" ? (
          <Panel title="Tailored Client Presentation">
            <div className="grid gap-3 lg:grid-cols-2">
              {storyboard.slides.map((s, i) => (
                <article
                  key={s.title}
                  className="aspect-video rounded-lg border border-white/10 bg-gradient-to-br from-[#061019] to-[#0b2029] p-5"
                >
                  <p className="text-[9px] text-cyan-300">
                    {i + 1} / {storyboard.slides.length}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">
                    {s.title}
                  </h3>
                  {i === 2 && validation.valid ? (
                    <div
                      className="mt-3 max-h-28 overflow-hidden rounded border border-white/10"
                      aria-label="Embedded architecture preview"
                      dangerouslySetInnerHTML={{
                        __html: mermaidToSafeSvg(editedMermaid),
                      }}
                    />
                  ) : null}
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    {s.bullets.map((b, bulletIndex) => (
                      <li key={`${i}-${bulletIndex}`}>â€¢ {b.text}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            {generated ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={primary}
                  disabled={!artifactAvailable("presentation-pptx")}
                  onClick={() => download("presentation-pptx")}
                >
                  Download editable PowerPoint
                </button>
                <button
                  className={btn}
                  disabled={!artifactAvailable("presentation-storyboard")}
                  onClick={() => download("presentation-storyboard")}
                >
                  Download storyboard
                </button>
              </div>
            ) : null}
          </Panel>
        ) : null}
        {tab === "pack" ? (
          <Panel title="Customer Solution Pack">
            <p className="text-sm text-slate-300">
              The pack includes editable Mermaid, sanitized SVG, one-page PDF
              and Markdown, editable PowerPoint, storyboard, speaker notes,
              sources, checksums, and provenance.
            </p>
            {generated ? (
              <div className="mt-3">
                <p className="text-xs text-slate-500">
                  PDF pages: {generated.brief.pageCount} Â· Slides:{" "}
                  {generated.presentation.slideCount} Â· Mermaid:{" "}
                  {generated.mermaid.valid ? "valid" : "invalid"}
                </p>
                <button
                  className={`${primary} mt-3`}
                  disabled={!artifactAvailable("solution-pack")}
                  onClick={() => download("solution-pack")}
                >
                  Download validated Solution Pack
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-amber-200">
                Generate and validate all selected artifacts before download is
                enabled.
              </p>
            )}
          </Panel>
        ) : null}
        {tab === "sources" ? (
          <Panel title="Sources and provenance">
            <p className="text-xs text-slate-500">
              {sources.length} active source records. Full documentation pages
              and raw transcripts are never embedded.
            </p>
            <ul className="mt-3 space-y-2">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="rounded border border-white/8 p-2 text-xs"
                >
                  <strong className="text-white">{s.title}</strong>
                  <span className="block text-slate-500">
                    {s.authority} Â· {s.freshnessState} Â· {s.caseSourceRefId}
                  </span>
                  {s.canonicalUrl ? (
                    <a
                      className="mt-1 inline-block text-cyan-200 underline underline-offset-2"
                      href={s.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open source
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            {generated ? (
              <button
                className={`${btn} mt-3`}
                disabled={!artifactAvailable("source-manifest")}
                onClick={() => download("source-manifest")}
              >
                Download source manifest
              </button>
            ) : null}
          </Panel>
        ) : null}
        {tab === "history" ? (
          <Panel title="Export History">
            <p className="text-xs text-slate-500">
              Local metadata only. Customer names, artifact text, transcripts,
              and sources are not written to export history.
            </p>
            {exportHistory.length ? (
              <ol className="mt-3 space-y-2">
                {exportHistory.map((entry, index) => (
                  <li
                    key={`${entry.generatedAt}-${index}`}
                    className="rounded border border-white/10 p-3 text-xs"
                  >
                    <strong className="text-white">
                      {new Date(entry.generatedAt).toLocaleString()}
                    </strong>
                    <span className="mt-1 block text-slate-500">
                      {entry.profile} Â· {entry.readiness} Â· revision{" "}
                      {entry.caseRevision} Â· {entry.artifactCount} artifacts
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                No local generation history yet.
              </p>
            )}
            <button
              className={`${btn} mt-3`}
              disabled={!exportHistory.length}
              onClick={() => {
                localStorage.removeItem(EXPORT_HISTORY_KEY);
                setExportHistory([]);
              }}
            >
              Clear local export history
            </button>
          </Panel>
        ) : null}
      </div>
    </ModulePageShell>
  );
}
function EditField({
  label,
  value,
  maxLength,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const className =
    "mt-1 w-full rounded border border-white/10 bg-black/20 p-2 text-xs text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-200";
  return (
    <label className="text-[10px] text-slate-400">
      {label}
      {multiline ? (
        <textarea
          className={`${className} min-h-24`}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={className}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
function commandForDeliverableTab(tab: string) {
  return (
    {
      readiness: "deliverables.openReadiness",
      architecture: "deliverables.openArchitecture",
      brief: "deliverables.openBrief",
      presentation: "deliverables.openPresentation",
      pack: "deliverables.openPack",
      sources: "deliverables.openSources",
    } as Record<string, string>
  )[tab];
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-xl border border-white/10 bg-[#071016] p-4">
      <h2 className="text-xs font-bold uppercase tracking-[.15em] text-cyan-200">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function Grid({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="mt-3">
      <h3 className="text-[10px] font-bold uppercase text-slate-400">
        {title}
      </h3>
      <ul className="mt-1 text-xs text-slate-500">
        {values.length ? (
          values.map((x) => <li key={x}>â€¢ {x}</li>)
        ) : (
          <li>â€¢ none</li>
        )}
      </ul>
    </div>
  );
}

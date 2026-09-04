"use client";

import { useEffect, useMemo, useState } from "react";

import { ActionButton, FieldHint, InlineMessage, LabCard } from "@/components/lab-card";
import {
  REDACTION_DOCS_URL,
  REDACTION_ENTITIES,
  REDACTION_ENTITIES_DOCS_URL,
  REDACTION_PRESETS,
  REDACTION_VERIFIED_AT,
  STREAMING_REDACTION_FIXTURE,
  SYNTHETIC_REDACTION_FIXTURES,
  appendRedactionQuery,
  evaluateRedactionCompatibility,
  fixtureUtility,
  inheritedRedactionEntities,
  normalizeRedactionPolicy,
  redactionQueryString,
  sanitizeRedactionDiagnostics,
  serializeRedactionValues,
  type RedactionCategory,
  type RedactionPolicy,
  type RedactionPresetId,
} from "@/lib/redaction";

export type RedactionHandoffDestination = "transcribe-url" | "upload-audio" | "live-mic" | "api-studio";

type RedactionLabProps = {
  policy: RedactionPolicy;
  hostedReviewMode: boolean;
  onPolicyChange: (policy: RedactionPolicy) => void;
  onApply: (destination: RedactionHandoffDestination, policy: RedactionPolicy, label: string) => void;
};

type PreviewTab = "original" | "redacted" | "findings" | "raw" | "evaluation";
type DiffMode = "side" | "inline";
type EntityFilter = "All" | RedactionCategory;

const COMPATIBILITY = [
  { deployment: "Hosted API", mode: "Prerecorded", language: "Available languages, subject to model support", supported: true },
  { deployment: "Hosted API", mode: "Streaming", language: "English only", supported: true },
  { deployment: "Self-hosted", mode: "Prerecorded", language: "English only", supported: true },
  { deployment: "Self-hosted", mode: "Streaming", language: "English only", supported: true },
] as const;

const PIPELINE_DESTINATIONS = [
  { id: "crm", name: "CRM", audio: false, note: "Preserve typed placeholders and restrict free-text logs." },
  { id: "warehouse", name: "Analytics warehouse", audio: false, note: "Apply retention, purpose limitation, and role-based access." },
  { id: "qa", name: "QA dashboard", audio: true, note: "Audio access remains sensitive even when transcript text is redacted." },
  { id: "llm", name: "LLM summarizer", audio: false, note: "Prevent prompts and traces from reintroducing sensitive values." },
  { id: "agent", name: "Support-agent workspace", audio: true, note: "Use least privilege and a defined human escalation path." },
] as const;

function policyName(policy: RedactionPolicy) {
  const values = serializeRedactionValues(policy);
  return REDACTION_PRESETS.find((preset) => {
    const expected = serializeRedactionValues(preset.policy);
    return values.length === expected.length && values.every((value, index) => value === expected[index]);
  })?.name ?? "Custom Policy";
}

function snippetSet(policy: RedactionPolicy) {
  const params = new URLSearchParams({ model: "nova-3" });
  appendRedactionQuery(params, policy);
  const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;
  return [
    { id: "query", label: "Query parameters", code: redactionQueryString(policy) || "# Redaction is off" },
    { id: "curl", label: "cURL", code: `curl -X POST "${url}" \\\n+  -H "Authorization: Token YOUR_DEEPGRAM_API_KEY" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"url":"YOUR_AUDIO_URL"}'` },
    { id: "typescript", label: "JavaScript / TypeScript", code: `const url = new URL("https://api.deepgram.com/v1/listen");\nurl.searchParams.set("model", "nova-3");\n${serializeRedactionValues(policy).map((value) => `url.searchParams.append("redact", "${value}");`).join("\n") || "// Redaction is off"}` },
    { id: "python", label: "Python", code: `params = [("model", "nova-3")${serializeRedactionValues(policy).map((value) => `,\n          ("redact", "${value}")`).join("")}]\n# requests preserves repeated tuple keys.` },
  ];
}

export function RedactionLab({ policy, hostedReviewMode, onPolicyChange, onApply }: RedactionLabProps) {
  const [selectedPreset, setSelectedPreset] = useState<RedactionPresetId>(() => policyName(policy) === "Custom Policy" ? "custom" : REDACTION_PRESETS.find((preset) => preset.name === policyName(policy))?.id ?? "off");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EntityFilter>("All");
  const [fixtureId, setFixtureId] = useState(SYNTHETIC_REDACTION_FIXTURES[0].id);
  const [tab, setTab] = useState<PreviewTab>("redacted");
  const [diffMode, setDiffMode] = useState<DiffMode>("side");
  const [streamIndex, setStreamIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState("");
  const [pipeline, setPipeline] = useState(() => new Set(["crm", "qa"]));
  const [message, setMessage] = useState("Fixture mode is ready. No live request has been made.");

  const fixture = SYNTHETIC_REDACTION_FIXTURES.find((candidate) => candidate.id === fixtureId) ?? SYNTHETIC_REDACTION_FIXTURES[0];
  const normalized = useMemo(() => normalizeRedactionPolicy(policy), [policy]);
  const inherited = useMemo(() => new Set(inheritedRedactionEntities(normalized)), [normalized]);
  const values = useMemo(() => serializeRedactionValues(normalized), [normalized]);
  const snippets = useMemo(() => snippetSet(normalized), [normalized]);
  const utility = fixtureUtility(fixture);
  const filteredEntities = useMemo(() => {
    const term = search.trim().toLowerCase();
    return REDACTION_ENTITIES.filter((entity) => (filter === "All" || entity.category === filter) && (!term || entity.displayName.toLowerCase().includes(term) || entity.value.includes(term)));
  }, [filter, search]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (streamIndex >= STREAMING_REDACTION_FIXTURE.length - 1) setPlaying(false);
      else setStreamIndex((value) => value + 1);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [playing, streamIndex]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setMessage(`${label} copied. No credentials or raw audio were included.`);
      window.setTimeout(() => setCopied(""), 1_500);
    } catch {
      setMessage("Copy failed. Select the text manually.");
    }
  }

  function selectPreset(id: RedactionPresetId) {
    const preset = REDACTION_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) return;
    setSelectedPreset(id);
    onPolicyChange({ profiles: [...preset.policy.profiles], entities: [...preset.policy.entities] });
    setMessage(`${preset.name} selected. Nothing has been sent to Deepgram.`);
  }

  function toggleEntity(value: string) {
    const selected = normalized.entities.includes(value);
    setSelectedPreset("custom");
    onPolicyChange({ ...normalized, entities: selected ? normalized.entities.filter((entity) => entity !== value) : [...normalized.entities, value] });
  }

  function apply(destination: RedactionHandoffDestination) {
    if (!values.length) {
      setMessage("Choose a redaction policy before applying it to another module.");
      return;
    }
    onApply(destination, normalized, policyName(normalized));
  }

  return (
    <div className="h-full overflow-auto space-y-4 p-4" data-testid="redaction-lab">
      <LabCard title="What Redaction Does" description="Transcript privacy, entity masking, and policy design">
        <div className="space-y-4">
          <p className="text-base leading-7 text-slate-200">Redaction replaces detected sensitive entities in transcript output with typed placeholders such as <code>[PHONE_NUMBER_1]</code> or <code>[SSN_1]</code>. The original audio remains unchanged and must be governed separately.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Principle title="Redacted transcript does not mean redacted audio." detail="Audio follows the application’s independent access, retention, and deletion policy." />
            <Principle title="Detection reduces exposure; it does not eliminate governance responsibility." detail="Logs, exports, interim events, downstream systems, and false negatives still need controls." />
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4 font-mono text-xs leading-6 text-slate-300" aria-label="Redaction architecture">
            Original audio → remains unchanged / audio-retention policy<br />
            Deepgram STT → detects configured entity classes<br />
            Transcript output → typed redaction placeholders<br />
            Downstream systems → policy, access, retention, logging, and audit decisions
          </div>
          <InlineMessage status="idle">{hostedReviewMode ? "Hosted Review Mode — the policy lab and fixtures are public; live transcription remains protected and intentional." : "Local lab — fixtures remain offline; live execution happens only from a destination module after an explicit Run or Start."}</InlineMessage>
        </div>
      </LabCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
        <div className="space-y-4">
          <LabCard title="Redaction policy builder" description="Profiles map to verified Deepgram request values; they are not compliance labels.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {REDACTION_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
                <button key={preset.id} type="button" aria-pressed={selectedPreset === preset.id} onClick={() => selectPreset(preset.id)} className={`rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-200/60 ${selectedPreset === preset.id ? "border-cyan-200/50 bg-cyan-200/10" : "border-white/10 bg-black/20 hover:border-white/25"}`}>
                  <span className="block text-sm font-semibold text-white">{preset.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">{preset.summary}</span>
                  <span className="mt-2 block font-mono text-[11px] text-cyan-100">{redactionQueryString(preset.policy) || "No parameters"}</span>
                </button>
              ))}
            </div>
            {!values.length ? <p className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-slate-400" data-testid="redaction-off-state">Off — no redact query values will be sent.</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <label className="min-w-56 flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-300">Search entities by name or API value</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="phone number, ssn, drug…" className="min-h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white focus:border-cyan-200/50 focus:outline-none" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-300">Category</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as EntityFilter)} className="min-h-10 rounded-md border border-white/10 bg-[#070b0f] px-3 text-sm text-white">
                  {(["All", "PII", "PHI", "PCI", "Other"] as const).map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/10" role="list" aria-label="Deepgram redaction entities">
              {filteredEntities.map((entity) => {
                const explicit = normalized.entities.includes(entity.value);
                const inheritedByProfile = inherited.has(entity.value);
                return (
                  <label key={entity.value} className="flex min-h-14 cursor-pointer items-start gap-3 border-b border-white/[0.07] p-3 last:border-0 hover:bg-white/[0.035]">
                    <input type="checkbox" checked={explicit || inheritedByProfile} disabled={inheritedByProfile} onChange={() => toggleEntity(entity.value)} className="mt-1 size-4 accent-cyan-200" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm text-white"><strong>{entity.displayName}</strong><code className="text-xs text-cyan-100">{entity.value}</code><span className="text-[10px] uppercase tracking-wide text-slate-500">{inheritedByProfile ? "Inherited" : explicit ? "Explicit" : entity.category}</span></span>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">{entity.description}</span>
                    </span>
                  </label>
                );
              })}
              {!filteredEntities.length ? <p className="p-4 text-sm text-slate-400">No verified entity matches this search.</p> : null}
            </div>
          </LabCard>

          <LabCard title="Synthetic transcript playground" description="Deterministic local fixtures model documented placeholder behavior; they are not live Deepgram results or benchmarks.">
            <div className="flex flex-wrap gap-2">
              <label className="min-w-60 flex-1"><span className="sr-only">Synthetic scenario</span><select value={fixtureId} onChange={(event) => { setFixtureId(event.target.value); setTab("redacted"); }} className="min-h-10 w-full rounded-md border border-white/10 bg-[#070b0f] px-3 text-sm text-white">{SYNTHETIC_REDACTION_FIXTURES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <div role="group" aria-label="Comparison layout" className="flex rounded-md border border-white/10 p-1">
                <button type="button" aria-pressed={diffMode === "side"} onClick={() => setDiffMode("side")} className="rounded px-3 py-1 text-xs text-slate-200">Side by side</button>
                <button type="button" aria-pressed={diffMode === "inline"} onClick={() => setDiffMode("inline")} className="rounded px-3 py-1 text-xs text-slate-200">Inline</button>
              </div>
            </div>
            <div role="tablist" aria-label="Transcript fixture views" className="mt-3 flex overflow-x-auto border-b border-white/10">
              {(["original", "redacted", "findings", "raw", "evaluation"] as PreviewTab[]).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-10 whitespace-nowrap border-b-2 px-3 text-xs font-medium capitalize ${tab === value ? "border-cyan-200 text-cyan-100" : "border-transparent text-slate-400"}`}>{value === "raw" ? "Raw Response" : value === "evaluation" ? "Policy Evaluation" : value}</button>)}
            </div>
            <div className="mt-3" role="tabpanel" aria-live="polite">
              {tab === "original" ? <TranscriptPanel label="Original synthetic transcript — not stored" text={fixture.original} tone="warning" /> : null}
              {tab === "redacted" ? diffMode === "side" ? <div className="grid gap-3 md:grid-cols-2"><TranscriptPanel label="Original synthetic fixture" text={fixture.original} tone="warning" /><TranscriptPanel label="Expected redacted fixture" text={fixture.redacted} tone="success" /></div> : <TranscriptPanel label="Linear comparison" text={`ORIGINAL\n${fixture.original}\n\nEXPECTED REDACTED\n${fixture.redacted}`} tone="success" /> : null}
              {tab === "findings" ? <div className="space-y-2">{fixture.findings.map((finding) => <div key={finding.placeholder} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3 text-xs sm:grid-cols-3"><span>{finding.entity}</span><code className="text-cyan-100" aria-label={`Redacted placeholder ${finding.placeholder}`}>{finding.placeholder}</code><span className="text-slate-400">Selected by {finding.selectedBy}</span></div>)}</div> : null}
              {tab === "raw" ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-3 text-xs text-slate-300">{JSON.stringify({ fixture: true, synthetic: true, transcript: fixture.redacted, findings: fixture.findings.map(({ entity, placeholder }) => ({ entity, placeholder })) }, null, 2)}</pre> : null}
              {tab === "evaluation" ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Expected spans" value={String(fixture.findings.length)} /><Metric label="Typed placeholders" value={String(utility.placeholderCount)} /><Metric label="Entity classes" value={String(utility.distinctEntityClasses)} /><Metric label="Transcript utility indicator" value={`${utility.transcriptUtilityIndicator}%`} /></div> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={() => void copy(fixture.redacted, "Redacted fixture")}>Copy redacted transcript</ActionButton>
              <ActionButton variant="secondary" onClick={() => void copy(fixture.findings.map((finding) => finding.placeholder).join("\n"), "Placeholder list")}>Copy placeholders list</ActionButton>
              <ActionButton variant="secondary" onClick={() => { setFixtureId(SYNTHETIC_REDACTION_FIXTURES[0].id); setStreamIndex(0); setPlaying(false); setMessage("Fixture session cleared. No transcript was persisted."); }}>Clear session</ActionButton>
            </div>
            <FieldHint>Transcript utility indicator is a transparent local token-replacement ratio, not a Deepgram accuracy or quality metric.</FieldHint>
          </LabCard>

          <LabCard title="Streaming redaction explorer" description="Fixture timeline: interim placeholders can change as context stabilizes.">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3" role="log" aria-live="polite">
              {STREAMING_REDACTION_FIXTURE.slice(0, streamIndex + 1).map((event, index) => <div key={`${event.at}-${event.label}`} className={`grid grid-cols-[5.5rem_1fr_auto] gap-3 border-b border-white/[0.07] py-2 text-xs last:border-0 ${index === streamIndex ? "text-cyan-100" : "text-slate-400"}`}><time>{event.at}</time><span>{event.label}</span><code>{event.placeholder ?? event.phase}</code></div>)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play fixture timeline"}</ActionButton>
              <ActionButton variant="secondary" onClick={() => { setPlaying(false); setStreamIndex((value) => Math.min(STREAMING_REDACTION_FIXTURE.length - 1, value + 1)); }}>Step event</ActionButton>
              <ActionButton variant="secondary" onClick={() => { setPlaying(false); setStreamIndex(0); }}>Reset</ActionButton>
              <ActionButton variant="secondary" onClick={() => void copy(JSON.stringify(STREAMING_REDACTION_FIXTURE[streamIndex], null, 2), "Sanitized streaming event")}>Copy sanitized event</ActionButton>
            </div>
            <InlineMessage status="error">Applications that consume interim results may briefly handle changing transcript states. Treat all realtime events as sensitive until your application has applied its own downstream controls.</InlineMessage>
            <p className="mt-3 text-xs text-amber-100"><strong>no_delay:</strong> <code>true</code> prioritizes lower latency and may reduce redaction performance. “Prioritize redaction quality” means using <code>false</code> or omitting the parameter; this lab never silently rewrites an advanced request.</p>
          </LabCard>

          <LabCard title="API configuration" description="Repeated values remain repeated query parameters—not comma-separated values.">
            <div className="space-y-3">{snippets.map((snippet) => <div key={snippet.id} className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-300">{snippet.label}</p><button type="button" onClick={() => void copy(snippet.code, snippet.label)} className="rounded border border-white/10 px-2 py-1 text-xs text-cyan-100">{copied === snippet.label ? "Copied" : `Copy ${snippet.label}`}</button></div><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-300">{snippet.code}</pre></div>)}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={() => apply("transcribe-url")}>Use in Transcribe URL</ActionButton>
              <ActionButton variant="secondary" onClick={() => apply("upload-audio")}>Use in Upload Audio</ActionButton>
              <ActionButton variant="secondary" onClick={() => apply("live-mic")}>Use in Live Mic</ActionButton>
              <ActionButton variant="secondary" onClick={() => apply("api-studio")}>Open in API Studio</ActionButton>
              <ActionButton variant="secondary" onClick={() => { window.localStorage.setItem("deepgram-lab-redaction-default-v1", JSON.stringify(normalized)); setMessage(`${policyName(normalized)} saved as a policy-only lab default. No transcript, audio, or credential was stored.`); }}>Save as lab default</ActionButton>
            </div>
          </LabCard>

          <LabCard title="Downstream pipeline simulator" description="Architecture prompt, not legal advice.">
            <p className="mb-3 text-sm text-slate-300">Customer call → Deepgram redacted transcript → downstream destinations</p>
            <div className="grid gap-2 md:grid-cols-2">{PIPELINE_DESTINATIONS.map((destination) => <label key={destination.id} className="rounded-lg border border-white/10 bg-black/20 p-3"><span className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={pipeline.has(destination.id)} onChange={() => setPipeline((current) => { const next = new Set(current); if (next.has(destination.id)) next.delete(destination.id); else next.add(destination.id); return next; })} className="size-4 accent-cyan-200" />{destination.name}</span><span className="mt-2 block text-xs leading-5 text-slate-400">Receives redacted transcript: yes · receives audio: {destination.audio ? "possible" : "no by default"} · retention and RBAC required. {destination.note}</span></label>)}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2"><InlineMessage status="error">Governance failure: transcript was redacted, but raw audio was retained indefinitely.</InlineMessage><InlineMessage status="error">Governance failure: application logs stored unredacted interim transcript events.</InlineMessage></div>
          </LabCard>
        </div>

        <aside className="space-y-4">
          <LabCard title="Policy summary" description={policyName(normalized)}>
            <dl className="space-y-2 text-xs"><Summary label="Request values" value={values.join(", ") || "Off"} /><Summary label="Selected profiles" value={normalized.profiles.join(", ") || "None"} /><Summary label="Explicit entities" value={normalized.entities.join(", ") || "None"} /><Summary label="Inherited entities" value={String(inherited.size)} /><Summary label="Potential under-redaction" value="Detection may miss expected spans" /><Summary label="Potential over-redaction" value="Useful content may be replaced" /></dl>
            <button type="button" onClick={() => void copy(JSON.stringify(sanitizeRedactionDiagnostics({ policy: normalized, fixture, mode: "fixture" }), null, 2), "Redaction diagnostics")} className="mt-3 min-h-10 w-full rounded-md border border-white/10 px-3 text-xs text-cyan-100">Export Redaction Diagnostics</button>
          </LabCard>
          <LabCard title="Compatibility matrix" description={`Official docs checked ${REDACTION_VERIFIED_AT}`}>
            <div className="space-y-2">{COMPATIBILITY.map((row) => <div key={`${row.deployment}-${row.mode}`} className="rounded-md border border-white/10 bg-black/20 p-3 text-xs"><p className="font-semibold text-white">{row.deployment} — {row.mode}</p><p className="mt-1 text-slate-400">{row.language}</p></div>)}</div>
            <p className="mt-3 text-xs leading-5 text-amber-100">Flux is not enabled in this project: the current verified Flux operation metadata does not expose <code>redact</code>. Manual verification is required.</p>
            <p className="mt-3 text-xs text-slate-400">{evaluateRedactionCompatibility({ deployment: "hosted", mode: "streaming", language: "it" }).reason}</p>
          </LabCard>
          <LabCard title="Limitations and safeguards" description="No detection system should be treated as perfect.">
            <ul className="space-y-2 text-xs leading-5 text-slate-300"><li><strong>Under-redaction:</strong> sensitive text can remain.</li><li><strong>Over-redaction:</strong> transcript utility can decrease.</li><li><strong>Context ambiguity:</strong> meaning changes by use case.</li><li><strong>Digit policies:</strong> harmless times or quantities may be masked.</li><li><strong>Regional variation:</strong> identifiers vary by country and language.</li><li><strong>Streaming state:</strong> interim and final placeholders can differ.</li></ul>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Validation checklist</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-300"><li>Representative recordings, accents, noise, and interruptions</li><li>Spoken digit grouping and domain terminology</li><li>Code-switching plus interim and final handling</li><li>Downstream logs and independent audio retention</li><li>Policy drift and human escalation</li></ul>
          </LabCard>
          <LabCard title="Verification sources" description="Capability source of truth">
            <p className="text-xs leading-5 text-slate-400">Official Deepgram documentation was verified on {REDACTION_VERIFIED_AT}. The connected Docs MCP required renewed OAuth during this run, so unresolved details were not inferred.</p>
            <div className="mt-3 flex flex-col gap-2"><a className="text-xs text-cyan-100 underline" href={REDACTION_DOCS_URL} target="_blank" rel="noreferrer">Deepgram Redaction documentation</a><a className="text-xs text-cyan-100 underline" href={REDACTION_ENTITIES_DOCS_URL} target="_blank" rel="noreferrer">Deepgram supported entity types</a></div>
          </LabCard>
        </aside>
      </div>
      <div role="status" aria-live="polite" className="sticky bottom-3 z-10 rounded-lg border border-cyan-200/20 bg-[#071016]/95 px-4 py-3 text-sm text-cyan-50 shadow-xl backdrop-blur">{message}</div>
    </div>
  );
}

function Principle({ title, detail }: { title: string; detail: string }) { return <div className="rounded-lg border border-amber-200/20 bg-amber-200/[0.055] p-4"><p className="font-semibold text-amber-50">{title}</p><p className="mt-1 text-xs leading-5 text-slate-300">{detail}</p></div>; }
function TranscriptPanel({ label, text, tone }: { label: string; text: string; tone: "warning" | "success" }) { return <div className={`rounded-lg border p-3 ${tone === "warning" ? "border-amber-300/20 bg-amber-300/[0.04]" : "border-emerald-300/20 bg-emerald-300/[0.04]"}`}><p className="text-xs font-semibold text-slate-300">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white">{text}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-mono text-sm text-cyan-100">{value}</p></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] pb-2"><dt className="text-slate-500">{label}</dt><dd className="max-w-[60%] break-words text-right font-mono text-slate-200">{value}</dd></div>; }

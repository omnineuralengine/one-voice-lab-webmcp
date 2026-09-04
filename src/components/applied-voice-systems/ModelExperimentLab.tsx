"use client";

import { useMemo, useState } from "react";

import {
  EmptyState,
  FieldLabel,
  JsonView,
  MetricTile,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  downloadTextFile,
  inputClassName,
  primaryButtonClassName,
  textareaClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { calculateWer, compareTranscripts, sanitizeAppliedExport } from "@/lib/applied-voice/academy";
import { AUDIO_UPLOAD_LIMITS } from "@/lib/audio-file-policy";
import { redactSecrets, type ApiDebugEnvelope } from "@/lib/inspection";
import type { ExperimentRun } from "@/types/applied-voice";

const DEFAULT_AUDIO_URL = "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav";

const EXPERIMENT_PRESETS = [
  { id: "smart-format", name: "Smart format off vs on", hypothesis: "Smart formatting improves number/date readability without changing lexical content.", executable: true, note: "Run the same audio twice and change only smart_format." },
  { id: "diarization", name: "Diarization off vs on", hypothesis: "Speaker labeling improves review utility on multi-speaker audio at some latency/complexity cost.", executable: true, note: "Use representative multi-speaker audio; a single-speaker clip cannot validate diarization." },
  { id: "keyterms", name: "Generic vocabulary vs domain keyterms", hypothesis: "Nova-3 keyterms improve important domain terminology on representative audio.", executable: true, note: "Use `keyterm` with Nova-3; test a held-out domain-term set." },
  { id: "language", name: "English vs Italian", hypothesis: "Explicit language selection should match the spoken language and improve appropriate decoding.", executable: true, note: "Use different language-matched audio. Do not compare the same English clip as if it were Italian." },
  { id: "noise", name: "Clean microphone vs noisy sample", hypothesis: "Noise changes error segments and may require capture/preprocessing work, not only a model toggle.", executable: true, note: "Use paired or controlled recordings where possible." },
  { id: "nova-flux", name: "Nova streaming vs Flux conversation behavior", hypothesis: "Flux turn events may better fit interactive conversation; Nova remains general-purpose streaming ASR.", executable: false, note: "Concept-only here. These products serve different interaction needs; this lab does not run live Flux." },
  { id: "endpointing", name: "Endpointing for different pauses", hypothesis: "Pause settings trade response speed against false turn completion.", executable: false, note: "Use the Turn-Taking Lab recorded simulation; endpointing and Flux thresholds are not interchangeable controls." },
] as const;

export function ModelExperimentLab({
  runs,
  onRunsChange,
  onOpenTurnLab,
  openLabMode = false,
}: {
  runs: ExperimentRun[];
  onRunsChange: (runs: ExperimentRun[]) => void;
  onOpenTurnLab: () => void;
  openLabMode?: boolean;
}) {
  const [presetId, setPresetId] = useState<(typeof EXPERIMENT_PRESETS)[number]["id"]>("smart-format");
  const preset = EXPERIMENT_PRESETS.find((item) => item.id === presetId) ?? EXPERIMENT_PRESETS[0];
  const [source, setSource] = useState<"url" | "file">("url");
  const [audioUrl, setAudioUrl] = useState(DEFAULT_AUDIO_URL);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [model, setModel] = useState("nova-3");
  const [language, setLanguage] = useState("en");
  const [smartFormat, setSmartFormat] = useState(true);
  const [diarizeModel, setDiarizeModel] = useState("none");
  const [keyterm, setKeyterm] = useState("");
  const [hypothesis, setHypothesis] = useState<string>(preset.hypothesis);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(runs.at(-1)?.id ?? "");
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs.at(-1);
  const comparisonRuns = runs.slice(-2);

  const currentPayload = useMemo(() => ({
    source,
    sourcePreview: source === "url" ? audioUrl : file ? { name: file.name, type: file.type, sizeBytes: file.size } : null,
    model,
    language,
    smart_format: smartFormat,
    diarize_model: diarizeModel === "none" ? undefined : diarizeModel,
    keyterm: keyterm || undefined,
  }), [audioUrl, diarizeModel, file, keyterm, language, model, smartFormat, source]);

  async function runExperiment() {
    if (!preset.executable) {
      setStatus("error");
      setMessage("This preset is architectural, not executable in the current lab. Use the linked teaching surface.");
      return;
    }
    if (source === "file" && !file) {
      setStatus("error");
      setMessage("Choose an audio file first.");
      return;
    }
    if (source === "file" && openLabMode && file && file.size > AUDIO_UPLOAD_LIMITS.hosted) {
      setStatus("error");
      setMessage("Open Lab uploads must be 10 MB or smaller.");
      return;
    }
    setStatus("running");
    setMessage("Running through the existing local STT route…");
    try {
      const endpoint = source === "url" ? "/api/deepgram/transcribe-url" : "/api/deepgram/transcribe-file";
      const init = source === "url" ? buildUrlRequest() : buildFileRequest(file!);
      const response = await fetch(endpoint, init);
      const raw = redactSecrets(await response.json()) as ApiDebugEnvelope<Record<string, unknown>>;
      const data = raw.data ?? {};
      const transcript = typeof data.transcript === "string" ? data.transcript : "";
      const deepgramRaw = isRecord(data.raw) ? data.raw : {};
      const alternative = readAlternative(deepgramRaw);
      const run: ExperimentRun = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        hypothesis,
        audioMetadata: source === "file" && file ? { source: "upload", name: file.name, type: file.type || "unknown", sizeBytes: file.size } : { source: "hosted-url", url: audioUrl },
        model,
        language,
        parameters: { smart_format: smartFormat, diarize_model: diarizeModel, keyterm },
        requestPayload: sanitizeAppliedExport(currentPayload),
        responsePayload: sanitizeAppliedExport(raw),
        transcript,
        referenceTranscript: reference || undefined,
        comparison: reference.trim() ? compareTranscripts(reference, transcript) : undefined,
        timestamps: Array.isArray(alternative.words) ? alternative.words.flatMap((word) => isRecord(word) && typeof word.word === "string" && typeof word.start === "number" && typeof word.end === "number" ? [{ word: word.word, start: word.start, end: word.end }] : []) : [],
        durationMs: raw.inspector?.durationMs ?? null,
        requestId: readRequestId(deepgramRaw),
        errors: raw.ok ? [] : [raw.error?.message ?? `HTTP ${response.status}`],
        userNotes: notes,
        conclusion: "Record what changed and whether the evidence supports the hypothesis.",
        decision: "Pending review",
        provenance: "measured",
      };
      onRunsChange([...runs, run]);
      setSelectedRunId(run.id);
      setStatus(raw.ok ? "idle" : "error");
      setMessage(raw.ok ? "Measured run saved locally. Compare it with another controlled configuration." : run.errors[0] ?? "Experiment failed.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Experiment request failed.");
    }
  }

  function buildUrlRequest(): RequestInit {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: audioUrl, model, language, smart_format: smartFormat, diarize_model: diarizeModel === "none" ? undefined : diarizeModel, keyterm: keyterm || undefined, punctuate: true }) };
  }

  function buildFileRequest(audio: File): RequestInit {
    const form = new FormData();
    form.append("file", audio);
    form.append("model", model);
    form.append("language", language);
    form.append("smart_format", String(smartFormat));
    form.append("punctuate", "true");
    if (diarizeModel !== "none") form.append("diarize_model", diarizeModel);
    if (keyterm) form.append("keyterm", keyterm);
    return { method: "POST", body: form };
  }

  function updateRun(run: ExperimentRun) {
    onRunsChange(runs.map((item) => item.id === run.id ? run : item));
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(410px,.9fr)_minmax(440px,1.1fr)] gap-3 p-3">
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading eyebrow="Reproducible experiment harness" title="Change one decision, preserve the evidence" detail="Actual STT calls use existing local server routes. Concept-only comparisons cannot be executed here." actions={<ProvenanceBadge value={preset.executable ? "working" : "architectural concept"} />} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <FieldLabel label="Experiment preset"><select value={presetId} onChange={(event) => { const id = event.target.value as typeof presetId; const next = EXPERIMENT_PRESETS.find((item) => item.id === id)!; setPresetId(id); setHypothesis(next.hypothesis); }} className={inputClassName}>{EXPERIMENT_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FieldLabel>
            <div className="rounded-md border border-white/10 bg-black/20 p-2 text-[9px] leading-4 text-slate-500">{preset.note}</div>
            <div className="xl:col-span-2"><FieldLabel label="Hypothesis"><textarea value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} rows={2} className={textareaClassName} /></FieldLabel></div>
            <FieldLabel label="Audio source"><select value={source} onChange={(event) => setSource(event.target.value as typeof source)} className={inputClassName}><option value="url">Hosted audio URL</option><option value="file">Upload test file</option></select></FieldLabel>
            {source === "url" ? openLabMode
              ? <div className="rounded-md border border-cyan-200/15 bg-cyan-200/[0.04] p-2 text-[9px] leading-4 text-cyan-50/70">Open Lab uses the bundled sample; custom media URLs are available only in local/operator mode.</div>
              : <FieldLabel label="Audio URL"><input value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} className={inputClassName} /></FieldLabel>
              : <FieldLabel label="Audio file"><input type="file" accept="audio/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block h-9 w-full text-[10px] text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-cyan-200 file:px-2 file:py-1 file:text-[9px] file:font-bold file:text-slate-950" />{openLabMode ? <span className="mt-1 block text-[9px] text-slate-500">10 MB maximum in Open Lab.</span> : null}</FieldLabel>}
            <FieldLabel label="Model"><select value={model} onChange={(event) => setModel(event.target.value)} className={inputClassName}><option value="nova-3">Nova-3</option><option value="nova-2">Nova-2 · legacy comparison</option></select></FieldLabel>
            <FieldLabel label="Language"><select value={language} onChange={(event) => setLanguage(event.target.value)} className={inputClassName}><option value="en">English</option><option value="it">Italian</option><option value="multi">Multilingual mode</option></select></FieldLabel>
            <ToggleField label="Smart format" checked={smartFormat} onChange={setSmartFormat} />
            <FieldLabel label="Diarization model"><select value={diarizeModel} onChange={(event) => setDiarizeModel(event.target.value)} className={inputClassName}><option value="none">Off</option><option value="latest">Latest</option><option value="v1">v1</option><option value="v2">v2 · batch only</option></select></FieldLabel>
            <FieldLabel label="Nova-3 keyterm"><input value={keyterm} onChange={(event) => setKeyterm(event.target.value)} placeholder="Deepgram, domain phrase" className={inputClassName} /></FieldLabel>
            <FieldLabel label="Reference transcript / ground truth"><textarea value={reference} onChange={(event) => setReference(event.target.value)} rows={5} className={textareaClassName} /></FieldLabel>
            <FieldLabel label="Run notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} className={textareaClassName} /></FieldLabel>
          </div>
          <div className="mt-3"><JsonView value={currentPayload} label="Request hypothesis · no credentials" maxHeight="max-h-44" /></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-[#071018] p-3">
          <button type="button" onClick={() => void runExperiment()} disabled={status === "running" || !preset.executable} className={primaryButtonClassName}>{status === "running" ? "Running…" : "Run configuration"}</button>
          {!preset.executable ? <button type="button" onClick={onOpenTurnLab} className={buttonClassName}>Open relevant teaching lab</button> : null}
          <p className={`ml-auto max-w-xs text-right text-[9px] leading-3.5 ${status === "error" ? "text-amber-200" : "text-slate-600"}`}>{message}</p>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading eyebrow="Run evidence" title={`${runs.length} saved configuration${runs.length === 1 ? "" : "s"}`} detail="Only sanitized response data and experiment metadata are stored locally." actions={runs.length ? <button type="button" onClick={() => downloadTextFile("applied-voice-experiments.json", JSON.stringify(sanitizeAppliedExport(runs), null, 2), "application/json")} className={buttonClassName}>Export JSON</button> : null} />
        <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-white/10 p-2">
            {runs.map((run, index) => <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)} className={`mb-1.5 w-full rounded-md border p-2 text-left ${selectedRun?.id === run.id ? "border-cyan-300/30 bg-cyan-300/[0.08]" : "border-white/[0.07] bg-black/15 hover:border-white/15"}`}><span className="block text-[10px] font-semibold text-slate-200">Run {index + 1} · {run.model}</span><span className="mt-1 block truncate font-mono text-[8px] text-slate-600">{run.requestId ?? "no request id"}</span><span className="mt-1 block text-[8px] text-slate-500">{run.parameters.smart_format ? "smart on" : "smart off"} · {run.durationMs ?? "—"} ms</span></button>)}
          </div>
          <div className="min-h-0 overflow-y-auto p-3">
            {selectedRun ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2"><MetricTile label="Request latency" value={selectedRun.durationMs === null ? "—" : `${selectedRun.durationMs} ms`} provenance={selectedRun.provenance} /><MetricTile label="WER" value={selectedRun.comparison ? `${selectedRun.comparison.percentage.toFixed(1)}%` : "No reference"} provenance={selectedRun.comparison ? "derived" : "unavailable"} /><MetricTile label="Errors" value={String(selectedRun.errors.length)} provenance={selectedRun.provenance} /></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Transcript</p><p className="mt-2 text-xs leading-5 text-slate-300">{selectedRun.transcript || "No transcript returned."}</p></div>
                {comparisonRuns.length === 2 ? <SideBySide runs={comparisonRuns} /> : null}
                <div className="grid gap-3 xl:grid-cols-2"><FieldLabel label="Conclusion"><textarea value={selectedRun.conclusion} onChange={(event) => updateRun({ ...selectedRun, conclusion: event.target.value })} rows={4} className={textareaClassName} /></FieldLabel><FieldLabel label="Decision"><textarea value={selectedRun.decision} onChange={(event) => updateRun({ ...selectedRun, decision: event.target.value })} rows={4} className={textareaClassName} /></FieldLabel></div>
                <JsonView value={{ requestId: selectedRun.requestId, parameters: selectedRun.parameters, timestamps: selectedRun.timestamps, errors: selectedRun.errors }} label="Run record" />
              </div>
            ) : <EmptyState title="No experiment evidence yet" detail="Run one configuration, change one meaningful variable, then run again for a controlled comparison." />}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SideBySide({ runs }: { runs: ExperimentRun[] }) {
  const derived = runs[0].referenceTranscript ? calculateWer(runs[0].referenceTranscript, runs[1].transcript) : null;
  return <div className="rounded-lg border border-violet-300/15 bg-violet-300/[0.035] p-3"><div className="flex items-center justify-between"><p className="text-[9px] font-semibold uppercase tracking-wide text-violet-200/70">Latest two runs</p><ProvenanceBadge value="derived" /></div><div className="mt-2 grid grid-cols-2 gap-2">{runs.map((run, index) => <div key={run.id} className="rounded border border-white/[0.08] bg-black/20 p-2"><p className="text-[9px] font-semibold text-slate-500">Run {index + 1} · {run.model}</p><p className="mt-1 text-[10px] leading-4 text-slate-300">{run.transcript || "No transcript"}</p></div>)}</div>{derived ? <p className="mt-2 text-[9px] text-slate-500">Run 2 WER against Run 1 reference: {derived.percentage.toFixed(1)}%. A human must still review punctuation, terminology, speakers, and business impact.</p> : null}</div>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex h-9 items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 text-[10px] text-slate-300">{label}<input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-cyan-300" /></label>;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function readAlternative(raw: Record<string, unknown>) { const results = isRecord(raw.results) ? raw.results : {}; const channels = Array.isArray(results.channels) ? results.channels : []; const first = isRecord(channels[0]) ? channels[0] : {}; const alternatives = Array.isArray(first.alternatives) ? first.alternatives : []; return isRecord(alternatives[0]) ? alternatives[0] : {}; }
function readRequestId(raw: Record<string, unknown>) { const metadata = isRecord(raw.metadata) ? raw.metadata : {}; return typeof metadata.request_id === "string" ? metadata.request_id : null; }

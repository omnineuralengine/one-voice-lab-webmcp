"use client";

import { useMemo, useState } from "react";

import { DEEPGRAM_NOVA3_LANGUAGE_OPTIONS, type DeepgramNova3LanguageCode } from "@/lib/deepgram-languages";
import { RECOMMENDED_SAMPLE_LANGUAGE_ORDER, recommendedSamplesByLanguage } from "@/lib/deepgram-samples";
import type { DeepgramHostedSample, TranscribeUrlLanguageMode } from "@/types/deepgram-samples";

const LANGUAGE_NAMES = new Map(DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.map((option) => [option.code, option.name]));

export function TranscribeUrlSamplePicker({
  samples,
  selectedSample,
  catalogStatus,
  catalogNote,
  languageMode,
  language,
  onSelectSample,
  onLanguageModeChange,
  onOpenModule,
  onUseCustomUrl,
  onAudioUnavailable,
  allowCustomUrl = true,
}: {
  samples: DeepgramHostedSample[];
  selectedSample: DeepgramHostedSample | null;
  catalogStatus: "idle" | "loading" | "available" | "unavailable";
  catalogNote: string;
  languageMode: TranscribeUrlLanguageMode;
  language: DeepgramNova3LanguageCode;
  onSelectSample: (sample: DeepgramHostedSample) => void;
  onLanguageModeChange: (mode: TranscribeUrlLanguageMode) => void;
  onOpenModule: (module: "live-mic" | "upload-audio" | "live-observatory") => void;
  onUseCustomUrl: () => void;
  onAudioUnavailable: () => void;
  allowCustomUrl?: boolean;
}) {
  const [previewErrorSampleId, setPreviewErrorSampleId] = useState("");
  const recommended = useMemo(() => recommendedSamplesByLanguage(samples), [samples]);
  const naturalSamples = samples.filter((sample) => sample.sourceType === "natural/prerecorded speech");
  const auraSamples = samples.filter((sample) => sample.sourceType === "synthesized TTS speech");
  const selectedBaseLanguage = language.toLowerCase().split("-")[0];
  const hasMatchingSample = samples.some((sample) => sample.languageCode === selectedBaseLanguage);
  const mismatch = languageMode === "manual" && selectedSample && selectedSample.languageCode !== selectedBaseLanguage;
  const previewError = Boolean(selectedSample && previewErrorSampleId === selectedSample.id);

  return (
    <div className="space-y-3 rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3" data-testid="transcribe-url-sample-picker">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Matched sample picker</p>
          <p className="mt-1 text-xs text-slate-400">Official hosted audio with recognition settings that follow the spoken language.</p>
        </div>
        <SampleBadge>{catalogStatus === "loading" ? "Loading metadata…" : catalogStatus === "unavailable" ? "Metadata unavailable" : "Official Deepgram source"}</SampleBadge>
      </div>

      <label className="block text-xs font-medium text-slate-300">
        Official hosted sample
        <select
          aria-label="Official hosted sample"
          value={selectedSample?.id ?? "custom"}
          onChange={(event) => {
            const sample = samples.find((item) => item.id === event.target.value);
            if (sample) onSelectSample(sample);
            else onUseCustomUrl();
          }}
          className="mt-1 h-10 w-full rounded-md border border-white/10 bg-[#05090e] px-3 text-sm text-white outline-none focus:border-cyan-200/60"
        >
          {allowCustomUrl ? <option value="custom">Custom public URL</option> : null}
          <optgroup label="Prerecorded speech examples">
            {naturalSamples.map((sample) => <option key={sample.id} value={sample.id}>{sample.title}</option>)}
          </optgroup>
          {RECOMMENDED_SAMPLE_LANGUAGE_ORDER.map((code) => {
            const languageSamples = auraSamples.filter((sample) => sample.languageCode === code);
            return languageSamples.length ? <optgroup key={code} label={`Aura synthesized speech — ${LANGUAGE_NAMES.get(code) ?? code}`}>{languageSamples.map((sample) => <option key={sample.id} value={sample.id}>{sample.title}</option>)}</optgroup> : null;
          })}
        </select>
      </label>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Try transcription in another language</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Try transcription in another language">
          {recommended.map((sample) => (
            <button
              key={sample.languageCode}
              type="button"
              onClick={() => onSelectSample(sample)}
              aria-pressed={selectedSample?.id === sample.id}
              className={`shrink-0 rounded-md border px-3 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-cyan-200 ${selectedSample?.id === sample.id ? "border-cyan-200/50 bg-cyan-200/15 text-white" : "border-white/10 bg-black/20 text-slate-400 hover:text-white"}`}
            >
              <span className="block font-semibold">{sample.spokenLanguage}</span>
              <span className="mt-0.5 block text-[9px] opacity-70">{sample.sourceType === "synthesized TTS speech" ? "Aura sample" : "Prerecorded"}</span>
            </button>
          ))}
          {!recommended.length ? <p className="text-xs text-slate-500">No verified sample metadata is currently available.</p> : null}
        </div>
      </div>

      {selectedSample ? (
        <div className="rounded-md border border-white/10 bg-black/20 p-3" data-testid="selected-sample-metadata">
          <div className="flex flex-wrap items-center gap-1.5">
            <SampleBadge>{selectedSample.sourceType === "synthesized TTS speech" ? "TTS-generated sample" : "Natural/prerecorded speech"}</SampleBadge>
            <SampleBadge>Official Deepgram source</SampleBadge>
            <SampleBadge>{selectedSample.languageCode}</SampleBadge>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-white">{selectedSample.title}</h3>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[10px] leading-4">
            <dt className="text-slate-600">Spoken language</dt><dd className="text-slate-300">{selectedSample.spokenLanguage}</dd>
            <dt className="text-slate-600">Recognition setting</dt><dd className="font-mono text-cyan-100">{selectedSample.languageCode}</dd>
            <dt className="text-slate-600">Source</dt><dd className="text-slate-300">{selectedSample.source}</dd>
            {selectedSample.model ? <><dt className="text-slate-600">Generated by</dt><dd className="font-mono text-slate-300">{selectedSample.model}</dd></> : null}
            {selectedSample.accent ? <><dt className="text-slate-600">Accent</dt><dd className="text-slate-300">{selectedSample.accent}</dd></> : null}
          </dl>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">{selectedSample.learningNote}</p>
          <audio
            key={selectedSample.sampleUrl}
            controls
            preload="none"
            src={selectedSample.sampleUrl}
            aria-label={`Preview ${selectedSample.title}`}
            className="mt-3 h-9 w-full"
            onError={() => { setPreviewErrorSampleId(selectedSample.id); onAudioUnavailable(); }}
          />
          {previewError ? <p role="alert" className="mt-2 text-[10px] text-rose-200">Audio URL unavailable. No transcription request was made.</p> : null}
          {selectedSample.sourceType === "synthesized TTS speech" ? <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/5 p-2 text-[10px] leading-4 text-amber-100">This clip was generated by a speech-synthesis model. It is useful for demonstrating language handling and API behavior, but it should not be treated as a natural-speech accuracy benchmark.</p> : null}
        </div>
      ) : allowCustomUrl ? <div className="flex flex-wrap items-center gap-2"><SampleBadge>Custom URL</SampleBadge><span className="text-[10px] text-slate-500">Verify that the public audio and selected spoken language match before transcribing.</span></div> : <p className="text-[10px] text-amber-100">Choose one of the curated Open Lab samples before transcribing.</p>}

      <fieldset>
        <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Language mode</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([[
            "match", "Match sample"
          ], ["auto-detect", "Auto-detect"], ["manual", "Manual override"]] as Array<[TranscribeUrlLanguageMode, string]>).map(([value, label]) => (
            <label key={value} className={`cursor-pointer rounded-md border px-2 py-2 text-center text-[10px] font-semibold ${languageMode === value ? "border-cyan-200/45 bg-cyan-200/12 text-white" : "border-white/10 bg-black/15 text-slate-500"}`}>
              <input type="radio" name="transcribe-url-language-mode" value={value} checked={languageMode === value} onChange={() => onLanguageModeChange(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {languageMode === "auto-detect" ? <p className="rounded border border-violet-300/15 bg-violet-300/5 p-2 text-[10px] leading-4 text-violet-100">The request sends <code>detect_language=true</code> and omits a fixed <code>language</code>. Deepgram’s detected language is displayed from the response when available.</p> : null}
      {mismatch ? <p role="status" className="rounded border border-amber-300/20 bg-amber-300/5 p-2 text-[10px] leading-4 text-amber-100">Intentional mismatch: this sample is {selectedSample.spokenLanguage} ({selectedSample.languageCode}), but recognition is set to {LANGUAGE_NAMES.get(language) ?? language} ({language}). Explicit confirmation is required before transcription.</p> : null}

      {!hasMatchingSample && languageMode === "manual" ? (
        <div className="rounded-md border border-amber-300/15 bg-amber-300/5 p-3">
          <p className="text-xs font-semibold text-amber-100">No verified Deepgram-hosted sample is currently available for this language.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionButton onClick={() => onOpenModule("live-mic")}>Record with microphone</ActionButton>
            <ActionButton onClick={() => onOpenModule("upload-audio")}>Upload matching audio</ActionButton>
            {allowCustomUrl ? <ActionButton onClick={onUseCustomUrl}>Enter a matching public URL</ActionButton> : null}
            <ActionButton onClick={() => onOpenModule("live-observatory")}>Return to Live Observatory</ActionButton>
            <ActionButton onClick={() => onOpenModule("upload-audio")}>Open File Transcription</ActionButton>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-white/10">
        <div className="grid grid-cols-[1fr_90px_1fr] bg-white/[0.04] px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500"><span>Language</span><span>Matching sample</span><span>Sample type</span></div>
        {RECOMMENDED_SAMPLE_LANGUAGE_ORDER.map((code) => {
          const matching = samples.filter((sample) => sample.languageCode === code);
          const types = [...new Set(matching.map((sample) => sample.sourceType === "synthesized TTS speech" ? "TTS-generated" : "Prerecorded"))];
          return <div key={code} className="grid grid-cols-[1fr_90px_1fr] border-t border-white/[0.06] px-2 py-1.5 text-[9px] text-slate-400"><span>{LANGUAGE_NAMES.get(code)}</span><span className={matching.length ? "text-emerald-200" : "text-amber-200"}>{matching.length ? "Available" : "Upload/record"}</span><span>{types.join(" + ") || "Matching audio required"}</span></div>;
        })}
        <div className="grid grid-cols-[1fr_90px_1fr] border-t border-white/[0.06] px-2 py-1.5 text-[9px] text-slate-500"><span>Other STT languages</span><span>Varies</span><span>Upload/record may be required</span></div>
      </div>
      <p className="text-[9px] leading-4 text-slate-600">{catalogNote || "The sample catalog does not claim to cover every STT-supported language."}</p>
    </div>
  );
}

function SampleBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold text-slate-300">{children}</span>;
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[9px] text-slate-300 hover:border-cyan-200/30 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200">{children}</button>;
}

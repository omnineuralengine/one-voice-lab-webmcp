"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { UploadIcon } from "@/components/icons";
import { CURATED_UPLOAD_AUDIO_SAMPLES, type CuratedAudioSample } from "@/data/audio-samples";
import {
  AUDIO_FILE_ACCEPT,
  audioUploadLimitLabel,
  validateAudioFile,
  type AudioUploadMode,
  type AudioValidationResult,
} from "@/lib/audio-file-policy";
import { formatBytes } from "@/lib/inspection";

type SelectedMetadata = Extract<AudioValidationResult, { ok: true }>;

export function AudioFileDropzone({
  file,
  mode,
  onFileChange,
  onStatusChange,
  onUseInAudioSignalLab,
}: {
  file: File | null;
  mode: AudioUploadMode;
  onFileChange: (file: File | null) => void;
  onStatusChange: (status: "idle" | "error", message: string) => void;
  onUseInAudioSignalLab: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLButtonElement | null>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [busySampleId, setBusySampleId] = useState("");
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<SelectedMetadata | null>(null);
  const [previewSource, setPreviewSource] = useState<{ file: File; url: string } | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!file || metadata) return;
    let active = true;
    void validateAudioFile(file, { mode }).then((result) => {
      if (!active) return;
      if (result.ok) setMetadata(result);
      else setError(result.message);
    });
    return () => { active = false; };
  }, [file, metadata, mode]);

  useEffect(() => {
    if (!file) return;

    const nextUrl = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setPreviewSource({ file, url: nextUrl });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  useEffect(() => {
    if (file) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setPreviewSource(null);
    });
    return () => { active = false; };
  }, [file]);

  const objectUrl = previewSource?.file === file ? previewSource.url : "";

  function openPicker() {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  async function selectFile(nextFile: File, sample: CuratedAudioSample | null = null) {
    setError("");
    setPreviewError("");
    const result = await validateAudioFile(nextFile, { mode, currentFile: file });
    if (!result.ok) {
      setError(result.message);
      onStatusChange("error", result.message);
      return;
    }

    setMetadata(result);
    setDurationSeconds(sample?.durationSeconds ?? null);
    onFileChange(nextFile);
    onStatusChange("idle", `${sample?.name ?? nextFile.name} selected. No transcription request has been sent.`);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) void selectFile(nextFile);
  }

  function handleDragEnter(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length > 1) {
      const message = "Choose one audio file. Replace or remove the selected file before continuing.";
      setError(message);
      onStatusChange("error", message);
      return;
    }
    if (droppedFiles[0]) void selectFile(droppedFiles[0]);
  }

  async function selectSample(sample: CuratedAudioSample) {
    if (mode === "hosted" && sample.availability === "local-only") {
      setError("This sample is local-only");
      onStatusChange("error", "This sample is local-only");
      return;
    }

    setBusySampleId(sample.id);
    setError("");
    try {
      const response = await fetch(sample.assetPath, { cache: "no-store" });
      if (!response.ok) throw new Error("sample unavailable");
      const blob = await response.blob();
      const sampleFile = new File([blob], sample.filename, { type: sample.mimeType, lastModified: 0 });
      await selectFile(sampleFile, sample);
    } catch {
      setError("File could not be read");
      onStatusChange("error", "File could not be read");
    } finally {
      setBusySampleId("");
    }
  }

  function removeFile() {
    setError("");
    setMetadata(null);
    setDurationSeconds(null);
    setPreviewSource(null);
    onFileChange(null);
    onStatusChange("idle", "Audio selection removed. No file is retained by the module.");
    requestAnimationFrame(() => dropZoneRef.current?.focus());
  }

  return (
    <div className="mt-4 space-y-4">
      <input ref={inputRef} aria-label="Upload audio file" type="file" accept={AUDIO_FILE_ACCEPT} className="sr-only" onChange={handleInput} />
      <button
        ref={dropZoneRef}
        type="button"
        data-testid="audio-drop-zone"
        onClick={openPicker}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 ${dragActive ? "border-cyan-200 bg-cyan-200/[0.09]" : "border-cyan-200/25 bg-black/25 hover:border-cyan-200/55 hover:bg-cyan-200/[0.04]"}`}
      >
        <UploadIcon className="mb-2 size-6 text-cyan-200" />
        <span className="text-sm font-semibold text-white">{dragActive ? "Release to load this audio file" : "Drop an audio file here, or choose a file"}</span>
        <span className="mt-1 text-xs text-slate-500">WAV, MP3, M4A, FLAC, OGG, WebM, or AAC · {audioUploadLimitLabel(mode)} {mode} limit</span>
      </button>
      <p className="sr-only" role="status" aria-live="polite">{dragActive ? "Release to load this audio file" : "Audio drop zone ready"}</p>

      <div aria-live="assertive" aria-atomic="true">
        {error ? <p role="alert" className="rounded-md border border-rose-300/25 bg-rose-300/[0.07] px-3 py-2 text-xs text-rose-100">{error}</p> : null}
      </div>

      {file && metadata && objectUrl ? (
        <section className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.035] p-3" aria-label="Selected audio file">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-white">{file.name}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                {metadata.mimeType} · {metadata.format} · {formatBytes(file.size)} · {durationSeconds === null ? "Duration unavailable" : formatDuration(durationSeconds)}
              </p>
              <p className="mt-1 text-[10px] text-emerald-100/70">Validated by {metadata.validationSource === "mime-and-signature" ? "MIME type and file signature" : "extension and file signature"}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openPicker} className={secondaryButton}>Replace</button>
              <button type="button" onClick={removeFile} aria-label={`Remove ${file.name}`} className={secondaryButton}>Remove</button>
            </div>
          </div>
          {metadata.warning ? <p className="mt-2 rounded border border-amber-300/20 bg-amber-300/[0.05] p-2 text-[10px] text-amber-100">{metadata.warning}</p> : null}
          <audio
            key={objectUrl}
            controls
            preload="metadata"
            src={objectUrl}
            aria-label={`Preview selected audio: ${file.name}`}
            className="mt-3 h-10 w-full"
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              if (Number.isFinite(duration)) setDurationSeconds(duration);
            }}
            onError={() => setPreviewError("Audio preview is unavailable in this browser. The file remains selected.")}
          />
          {previewError ? <p role="status" className="mt-2 text-[10px] text-amber-100">{previewError}</p> : null}
          <button type="button" onClick={onUseInAudioSignalLab} className="mt-3 rounded border border-violet-300/25 bg-violet-300/[0.08] px-3 py-2 text-xs font-semibold text-violet-100 hover:border-violet-200/45">
            Use in Audio Signal Lab
          </button>
        </section>
      ) : null}

      <section aria-labelledby="try-a-sample-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p id="try-a-sample-title" className="text-xs font-semibold text-white">Try a sample</p>
            <p className="mt-1 text-[10px] text-slate-500">Selection loads a local public asset for preview. It never starts transcription.</p>
          </div>
          <span className="text-[9px] uppercase tracking-[0.14em] text-slate-600">{CURATED_UPLOAD_AUDIO_SAMPLES.length} inspected</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CURATED_UPLOAD_AUDIO_SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              disabled={Boolean(busySampleId)}
              onClick={() => void selectSample(sample)}
              className="rounded-lg border border-white/10 bg-black/20 p-3 text-left transition hover:border-cyan-200/25 hover:bg-cyan-200/[0.03] disabled:cursor-wait disabled:opacity-60"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">{sample.name}</span>
                <span className="shrink-0 font-mono text-[9px] text-slate-600">{formatDuration(sample.durationSeconds)}</span>
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-slate-500">{sample.purpose}</span>
              <span className="mt-2 block text-[9px] text-cyan-100/65">{sample.format} · {sample.language} · {sample.signalCharacteristic}</span>
              <span className="mt-1 block text-[9px] text-violet-200/60">Try: {sample.recommendedExperiment}</span>
              {busySampleId === sample.id ? <span className="mt-2 block text-[9px] text-cyan-100">Loading sample…</span> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

const secondaryButton = "rounded border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-cyan-200";

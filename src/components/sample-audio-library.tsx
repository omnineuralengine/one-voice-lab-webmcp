"use client";

import { useEffect, useMemo, useState } from "react";

import { ActionButton, FieldHint, StatusBadge } from "@/components/lab-card";
import { PayloadInspector } from "@/components/PayloadInspector";
import { buildInspectorRecord, createTimelineEvent, nowIso } from "@/lib/inspection";
import {
  SAMPLE_AUDIO_SCENARIOS,
  getSampleAudioPath,
  getSampleAudioUrl,
  type SampleScenario,
} from "@/lib/sample-scenarios";

type SampleAudioLibraryProps = {
  onUseSample: (sample: SampleScenario) => void;
  guidedHints: boolean;
};

export function SampleAudioLibrary({ onUseSample, guidedHints }: SampleAudioLibraryProps) {
  const [fileExistence, setFileExistence] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;

    async function checkFiles() {
      const entries = await Promise.all(
        SAMPLE_AUDIO_SCENARIOS.map(async (sample) => {
          const path = getSampleAudioPath(sample.slug);

          try {
            const response = await fetch(path, { method: "HEAD", cache: "no-store" });
            return [sample.slug, response.ok] as const;
          } catch {
            return [sample.slug, false] as const;
          }
        }),
      );

      if (active) {
        setFileExistence(Object.fromEntries(entries));
      }
    }

    void checkFiles();

    return () => {
      active = false;
    };
  }, []);

  const libraryInspector = useMemo(() => buildSampleLibraryInspector(fileExistence), [fileExistence]);

  return (
    <section className="space-y-4 lg:col-span-2">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-200/70">Demo Assets</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Sample Audio Library</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Generate these local MP3s when you want repeatable demos across support, healthcare, finance, retail,
            travel, education, and multilingual transcription.
          </p>
        </div>
        <StatusBadge status="idle">{SAMPLE_AUDIO_SCENARIOS.length} scenarios</StatusBadge>
      </div>

      <PayloadInspector record={libraryInspector} defaultOpen={guidedHints} title="Sample Library Inspector" />

      <div className="grid gap-4 xl:grid-cols-2">
        {SAMPLE_AUDIO_SCENARIOS.map((sample) => (
          <SampleAudioCard
            key={sample.slug}
            sample={sample}
            audioExists={Boolean(fileExistence[sample.slug])}
            guidedHints={guidedHints}
            onUseSample={onUseSample}
          />
        ))}
      </div>
    </section>
  );
}

function SampleAudioCard({
  sample,
  audioExists,
  guidedHints,
  onUseSample,
}: {
  sample: SampleScenario;
  audioExists: boolean;
  guidedHints: boolean;
  onUseSample: (sample: SampleScenario) => void;
}) {
  const audioPath = getSampleAudioPath(sample.slug);
  const [copyState, setCopyState] = useState("");
  const badges = useMemo(() => buildOptionBadges(sample), [sample]);
  const inspector = useMemo(() => buildSampleInspector(sample, audioExists), [audioExists, sample]);

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(sample.transcript);
      setCopyState("Transcript copied.");
    } catch {
      setCopyState("Copy unavailable in this browser context.");
    }

    window.setTimeout(() => setCopyState(""), 1600);
  }

  return (
    <article className="rounded-lg border border-white/10 bg-[#0b1117]/92 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.26)] ring-1 ring-white/[0.03]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-6 text-white">{sample.title}</h3>
          <p className="mt-1 text-sm text-cyan-100/75">{sample.vertical}</p>
        </div>
        <StatusBadge status="idle">{sample.language}</StatusBadge>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{sample.demoGoal}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={badge}
            className="rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-xs font-medium text-slate-300"
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
        {audioExists ? (
          <audio controls src={audioPath} className="h-10 w-full" aria-label={`${sample.title} sample audio`} />
        ) : (
          <FieldHint>
            Audio file not found yet. Run <span className="font-mono text-slate-300">npm run samples:generate</span>{" "}
            to create <span className="font-mono text-slate-300">{audioPath}</span>.
          </FieldHint>
        )}
      </div>

      {copyState ? <p className="mt-3 text-xs text-emerald-200">{copyState}</p> : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <ActionButton onClick={() => onUseSample(sample)}>Use in Transcribe URL</ActionButton>
        <ActionButton variant="secondary" onClick={copyTranscript}>
          Copy Transcript
        </ActionButton>
      </div>
      <PayloadInspector record={inspector} defaultOpen={guidedHints} title="Sample Payload Inspector" className="mt-4" />
    </article>
  );
}

function buildOptionBadges(sample: SampleScenario) {
  const options = sample.recommendedDeepgramOptions;
  const badges = [`model: ${options.model}`, `language: ${options.language}`];

  if (options.smart_format) {
    badges.push("smart_format");
  }

  if (options.diarize) {
    badges.push("diarize");
  }

  if (options.numerals) {
    badges.push("numerals");
  }

  if (options.keyterms?.length) {
    badges.push(`keyterms: ${options.keyterms.length}`);
  }

  badges.push(sample.voiceModel);
  return badges;
}

export function sampleUrlForTranscription(sample: SampleScenario) {
  return getSampleAudioUrl(sample.slug);
}

function buildSampleLibraryInspector(fileExistence: Record<string, boolean>) {
  const startedAt = nowIso();
  const completedAt = nowIso();
  const languages = Array.from(new Set(SAMPLE_AUDIO_SCENARIOS.map((sample) => sample.language))).sort();
  const verticals = Array.from(new Set(SAMPLE_AUDIO_SCENARIOS.map((sample) => sample.vertical))).sort();
  const files = SAMPLE_AUDIO_SCENARIOS.map((sample) => ({
    slug: sample.slug,
    path: getSampleAudioPath(sample.slug),
    exists: Boolean(fileExistence[sample.slug]),
  }));

  return buildInspectorRecord({
    id: "sample-library",
    module: "Sample Audio Library",
    startedAt,
    completedAt,
    request: {
      method: "HEAD",
      endpoint: "http://localhost:3000/samples/*.mp3",
      bodyPreview: {
        checkedFiles: files.length,
      },
    },
    response: {
      status: 200,
      bodyPreview: {
        sampleCount: SAMPLE_AUDIO_SCENARIOS.length,
        languages,
        verticals,
        existingFiles: files.filter((file) => file.exists),
        missingFiles: files.filter((file) => !file.exists),
      },
    },
    timeline: files.map((file) =>
      createTimelineEvent({
        type: file.exists ? "sample.exists" : "sample.missing",
        label: file.path,
        data: file,
      }),
    ),
    notes: [
      "Sample cards are local demo metadata. Audio files are generated into public/samples/.",
      "Missing files are expected before npm run samples:generate has been run.",
    ],
  });
}

function buildSampleInspector(sample: SampleScenario, audioExists: boolean) {
  const at = nowIso();
  const path = getSampleAudioPath(sample.slug);

  return buildInspectorRecord({
    id: `sample-${sample.slug}`,
    module: `Sample Audio / ${sample.slug}`,
    startedAt: at,
    completedAt: at,
    request: {
      method: "LOCAL",
      endpoint: `http://localhost:3000${path}`,
      bodyPreview: {
        sample,
      },
    },
    response: {
      status: audioExists ? 200 : 404,
      bodyPreview: {
        exists: audioExists,
        generatedFilePath: path,
        expectedTranscript: sample.transcript,
        recommendedDeepgramOptions: sample.recommendedDeepgramOptions,
      },
    },
    timeline: [
      createTimelineEvent({
        type: audioExists ? "sample.audio_found" : "sample.audio_missing",
        label: audioExists ? "Generated audio file exists locally" : "Generated audio file is missing",
        data: { path, exists: audioExists },
      }),
    ],
    notes: [
      "Use in Transcribe URL loads this local sample URL and language into the URL transcription card.",
      "Copy Transcript copies the expected script used by the TTS generator.",
    ],
  });
}

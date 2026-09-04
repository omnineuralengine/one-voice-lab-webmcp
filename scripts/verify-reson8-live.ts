import { rm } from "node:fs/promises";

import { monotonicNow } from "@/lib/providers/audio-response";
import { readReson8ServerCredential } from "@/lib/providers/reson8/live-credential";
import {
  acquireReson8LiveFileLease,
  writeReson8LiveReportAtomic,
} from "@/lib/providers/reson8/live-filesystem";
import {
  RESON8_LIVE_AUDIO_MANIFEST_PATH,
  RESON8_LIVE_AUDIO_PATH,
  RESON8_LIVE_INPUT_DIRECTORY,
  runReson8OfflinePreflight,
} from "@/lib/providers/reson8/live-preflight";
import {
  Reson8LivePreflightError,
  buildReson8LiveTurnEvidence,
  parseReson8LiveOperationSelection,
  runReson8LiveVerifier,
  type Reson8LiveOperationEvidence,
  type Reson8LiveOperationInput,
} from "@/lib/providers/reson8/live-verifier";
import { requireReson8SyntheticTranscript } from "@/lib/providers/reson8/live-transcript";
import {
  createReson8LivePrerecordedTransport,
  runReson8LiveRealtime,
  runReson8LiveTurns,
} from "@/lib/providers/reson8/live-transport";
import { createReson8PrerecordedSttAdapter } from "@/lib/providers/reson8/prerecorded";

const verificationDirectory = RESON8_LIVE_INPUT_DIRECTORY;
const audioPath = RESON8_LIVE_AUDIO_PATH;
const audioManifestPath = RESON8_LIVE_AUDIO_MANIFEST_PATH;

async function main(): Promise<void> {
  const selectedOperations = parseReson8LiveOperationSelection(process.argv.slice(2));
  const report = await runReson8LiveVerifier({
    currentWorkingDirectory: process.cwd(),
    environment: process.env,
    loadAudio: async () => (await runReson8OfflinePreflight()).audio,
    acquireExclusiveLease: () => acquireReson8LiveFileLease(verificationDirectory),
    readCredential: () => readReson8ServerCredential(process.env),
    operations: {
      prerecorded: runPrerecorded,
      realtime: runRealtime,
      turns: runTurns,
    },
    selectedOperations,
    writeReport: (report, credential) => writeReson8LiveReportAtomic({
      directory: verificationDirectory,
      report,
      credential,
    }).then(() => undefined),
    deleteTemporaryAudio: async () => {
      await rm(audioPath);
      await rm(audioManifestPath);
    },
    log: (message) => console.log(message),
  });

  console.log(`Sanitized report written: tmp/reson8-live-verification/report.json (${report.status}).`);
  if (report.status !== "complete") process.exitCode = 1;
}

async function runPrerecorded(input: Reson8LiveOperationInput): Promise<Reson8LiveOperationEvidence> {
  const startedAt = monotonicNow();
  const adapter = createReson8PrerecordedSttAdapter(
    createReson8LivePrerecordedTransport(input.credential),
  );
  const result = await adapter.execute({
    file: input.audio.file,
    options: {
      includeTimestamps: true,
      includeWords: true,
      includeLanguage: true,
      includeConfidence: true,
    },
  }, { timeoutMilliseconds: 20_000 });
  return {
    durationMilliseconds: elapsedMilliseconds(startedAt),
    eventTypes: [],
    transcriptComparison: compareTranscript(result.transcript, input),
  };
}

async function runRealtime(input: Reson8LiveOperationInput): Promise<Reson8LiveOperationEvidence> {
  const result = await runReson8LiveRealtime({
    audio: input.audio.bytes,
    credential: input.credential,
    timeoutMilliseconds: 20_000,
  });
  const finalText = combineTranscriptParts(result.events
    .filter((event) => event.type === "final-transcript")
    .map((event) => event.type === "final-transcript" ? event.transcript.text : ""));
  return {
    durationMilliseconds: result.durationMilliseconds,
    eventTypes: result.events.map((event) => event.type).filter(isReportEventType),
    transcriptComparison: compareTranscript(finalText, input),
  };
}

async function runTurns(input: Reson8LiveOperationInput): Promise<Reson8LiveOperationEvidence> {
  const result = await runReson8LiveTurns({
    audio: input.audio.bytes,
    credential: input.credential,
    timeoutMilliseconds: 20_000,
  });
  const turnEvents = result.events.filter((event) => (
    event.type === "turn-start" || event.type === "turn-end-candidate" || event.type === "turn-end"
  ));
  if (!result.turnCompletion) throw new Error("The bounded Turns session did not produce completion evidence.");
  const turnEvidence = buildReson8LiveTurnEvidence({
    events: turnEvents,
    expectedPhrase: input.expectedPhrase,
    expectedTurns: input.expectedTurns,
    completion: result.turnCompletion,
  });
  return {
    durationMilliseconds: result.durationMilliseconds,
    eventTypes: result.events.map((event) => event.type).filter(isReportEventType),
    transcriptComparison: turnEvidence.sessionTranscriptComparison,
    turnEvidence,
  };
}

function compareTranscript(actual: string, input: Reson8LiveOperationInput) {
  return requireReson8SyntheticTranscript({
    observed: actual,
    expected: input.expectedPhrase,
    provenance: input.audio.manifest.provenance,
  });
}

function combineTranscriptParts(parts: readonly string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ");
}

function isReportEventType(value: string): value is Reson8LiveOperationEvidence["eventTypes"][number] {
  return [
    "partial-transcript",
    "final-transcript",
    "flush-confirmed",
    "turn-start",
    "turn-end-candidate",
    "turn-end",
  ].includes(value);
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Number((monotonicNow() - startedAt).toFixed(3)));
}

void main().catch((error: unknown) => {
  const code = error instanceof Reson8LivePreflightError ? error.code : "verification-failed";
  const detail = error instanceof Reson8LivePreflightError ? ` ${error.message}` : "";
  console.error(`Reson8 live verifier stopped safely (${code}).${detail} No automatic retry was attempted.`);
  process.exitCode = 1;
});

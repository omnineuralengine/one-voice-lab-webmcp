import type {
  AudioFixtureId,
  AudioFormatMetadata,
  AudioHealthDiagnosis,
  AudioSignalMetrics,
  AudioSignalSourceKind,
  AudioVariant,
  AudioVariantId,
  SpectrumSummary,
} from "@/types/audio-signal-lab";

export const AUDIO_SIGNAL_SAMPLE_RATE = 48_000;
export const AUDIO_SIGNAL_CLIP_THRESHOLD = 0.98;

export const AUDIO_FIXTURES: Array<{ id: AudioFixtureId; label: string; detail: string }> = [
  { id: "silence", label: "Digital silence", detail: "Zero-valued local samples" },
  { id: "sine", label: "Sine tone", detail: "440 Hz at a conservative level" },
  { id: "low-tone", label: "Low-level tone", detail: "440 Hz near the noise-floor lesson" },
  { id: "clipped-tone", label: "Clipped tone", detail: "Synthetic flattened peaks; safer than raising hardware gain" },
  { id: "noise", label: "Pink-style noise", detail: "Deterministic filtered-noise approximation" },
  { id: "sweep", label: "Frequency sweep", detail: "Short 120 Hz to 8 kHz local sweep" },
];

export const AUDIO_VARIANTS: Array<{ id: AudioVariantId; label: string; detail: string }> = [
  { id: "original", label: "Original / untouched", detail: "A copied buffer with no processing" },
  { id: "low-gain", label: "Low gain", detail: "Amplitude reduced by 18 dB" },
  { id: "digital-clipping", label: "Digital clipping", detail: "Gain then hard limiting" },
  { id: "background-noise", label: "Added background noise", detail: "Deterministic low-level noise added" },
  { id: "mono", label: "Mono conversion", detail: "Downmixed source buffer represented as one channel" },
  { id: "telephony", label: "Telephony-bandwidth simulation", detail: "Approximate 300–3400 Hz browser-side filter" },
  { id: "resampled", label: "Resampled fixture", detail: "Downsampled to 16 kHz then reconstructed for preview" },
  { id: "chunking", label: "Long vs short chunking", detail: "Same samples with conceptual 100 ms and 1000 ms groupings" },
];

export const DAW_TO_VOICE_AI = [
  ["Tracking", "Capture the cleanest useful source.", "Capture intelligible speech with known device, channel, sample rate, and format.", "capture"],
  ["Gain staging", "Maintain useful level without clipping.", "Avoid clipped or extremely quiet speech before recognition.", "gain"],
  ["Channel strip", "Apply EQ, compression, gating, and processing.", "Use preprocessing only with a clear hypothesis; aggressive processing can remove speech information.", "variants"],
  ["Bus / routing", "Move signals between tracks, groups, sends, and outputs.", "Route capture through transport, STT, agent, TTS, and playback with explicit ownership.", "pipeline"],
  ["Buffer size", "Trade latency against stability.", "Chunk size and buffering influence responsiveness, overhead, and stream behavior.", "chunking"],
  ["Monitoring", "Hear the captured or processed signal.", "Playback can create echo or feedback when TTS reenters the microphone.", "echo"],
  ["Bounce / export", "Render audio into a container and codec.", "Match container, encoding, channels, and sample rate to the receiving API contract.", "format"],
  ["Mixing", "Balance multiple sources.", "Determine whether speakers are isolated by channel or mixed and require diarization.", "channels"],
  ["Mastering", "Optimize a final program for delivery.", "Do not assume a polished signal is better for recognition; test representative audio.", "compare"],
] as const;

export const SIGNAL_FLOW_STAGES = [
  { id: "source", label: "Microphone or file", input: "Acoustic pressure or stored bytes", output: "Device stream or file", owner: "browser / customer", dataType: "MediaStream or Blob", failure: "Wrong device, clipped source, silent channel", evidence: "track label, waveform, file metadata", module: "Audio Signal Lab" },
  { id: "capture", label: "Browser/device capture", input: "Selected input", output: "Browser audio track", owner: "browser / OS / hardware", dataType: "MediaStreamTrack", failure: "Constraints differ from requested settings", evidence: "getSettings(), selected device", module: "Audio Signal Lab" },
  { id: "graph", label: "Audio graph", input: "Track samples", output: "Analysis or processed samples", owner: "customer code / browser", dataType: "Float32 frames", failure: "Unintended processing or routing", evidence: "RMS, peak, FFT, graph connections", module: "Audio Signal Lab" },
  { id: "recorder", label: "MediaRecorder or raw frames", input: "Audio track", output: "Chunks", owner: "browser / customer code", dataType: "Blob chunks or PCM frames", failure: "Unsupported MIME or timing jitter", evidence: "recorder MIME, chunk intervals", module: "Live Mic" },
  { id: "format", label: "Container / codec", input: "Chunks or file", output: "Decodable audio", owner: "browser / customer", dataType: "WAV, WebM, Ogg, MP4, raw", failure: "Container mistaken for raw encoding", evidence: "headers, MIME, ffprobe, decoder", module: "Upload Audio" },
  { id: "network", label: "Network chunks", input: "Audio bytes", output: "Ordered transport frames", owner: "customer / network", dataType: "HTTP body or WebSocket frames", failure: "Gaps, reordering, oversized buffering", evidence: "chunk counts, intervals, byte totals", module: "Live Observatory" },
  { id: "stt", label: "Deepgram STT", input: "Audio plus verified parameters", output: "Transcript and metadata", owner: "Deepgram", dataType: "JSON events", failure: "Language/model/config mismatch", evidence: "request ID, sanitized payload, response events", module: "Payload Inspector" },
  { id: "turn", label: "Transcript and turn events", input: "Acoustic and model evidence", output: "Interim/final/turn state", owner: "Deepgram + customer orchestration", dataType: "Results, VAD, turn events", failure: "Pause mistaken for completed intent", evidence: "timeline, endpointing, resumed speech", module: "Live Observatory" },
  { id: "agent", label: "Agent / tools", input: "Turn text and context", output: "Decision and tool result", owner: "customer / Deepgram / third party", dataType: "Messages and structured payloads", failure: "Tool or policy failure appears as model failure", evidence: "tool trace and application status", module: "Applied Voice Systems" },
  { id: "playback", label: "TTS / playback device", input: "Response text or audio", output: "Room or headset audio", owner: "Deepgram + browser / device", dataType: "Audio bytes and acoustic output", failure: "Echo, self-transcription, false barge-in", evidence: "playback events, echo-cancellation setting", module: "Text to Speech" },
] as const;

export const AUDIO_ISSUE_SCENARIOS = [
  ["flattened", "Flattened waveform and distorted consonants", "gain-staging problem", "Peak reaches 0 dBFS with repeated flat tops.", "Lower interface/device gain, retest, and compare an untouched fixture.", "Confirm the model received clipped audio before changing model settings."],
  ["quiet", "Quiet speech near a noisy floor", "capture problem", "Low RMS with audible or measured background energy.", "Check mic distance, preamp gain, OS input level, and room noise.", "The signal may not separate speech cleanly from the floor."],
  ["container-raw", "WebM/Opus plus raw PCM parameters", "format/configuration mismatch", "Container metadata conflicts with invented encoding/sample-rate query values.", "Remove raw parameters and let Deepgram inspect the container.", "The bytes and request describe different formats."],
  ["silent-channel", "One stereo channel contains silence", "channel/routing problem", "Channel energy differs materially and one side is empty.", "Inspect bus routing and decide whether multichannel transcription is intended.", "Channel identity is not speaker identity."],
  ["echo", "TTS playback reenters the microphone", "echo or monitoring problem", "Known agent speech appears again at microphone ingress.", "Use headphones or platform echo cancellation; gate/mute deliberately during playback.", "The agent may hear itself or trigger false barge-in."],
  ["mulaw", "8 kHz μ-law marked as 16 kHz linear PCM", "format/configuration mismatch", "Headerless bytes are paired with the wrong encoding and rate.", "Set encoding=mulaw and sample_rate=8000 only when those facts are confirmed.", "Incorrect raw metadata makes valid bytes decode incorrectly."],
  ["terms", "Clean waveform but missed specialized terminology", "model limitation", "Signal health is reasonable; errors cluster on domain terms.", "Test verified keyterms and representative domain fixtures.", "Audio evidence is insufficient to blame capture."],
  ["italian", "Italian speech sent with English recognition", "language/configuration problem", "Configured language and spoken language differ.", "Select Italian recognition or a verified multilingual mode.", "This is recognition configuration, not translation."],
  ["chunk-jitter", "Irregular chunks and growing buffer delay", "transport/chunking problem", "Chunk interval variation and queue depth rise while the input waveform remains healthy.", "Inspect producer timing, backpressure, queue ownership, and network send completion.", "The capture is healthy, but delivery timing can delay or fragment downstream processing."],
  ["ambiguous", "Transcript changed with no preserved audio or request evidence", "insufficient evidence", "No original fixture, request ID, effective configuration, or controlled baseline was retained.", "Reproduce with a consented fixture and preserve one-variable-at-a-time evidence.", "There is not enough evidence to assign the failure to capture, configuration, transport, or the model."],
] as const;

export function createAudioFixture(id: AudioFixtureId, sampleRate = AUDIO_SIGNAL_SAMPLE_RATE, durationSeconds = 1.5) {
  const length = Math.max(1, Math.round(sampleRate * durationSeconds));
  const samples = new Float32Array(length);
  if (id === "silence") return samples;
  let pink = 0;
  let seed = 0x5eed1234;
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    if (id === "sine") samples[index] = 0.28 * Math.sin(2 * Math.PI * 440 * time);
    if (id === "low-tone") samples[index] = 0.008 * Math.sin(2 * Math.PI * 440 * time);
    if (id === "clipped-tone") samples[index] = clamp(2.8 * Math.sin(2 * Math.PI * 440 * time), -1, 1);
    if (id === "sweep") {
      const progress = index / Math.max(1, length - 1);
      const frequency = 120 * Math.pow(8000 / 120, progress);
      samples[index] = 0.2 * Math.sin(2 * Math.PI * frequency * time);
    }
    if (id === "noise") {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const white = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      pink = pink * 0.985 + white * 0.015;
      samples[index] = clamp(pink * 0.42, -0.32, 0.32);
    }
  }
  return samples;
}

export function analyzeAudioSignal(samples: Float32Array, sampleRate: number, provenance: AudioSignalMetrics["provenance"] = "derived"): AudioSignalMetrics {
  let sumSquares = 0;
  let peak = 0;
  let clippingEvents = 0;
  let clipping = false;
  let clipActive = false;
  let silentWindows = 0;
  let windowCount = 0;
  const windowSize = 512;
  for (let offset = 0; offset < samples.length; offset += windowSize) {
    let windowSquares = 0;
    const end = Math.min(samples.length, offset + windowSize);
    for (let index = offset; index < end; index += 1) {
      const sample = samples[index];
      const magnitude = Math.abs(sample);
      sumSquares += sample * sample;
      windowSquares += sample * sample;
      peak = Math.max(peak, magnitude);
      const nextClip = magnitude >= AUDIO_SIGNAL_CLIP_THRESHOLD;
      if (nextClip && !clipActive) clippingEvents += 1;
      clipActive = nextClip;
      clipping ||= nextClip;
    }
    const windowRms = Math.sqrt(windowSquares / Math.max(1, end - offset));
    if (windowRms < 0.003) silentWindows += 1;
    windowCount += 1;
  }
  const rms = samples.length ? Math.sqrt(sumSquares / samples.length) : 0;
  return {
    rms,
    peak,
    dbfs: rms > 0 ? 20 * Math.log10(rms) : null,
    clipping,
    clippingEvents,
    silencePercentage: windowCount ? (silentWindows / windowCount) * 100 : 100,
    signalPresent: rms >= 0.003,
    elapsedMs: sampleRate > 0 ? (samples.length / sampleRate) * 1000 : 0,
    spectrum: analyzeSpectrum(samples, sampleRate, provenance),
    provenance,
  };
}

export function analyzeSpectrum(samples: Float32Array, sampleRate: number, provenance: SpectrumSummary["provenance"] = "derived"): SpectrumSummary {
  if (!samples.length || sampleRate <= 0) return { low: 0, speech: 0, high: 0, dominantFrequencyHz: null, dominantBand: "unavailable", provenance };
  const frequencies = [80, 160, 250, 500, 1000, 2000, 3400, 5000, 8000, 12000].filter((frequency) => frequency < sampleRate / 2);
  const count = Math.min(samples.length, 4096);
  const energies = frequencies.map((frequency) => {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < count; index += 1) {
      const angle = (2 * Math.PI * frequency * index) / sampleRate;
      real += samples[index] * Math.cos(angle);
      imaginary -= samples[index] * Math.sin(angle);
    }
    return Math.sqrt(real * real + imaginary * imaginary) / count;
  });
  const total = energies.reduce((sum, value) => sum + value, 0) || 1;
  const group = (predicate: (frequency: number) => boolean) => energies.reduce((sum, value, index) => sum + (predicate(frequencies[index]) ? value : 0), 0) / total;
  const max = Math.max(...energies);
  const dominantFrequencyHz = max > 0.00001 ? frequencies[energies.indexOf(max)] : null;
  const low = group((frequency) => frequency < 300);
  const speech = group((frequency) => frequency >= 300 && frequency <= 4000);
  const high = group((frequency) => frequency > 4000);
  const dominantBand = dominantFrequencyHz === null ? "unavailable" : dominantFrequencyHz < 300 ? "low-frequency" : dominantFrequencyHz <= 4000 ? "speech-band" : "higher-frequency";
  return { low, speech, high, dominantFrequencyHz, dominantBand, provenance };
}

export function diagnoseAudioSignal(metrics: AudioSignalMetrics, sourceLabel = "", formatRequiresInspection = false) : AudioHealthDiagnosis {
  const limitation = "Local signal-health heuristics do not predict Deepgram accuracy; validate with representative audio and controlled transcription evidence.";
  if (formatRequiresInspection) return diagnosis("Format requires inspection", ["The audio is headerless or its container/codec could not be confirmed from inspected metadata."], "The receiver cannot interpret ambiguous bytes reliably.", "A request may fail, decode incorrectly, or return misleadingly poor output.", "Confirm container or explicit raw encoding, sample rate, and channels before constructing a request.", "high", "derived", limitation);
  if (metrics.provenance === "unavailable") return diagnosis("Capture settings unavailable", ["No analyzable samples are active."], "The input path cannot yet be verified.", "A failed or empty request could be misattributed.", "Start an explicit local fixture or microphone analysis.", "high", "unavailable", limitation);
  if (metrics.clipping || metrics.peak >= AUDIO_SIGNAL_CLIP_THRESHOLD) return diagnosis("Clipping detected", [`Peak ${formatDb(metrics.peak)} dBFS approximation`, `${metrics.clippingEvents} flattened-peak onset(s)`], "Flattened peaks can remove information from consonants.", "Distorted phonetic detail may produce recognition errors.", "Lower preamp or device input gain and retest with the same phrase.", "high", metrics.provenance, limitation);
  if (metrics.silencePercentage >= 85) return diagnosis("Mostly silence", [`${metrics.silencePercentage.toFixed(0)}% of analysis windows were below the local silence threshold.`], "Little usable speech evidence is present.", "The transcript may be empty or delayed.", "Check routing, mute state, selected device, and microphone permission.", "high", metrics.provenance, limitation);
  if (metrics.rms < 0.015) return diagnosis("Input too low", [`RMS ${formatDb(metrics.rms)} dBFS approximation`, `Peak ${formatDb(metrics.peak)} dBFS approximation`], "Speech may be too close to the noise floor.", "Quiet consonants or word onsets may be missed.", "Check microphone distance, interface gain, and operating-system input level.", "medium", metrics.provenance, limitation);
  if (metrics.peak >= 0.85) return diagnosis("Approaching clipping", [`Peak ${formatDb(metrics.peak)} dBFS approximation`, "No flattened peak crossed the local clipping threshold yet."], "Remaining headroom is limited.", "Transient peaks may clip on louder phrases.", "Reduce input gain slightly and repeat at natural speaking level.", "medium", metrics.provenance, limitation);
  if (/noise/i.test(sourceLabel) || (metrics.spectrum.high > 0.45 && metrics.rms > 0.03)) return diagnosis("Possible noisy environment", [`Higher-frequency energy ${(metrics.spectrum.high * 100).toFixed(0)}% in the coarse browser-derived band summary.`], "Background energy can reduce signal-to-noise ratio or cause false activity.", "Short or quiet speech may be harder to separate from the environment.", "Confirm by listening to a consented fixture and compare untreated audio first.", "low", metrics.provenance, limitation);
  return diagnosis("Healthy signal", [`RMS ${formatDb(metrics.rms)} dBFS approximation`, `Peak ${formatDb(metrics.peak)} dBFS approximation`, `${metrics.silencePercentage.toFixed(0)}% local silence windows`], "The local level heuristic shows useful signal with headroom.", "No audio-layer symptom is predicted from this heuristic alone.", "Keep the source unchanged for the baseline transcription test.", "medium", metrics.provenance, limitation);
}

export function createAudioVariant(original: Float32Array, sampleRate: number, id: AudioVariantId): AudioVariant {
  const samples = new Float32Array(original);
  const changes: string[] = [];
  let limitation: string | undefined;
  let chunkPlan: AudioVariant["chunkPlan"];
  if (id === "original") changes.push("Copied original samples; no processing applied.");
  if (id === "low-gain") { for (let i = 0; i < samples.length; i += 1) samples[i] *= 0.1259; changes.push("Amplitude reduced by approximately 18 dB."); }
  if (id === "digital-clipping") { for (let i = 0; i < samples.length; i += 1) samples[i] = clamp(samples[i] * 5, -1, 1); changes.push("Gain increased then hard-clipped at normalized ±1.0."); }
  if (id === "background-noise") {
    let seed = 0xabc123;
    for (let i = 0; i < samples.length; i += 1) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; samples[i] = clamp(samples[i] + ((((seed >>> 0) / 0xffffffff) * 2 - 1) * 0.035), -1, 1); }
    changes.push("Deterministic low-level background noise added to a copied buffer.");
  }
  if (id === "mono") changes.push("Channels were downmixed during fixture preparation; this variant remains one-channel mono.");
  if (id === "telephony") {
    let lowState = 0;
    let highState = 0;
    const lowAlpha = Math.exp((-2 * Math.PI * 3400) / sampleRate);
    const highAlpha = Math.exp((-2 * Math.PI * 300) / sampleRate);
    for (let i = 0; i < samples.length; i += 1) {
      lowState = (1 - lowAlpha) * samples[i] + lowAlpha * lowState;
      highState = (1 - highAlpha) * lowState + highAlpha * highState;
      samples[i] = clamp((lowState - highState) * 1.8, -1, 1);
    }
    changes.push("Approximate 300–3400 Hz browser-side band limitation applied.");
    limitation = "This is not a PSTN benchmark; real telephony also includes codecs, packet behavior, noise, and network artifacts.";
  }
  if (id === "resampled") {
    const targetRate = 16_000;
    const downLength = Math.max(1, Math.round(samples.length * targetRate / sampleRate));
    const down = new Float32Array(downLength);
    for (let i = 0; i < down.length; i += 1) down[i] = original[Math.min(original.length - 1, Math.floor(i * sampleRate / targetRate))];
    for (let i = 0; i < samples.length; i += 1) samples[i] = down[Math.min(down.length - 1, Math.floor(i * targetRate / sampleRate))];
    changes.push("Nearest-neighbor 16 kHz resampling demonstration reconstructed at the preview rate.");
    limitation = "This intentionally simple local demonstration is not a production resampler.";
  }
  if (id === "chunking") {
    const durationMs = Math.round((samples.length / sampleRate) * 1000);
    chunkPlan = { label: "Same samples; alternate grouping only", intervalMs: 100, groups: [Math.ceil(durationMs / 100), Math.ceil(durationMs / 1000)] };
    changes.push("Audio samples are unchanged; visualization compares 100 ms and 1000 ms conceptual group counts.");
  }
  return { id, label: AUDIO_VARIANTS.find((item) => item.id === id)?.label ?? id, samples, sampleRate, changes, limitation, chunkPlan };
}

export function inspectAudioBytes(input: { filename: string; mimeType: string; bytes: Uint8Array; byteSize?: number; sourceType: AudioSignalSourceKind; decoded?: { durationSeconds: number; channelCount: number; sampleRate: number } }): AudioFormatMetadata {
  const { bytes, mimeType, filename, sourceType } = input;
  let container = "Unknown";
  let codec = "Not confirmed";
  let dataKind: AudioFormatMetadata["dataKind"] = "unknown";
  let channelCount = input.decoded?.channelCount ?? null;
  let sampleRate = input.decoded?.sampleRate ?? null;
  let durationSeconds = input.decoded?.durationSeconds ?? null;
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    container = "WAV"; dataKind = "containerized";
    const format = readU16(bytes, 20); channelCount ??= readU16(bytes, 22); sampleRate ??= readU32(bytes, 24);
    codec = format === 1 ? "PCM / linear" : format === 3 ? "IEEE float PCM" : `WAV format code ${format ?? "unknown"}`;
    const dataOffset = findAscii(bytes, "data");
    const byteRate = readU32(bytes, 28);
    const dataSize = dataOffset >= 0 ? readU32(bytes, dataOffset + 4) : null;
    if (durationSeconds === null && byteRate && dataSize !== null) durationSeconds = dataSize / byteRate;
  } else if (ascii(bytes, 0, 4) === "OggS") { container = "Ogg"; dataKind = "containerized"; codec = /opus/i.test(mimeType) ? "Opus (from actual MIME)" : "Not confirmed"; }
  else if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) { container = "WebM / Matroska"; dataKind = "containerized"; codec = /opus/i.test(mimeType) ? "Opus (from actual MIME)" : "Not confirmed"; }
  else if (ascii(bytes, 4, 4) === "ftyp") { container = "MP4 / M4A"; dataKind = "containerized"; }
  else if (ascii(bytes, 0, 4) === "fLaC") { container = "FLAC"; dataKind = "containerized"; codec = "FLAC"; }
  else if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) { container = "MP3 bitstream"; dataKind = "containerized"; codec = "MP3"; }
  else if (mimeType === "audio/webm") { container = "WebM (MIME claim; header not confirmed)"; dataKind = "unknown"; }
  else if (mimeType === "application/octet-stream" || !mimeType) { container = "No recognized header"; dataKind = "raw"; }
  return {
    filename,
    mimeType: mimeType || "application/octet-stream",
    container,
    codec,
    durationSeconds,
    byteSize: input.byteSize ?? bytes.byteLength,
    channelCount,
    sampleRate,
    browserDecoding: input.decoded ? "supported" : "not-tested",
    sourceType,
    dataKind,
    confidenceNote: dataKind === "containerized" ? "Container is based on inspected header bytes or an actual browser recorder MIME; codec remains unconfirmed unless metadata supports it." : dataKind === "raw" ? "No recognized container header was found. Raw encoding, sample rate, and channels must be confirmed before building a request." : "Filename and MIME alone are not enough to confirm codec or raw-audio settings.",
  };
}

export function effectiveDeepgramAudioConfig(metadata: AudioFormatMetadata, raw?: { encoding?: string; sampleRate?: number; channels?: number }) {
  if (metadata.dataKind === "containerized") return { mode: "containerized", endpointParameters: {}, guidance: "Send the containerized bytes without contradictory raw encoding or sample_rate parameters." };
  if (metadata.dataKind === "raw" && raw?.encoding && raw.sampleRate && raw.channels) return { mode: "raw", endpointParameters: { encoding: raw.encoding, sample_rate: raw.sampleRate, channels: raw.channels }, guidance: "Raw settings are explicit and must match the actual headerless bytes." };
  return { mode: metadata.dataKind, endpointParameters: {}, guidance: "Format requires inspection. Confirm raw encoding, sample rate, and channels before constructing a Deepgram request." };
}

export function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  writeAscii(view, 0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeAscii(view, 36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) view.setInt16(44 + i * 2, Math.round(clamp(samples[i], -1, 1) * (samples[i] < 0 ? 32768 : 32767)), true);
  return new Blob([bytes], { type: "audio/wav" });
}

export function wordErrorRate(reference: string, hypothesis: string) {
  const a = words(reference); const b = words(hypothesis);
  if (!a.length) return null;
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) rows[i][j] = a[i - 1] === b[j - 1] ? rows[i - 1][j - 1] : 1 + Math.min(rows[i - 1][j], rows[i][j - 1], rows[i - 1][j - 1]);
  return { value: rows[a.length][b.length] / a.length, errors: rows[a.length][b.length], referenceWords: a.length };
}

export function transcriptDiff(a: string, b: string) {
  const left = words(a); const right = words(b); const length = Math.max(left.length, right.length);
  return Array.from({ length }, (_, index) => ({ index, a: left[index] ?? "∅", b: right[index] ?? "∅", match: left[index] === right[index] }));
}

function diagnosis(status: AudioHealthDiagnosis["status"], evidence: string[], whyItMatters: string, likelyTranscriptionSymptom: string, suggestedCheck: string, confidence: AudioHealthDiagnosis["confidence"], provenance: AudioHealthDiagnosis["provenance"], limitation: string): AudioHealthDiagnosis { return { status, evidence, whyItMatters, likelyTranscriptionSymptom, suggestedCheck, confidence, provenance, limitation }; }
function formatDb(value: number) { return value > 0 ? (20 * Math.log10(value)).toFixed(1) : "-∞"; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function words(value: string) { return value.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []; }
function ascii(bytes: Uint8Array, start: number, length: number) { return String.fromCharCode(...bytes.slice(start, start + length)); }
function readU16(bytes: Uint8Array, offset: number) { return bytes.length >= offset + 2 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true) : null; }
function readU32(bytes: Uint8Array, offset: number) { return bytes.length >= offset + 4 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true) : null; }
function findAscii(bytes: Uint8Array, value: string) { for (let i = 0; i <= bytes.length - value.length; i += 1) if (ascii(bytes, i, value.length) === value) return i; return -1; }
function writeAscii(view: DataView, offset: number, value: string) { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); }

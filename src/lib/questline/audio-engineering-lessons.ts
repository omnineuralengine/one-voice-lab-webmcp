import type {
  AudioFailureLesson,
  AudioLesson,
  ExperienceStatus,
  QuestlineLanguageId,
} from "@/types/questline";

export const AUDIO_TOPIC_GROUPS: ReadonlyArray<{
  id: AudioLesson["group"];
  label: string;
  summary: string;
}> = [
  { id: "waveform", label: "Waveform fundamentals", summary: "Relate pressure over time to amplitude, frequency, phase, transients, silence, and noise." },
  { id: "digital-audio", label: "Digital audio", summary: "Understand the sampled numbers that cross a voice API boundary." },
  { id: "containers-codecs", label: "Containers and codecs", summary: "Separate the byte encoding from the file or stream that carries it." },
  { id: "streaming", label: "Streaming", summary: "Reason about chunks, queues, packet timing, backpressure, and perceived latency." },
  { id: "capture", label: "Voice capture", summary: "Connect microphones, gain staging, rooms, and browser processing to recognition quality." },
  { id: "voice-agent", label: "Voice-agent behavior", summary: "Turn acoustic activity into responsive, interruptible conversation." },
  { id: "signal-analysis", label: "Signal analysis", summary: "Use waveform, RMS, peak, clipping, silence, channels, and timing as evidence." },
];

export const AUDIO_ENGINEERING_LESSONS: AudioLesson[] = [
  lesson({
    id: "waveform-amplitude-time",
    title: "Amplitude in the time domain",
    group: "waveform",
    concept: "A digital waveform is a sequence of signed sample values measured at regular time intervals. Amplitude describes displacement, not semantic importance.",
    soundsLike: "Larger clean excursions usually sound louder; zero-valued or near-zero samples sound silent.",
    looksLike: "Samples oscillate around zero. A clipped waveform develops flat tops and bottoms.",
    bytesMean: "For signed 16-bit PCM, -32768 to 32767 maps to the available negative and positive amplitude range.",
    deepgramReceives: "Decoded sample values after any declared container or codec is interpreted.",
    symptom: "Low gain hides speech near the noise floor; excessive gain clips consonants and vowels.",
    diagnosis: ["Inspect true peak and RMS separately.", "Compare speech level with the noise floor.", "Check for repeated full-scale sample values."],
    relatedLanguages: ["typescript", "python", "go", "csharp", "cpp"],
  }),
  lesson({
    id: "waveform-frequency-phase",
    title: "Frequency, phase, and transients",
    group: "waveform",
    concept: "Frequency describes repeated cycles per second; phase describes cycle alignment; transients are rapid changes that carry timing and consonant detail.",
    soundsLike: "A pure tone has a stable pitch. Speech is a changing mixture of periodic energy, noise, and transients.",
    looksLike: "A sine wave repeats smoothly. Speech has irregular envelopes and fast consonant edges.",
    bytesMean: "No sample contains a frequency by itself; frequency emerges from patterns across many samples.",
    deepgramReceives: "A time sequence whose spectral and temporal patterns are used by the recognition model.",
    symptom: "Aggressive filtering or lossy encoding can smear transients and reduce intelligibility.",
    diagnosis: ["Compare the waveform before and after processing.", "Listen for dull or metallic consonants.", "Confirm the source was not encoded repeatedly."],
    relatedLanguages: ["python", "typescript", "cpp"],
  }),
  lesson({
    id: "waveform-noise-floor",
    title: "Silence, room tone, and noise floor",
    group: "waveform",
    concept: "Digital silence is zero; practical silence contains microphone self-noise, room tone, electronics, and environmental sound.",
    soundsLike: "Hiss, hum, HVAC, keyboard noise, or distant speech under the desired voice.",
    looksLike: "Low-amplitude activity persists during pauses instead of collapsing toward zero.",
    bytesMean: "Small nonzero samples are still signal data and can trigger voice activity logic.",
    deepgramReceives: "Everything captured by the input path unless customer preprocessing removes or attenuates it.",
    symptom: "False speech activity, unstable endpointing, and degraded recognition on quiet speech.",
    diagnosis: ["Measure RMS during a true pause.", "Compare signal-to-noise across devices and rooms.", "Check whether AGC raises the room noise between words."],
    relatedLanguages: ["typescript", "python", "cpp"],
  }),
  lesson({
    id: "digital-sample-rate-bit-depth",
    title: "Sample rate, bit depth, and quantization",
    group: "digital-audio",
    concept: "Sample rate controls measurements per second. Bit depth controls representable amplitude steps. Metadata must describe the actual bytes, not the hoped-for format.",
    soundsLike: "A valid voice-rate signal sounds natural; badly interpreted samples can sound slow, fast, noisy, or unintelligible.",
    looksLike: "At 16 kHz, one second has 16,000 samples per channel; 16-bit mono PCM uses 32,000 bytes before framing.",
    bytesMean: "Each little-endian PCM16 sample is two bytes whose order and signed interpretation matter.",
    deepgramReceives: "Either a self-describing container or raw bytes plus correct encoding, sample-rate, and channel metadata.",
    symptom: "Wrong rate or bit-depth declarations produce timing/pitch errors or unusable recognition.",
    diagnosis: ["Inspect the container header or capture settings.", "Calculate expected bytes per second.", "Do not infer the format from a filename alone."],
    relatedLanguages: ["python", "go", "csharp", "cpp", "shell"],
  }),
  lesson({
    id: "digital-channels-endianness",
    title: "Signed samples, endianness, and channels",
    group: "digital-audio",
    concept: "Sample sign, byte order, channel count, and interleaving define how a byte sequence becomes waveforms.",
    soundsLike: "Wrong byte order sounds like harsh noise. Wrong channel interpretation can lose one speaker or distort timing.",
    looksLike: "Stereo interleaving alternates left and right samples: L0, R0, L1, R1.",
    bytesMean: "The pair 0x00 0x80 is -32768 in little-endian signed PCM16, not a quiet positive value.",
    deepgramReceives: "Channel-aligned audio whose declared channel count must match its actual layout.",
    symptom: "Noise, half-speed interpretation, missing speakers, or duplicated speaker content.",
    diagnosis: ["Inspect several known sample values as signed integers.", "Confirm mono versus interleaved multichannel.", "Verify byte order at the native-device boundary."],
    relatedLanguages: ["cpp", "go", "csharp", "python"],
  }),
  lesson({
    id: "container-versus-codec",
    title: "Container versus encoding",
    group: "containers-codecs",
    concept: "A container organizes metadata and encoded packets; a codec or PCM format defines how audio becomes bytes. WAV is commonly a container, while PCM is an encoding.",
    soundsLike: "Correctly decoded WAV, MP3, AAC, Opus, WebM, or Ogg can all carry intelligible voice at different quality and latency tradeoffs.",
    looksLike: "A container begins with headers and packet structures; raw PCM begins immediately with sample bytes.",
    bytesMean: "WebM/Opus bytes are compressed packets, not PCM16 samples and must not be labeled linear16.",
    deepgramReceives: "Containerized browser audio without raw PCM query metadata, or raw audio with explicit matching metadata.",
    symptom: "Unsupported MIME errors or a connected stream that yields no useful transcript.",
    diagnosis: ["Inspect the browser recorder MIME type.", "Separate Content-Type from encoding query parameters.", "Use a media probe such as ffmpeg/ffprobe outside this browser lab when available."],
    relatedLanguages: ["typescript", "shell", "python", "php"],
  }),
  lesson({
    id: "lossy-versus-lossless",
    title: "Lossy and lossless transport choices",
    group: "containers-codecs",
    concept: "Lossless formats preserve decoded samples; lossy codecs discard information to reduce bandwidth. Voice systems balance quality, latency, compatibility, and cost.",
    soundsLike: "Low-bitrate or repeatedly encoded speech may sound watery, metallic, or smeared.",
    looksLike: "Compressed byte size falls, but the waveform reconstructed by the decoder is no longer sample-identical.",
    bytesMean: "Compressed packet size varies with codec decisions and cannot be converted to duration using PCM bytes-per-second math.",
    deepgramReceives: "Supported compressed packets or decoded PCM; the exact supported combination must be verified for the selected API path.",
    symptom: "Domain terms and consonants degrade even though transport is reliable.",
    diagnosis: ["Record the codec and bitrate as evaluation metadata.", "Avoid repeated transcoding.", "Compare on representative audio, not a single clean clip."],
    relatedLanguages: ["shell", "typescript", "python"],
  }),
  lesson({
    id: "streaming-chunks-buffers",
    title: "Frames, chunks, and buffers",
    group: "streaming",
    concept: "Capture produces frames; applications group bytes into chunks; queues and sockets buffer them. Chunk boundaries are transport decisions, not word boundaries.",
    soundsLike: "Well-paced chunks feel immediate; oversized or bursty chunks make live output lag or arrive unevenly.",
    looksLike: "A timing trace shows regular data events near the configured interval with bounded size variation.",
    bytesMean: "Each chunk is an ordered slice of the encoded stream. Dropping or reordering chunks can corrupt dependent codecs.",
    deepgramReceives: "An ordered event stream paced close to capture time for realtime recognition.",
    symptom: "Transcript bursts, rising latency, disconnects, or memory growth.",
    diagnosis: ["Graph inter-chunk time and byte size.", "Inspect queue depth and socket bufferedAmount.", "Separate capture delay from network and recognition delay."],
    relatedLanguages: ["typescript", "python", "go", "csharp", "cpp"],
  }),
  lesson({
    id: "streaming-backpressure-jitter",
    title: "Backpressure, jitter, underruns, and overruns",
    group: "streaming",
    concept: "A producer and consumer rarely run at exactly the same rate. Backpressure and bounded queues decide whether to wait, drop, cancel, or degrade.",
    soundsLike: "Playback underruns click or pause; capture overruns lose audio; jitter produces uneven delivery.",
    looksLike: "Queue depth or WebSocket buffered bytes trend upward instead of returning to baseline.",
    bytesMean: "Unconsumed chunks remain allocated; reused buffers can change before an asynchronous send completes.",
    deepgramReceives: "Only chunks successfully delivered before cancellation or connection failure.",
    symptom: "Latency grows throughout the call or the process consumes increasing memory.",
    diagnosis: ["Measure producer rate, consumer rate, and queue depth.", "Use immutable/copy-safe buffers across async boundaries.", "Define a bounded overload policy."],
    relatedLanguages: ["go", "csharp", "cpp", "python", "typescript"],
  }),
  lesson({
    id: "capture-gain-room",
    title: "Microphone, interface, gain, and room",
    group: "capture",
    concept: "The model cannot recover information never captured cleanly. Transducer choice, distance, preamp gain, room reflections, and noise establish the input distribution.",
    soundsLike: "Healthy close speech is clear without clipping; a distant room sounds reverberant and has poor direct-to-reflected ratio.",
    looksLike: "Speech peaks remain below full scale while pauses reveal a stable, lower noise floor.",
    bytesMean: "Gain changes the numerical amplitude distribution before the application receives samples.",
    deepgramReceives: "The resulting capture, including room, interface, and device-processing artifacts.",
    symptom: "Quality varies by user device even with identical request parameters.",
    diagnosis: ["Collect device and actual track settings with consent.", "Segment evaluation by microphone and environment.", "Fix placement/gain before compensating with model parameters."],
    relatedLanguages: ["typescript", "cpp", "python"],
  }),
  lesson({
    id: "capture-browser-processing",
    title: "AGC, noise suppression, and echo cancellation",
    group: "capture",
    concept: "Browser and operating-system processing can alter level, spectrum, and timing. Echo cancellation is vital for speakerphone agents but can suppress desired overlapping speech.",
    soundsLike: "Processing may pump room noise, gate quiet words, or reduce acoustic echo from agent playback.",
    looksLike: "Levels change automatically even when hardware gain is unchanged.",
    bytesMean: "The browser delivers processed samples; constraint requests are not proof that a setting was honored.",
    deepgramReceives: "The browser track after supported capture processing.",
    symptom: "Barge-in works on headphones but fails with laptop speakers, or quiet words disappear.",
    diagnosis: ["Read MediaStreamTrack.getSettings().", "Test headphones and speaker playback separately.", "Treat browser/OS versions as evaluation segments."],
    relatedLanguages: ["typescript", "react", "html-css"],
  }),
  lesson({
    id: "agent-vad-endpointing",
    title: "VAD, endpointing, and turn state",
    group: "voice-agent",
    concept: "Voice activity detects speech-like energy; endpointing decides an utterance boundary; conversational turn models add state and confidence. They solve related but different problems.",
    soundsLike: "Short thresholds feel fast but may cut off unfinished thoughts; long thresholds feel patient but slow.",
    looksLike: "Transcript and turn events occur at different times on a shared trace.",
    bytesMean: "Audio continues to arrive while the application decides whether a pause ends the turn.",
    deepgramReceives: "A continuous stream; exact event names and controls depend on the selected verified streaming product.",
    symptom: "The agent starts too early, waits too long, or creates unnecessary downstream work.",
    diagnosis: ["Inspect audio activity, interim/final transcripts, and turn events together.", "Measure false starts separately from latency.", "Do not treat Nova transcript events as Flux turn events."],
    relatedLanguages: ["typescript", "python", "go", "csharp"],
  }),
  lesson({
    id: "agent-barge-in",
    title: "Barge-in and interruption cancellation",
    group: "voice-agent",
    concept: "Barge-in requires capture during playback, echo control, interruption detection, cancellation propagation, and discarding audio already buffered for playback.",
    soundsLike: "A responsive agent stops quickly when the user speaks instead of talking over them.",
    looksLike: "User activity is followed by cancellation events before additional synthesized audio reaches playback.",
    bytesMean: "Queued TTS bytes may already exist after cancellation; the player must clear them deliberately.",
    deepgramReceives: "User audio plus control events appropriate to the chosen architecture; the customer owns surrounding orchestration unless using a verified managed-agent capability.",
    symptom: "Agent audio continues after an interruption or its own echo triggers false interruption.",
    diagnosis: ["Trace capture, VAD/turn state, cancellation, TTS, and playback independently.", "Record buffer depth at cancellation.", "Test with speakers, headphones, and real room echo."],
    relatedLanguages: ["typescript", "go", "csharp", "cpp"],
  }),
  lesson({
    id: "analysis-rms-peak-clipping",
    title: "RMS, peak, and clipping evidence",
    group: "signal-analysis",
    concept: "RMS estimates signal energy over a window; peak finds the largest absolute sample; clipping detects samples at or near the representable limit.",
    soundsLike: "Two signals can share a peak but have different perceived level. Clipping adds harsh distortion.",
    looksLike: "RMS changes smoothly while peak follows short transients; clipping crosses a near-full-scale threshold.",
    bytesMean: "For normalized float samples, -1 to +1 represents the available range; this lab flags absolute values at or above 0.98.",
    deepgramReceives: "The waveform—not the displayed metric. Metrics are customer-side diagnostic evidence.",
    symptom: "A live call is quiet, noisy, or distorted despite a healthy WebSocket.",
    diagnosis: ["Use time-domain samples, not averaged frequency bins, for RMS and peak.", "Inspect multiple windows rather than one frame.", "Correlate audio evidence with transcript failure segments."],
    relatedLanguages: ["typescript", "python", "cpp"],
  }),
  lesson({
    id: "analysis-chunks-channels",
    title: "Chunk and channel visualization",
    group: "signal-analysis",
    concept: "A useful diagnostic display joins waveform shape, per-channel evidence, chunk timing, and byte size without retaining raw audio.",
    soundsLike: "Bursty delivery may not alter a saved recording but can make a realtime interaction feel slow.",
    looksLike: "Regular timing points cluster near the requested timeslice; outliers identify scheduler or capture stalls.",
    bytesMean: "Containerized chunk sizes vary; byte count alone is not a PCM sample count.",
    deepgramReceives: "The ordered chunks. This workbench discards each Blob after recording only timing and size.",
    symptom: "The microphone sounds fine locally but transcript updates arrive in bursts.",
    diagnosis: ["Compare requested timeslice with observed intervals.", "Check main-thread work around outliers.", "Inspect socket backpressure in the actual Live Mic module."],
    relatedLanguages: ["typescript", "react", "go", "csharp"],
  }),
];

export const AUDIO_FAILURE_LESSONS: AudioFailureLesson[] = [
  failure("clipped-signal", "Clipped signal", "clipping", "Harsh or flattened speech", "Samples repeatedly reach the representable limit.", "Consonants and vowels can lose discriminative detail.", ["Peak remains near 1.0", "Waveform has flat extrema", "Clip counter rises"], ["Reduce hardware/input gain", "Increase microphone distance if appropriate", "Capture a clean comparison fixture"]),
  failure("low-input-gain", "Low input gain", "low-gain", "Speech is quiet beside room noise", "Useful samples occupy too little of the available range.", "Recognition degrades especially on quiet words and noisy segments.", ["Low speech RMS", "Small difference between speech and pause RMS", "AGC may pump noise"], ["Improve placement", "Raise gain without clipping", "Reduce environmental noise"]),
  failure("digital-silence", "Silence", "silence", "No audible speech", "Samples are zero or remain below a practical activity threshold.", "No transcript or only empty/final events.", ["RMS and peak remain near zero", "Chunks may still arrive", "Permissions can be healthy"], ["Confirm the selected input", "Check hardware mute and routing", "Distinguish silence from transport failure"]),
  failure("noisy-capture", "Noisy audio", "noise", "Hiss, hum, room, or competing sound", "Unwanted energy overlaps the speech distribution.", "False activity and word errors increase.", ["Pause RMS is elevated", "Spectrum/noise character persists", "Quality varies by environment"], ["Improve room and placement", "Use appropriate suppression carefully", "Evaluate the real noisy segment"]),
  failure("oversized-chunks", "Long chunks", "long-chunks", "Live transcript arrives in bursts", "The application buffers too much captured data before sending.", "Recognition may be accurate but user-perceived latency rises.", ["Inter-chunk timing exceeds target", "Chunk size grows", "Socket is otherwise healthy"], ["Use a smaller supported timeslice", "Measure scheduler stalls", "Bound application queues"]),
  failure("wrong-rate-metadata", "Wrong sample-rate metadata", "wrong-sample-rate", "Audio seems too fast, slow, or unintelligible", "Declared samples per second does not match the produced raw PCM.", "Recognition is poor despite correct authentication and byte delivery.", ["Expected bytes/second disagrees with trace", "Container probe contradicts request", "Duration estimate is wrong"], ["Read actual capture format", "Correct raw-audio query metadata", "Do not add PCM metadata to self-describing browser containers"]),
  failure("stereo-as-mono", "Stereo interpreted incorrectly", "stereo-mismatch", "One speaker disappears or samples sound scrambled", "Interleaved channels are read as a single channel or declared channel count is wrong.", "Speaker and word evidence becomes unreliable.", ["Byte count implies two channels", "Alternating samples have different energy", "Channel metadata disagrees"], ["Declare the actual channel count", "Deinterleave deliberately", "Preserve channel identity when it has business value"]),
  failure("codec-container-mismatch", "Codec/container mismatch", "codec-container-mismatch", "Unsupported format or connected stream with no useful output", "Compressed container bytes are labeled as raw PCM or with the wrong MIME type.", "Decoder cannot reconstruct the intended waveform.", ["MediaRecorder MIME differs from request assumptions", "Header contains container data", "Raw PCM parameters were forced"], ["Forward the real MIME type", "Remove raw PCM parameters for supported containers", "Transcode deliberately and verify the result"]),
];

export type LanguageAudioPath = {
  language: QuestlineLanguageId;
  label: string;
  status: ExperienceStatus;
  memoryShape: string;
  ingress: string;
  chunking: string;
  transport: string;
  cleanup: string;
  codeConcept: string;
  failureRisk: string;
};

export const LANGUAGE_AUDIO_PATHS: LanguageAudioPath[] = [
  path("python", "Python", "conceptual", "bytes, bytearray, memoryview; NumPy arrays when deliberately added", "wave/file objects or an async capture library", "iterate bounded byte chunks without blocking the event loop", "HTTP body or awaited WebSocket binary send", "close files/clients and cancel producer tasks", "for chunk in iter(lambda: file.read(4096), b''): ...", "Accidentally decoding audio bytes as UTF-8 or doing blocking I/O inside asyncio"),
  path("typescript", "JavaScript / TypeScript", "executable", "Blob, ArrayBuffer, Uint8Array, and browser-managed MediaStream buffers", "getUserMedia and MediaRecorder/Web Audio callbacks", "dataavailable emits containerized chunks on a requested timeslice", "WebSocket.send(blob) after OPEN or multipart upload to a local route", "stop MediaRecorder, tracks, animation frames, nodes, sockets, and AudioContext", "event.data is a Blob; await blob.arrayBuffer() only when bytes are actually needed", "Assuming WebM/Opus Blob bytes are PCM or retaining tracks after unmount"),
  path("go", "Go", "conceptual", "[]byte slices reference backing arrays", "io.Reader, device adapter, file, or network body", "producer goroutine sends owned/copied chunks through a bounded channel", "WebSocket binary frames or net/http request body", "cancel context, close bodies/connections, stop goroutines, return pooled buffers safely", "n, err := reader.Read(buf); chunk := append([]byte(nil), buf[:n]...)", "Reusing a slice while an asynchronous writer still references it"),
  path("csharp", ".NET / C#", "conceptual", "byte[], Memory<byte>, Stream, and MemoryStream", "Stream.ReadAsync or an audio-framework callback", "await reads into bounded buffers with CancellationToken", "ClientWebSocket.SendAsync or HttpClient content", "propagate cancellation and await disposal of streams, sockets, and responses", "var count = await stream.ReadAsync(buffer, cancellationToken);", "Disposing the stream too early or blocking async work with .Result"),
  path("cpp", "C++20", "conceptual", "std::vector<std::int16_t>, std::span, byte buffers, and ring-buffer storage", "a realtime device callback writes into preallocated memory", "callback performs bounded copy/enqueue; worker owns network I/O", "customer-selected WebSocket library sends binary spans", "RAII joins threads and closes device/network resources after callbacks stop", "callback -> lock-free/bounded ring buffer -> network worker", "Allocation, locks, logging, or blocking network work on the audio callback thread"),
  path("shell", "Shell / ffmpeg", "not-installed", "stdin/stdout are byte streams even though shell variables are usually text", "ffmpeg or a file descriptor produces audio", "the process and pipe buffers determine flow", "pipe binary output to a file/client that preserves bytes", "check exit codes and terminate the entire pipeline", "ffmpeg -i input.wav -f s16le -ac 1 -ar 16000 -", "Capturing binary output in a text variable or corrupting it through text transforms"),
  path("powershell", "PowerShell", "conceptual", "[byte[]] and .NET Stream objects; the pipeline normally carries objects", "ReadAllBytes, streams, or an external process", "use byte-safe .NET APIs rather than formatting cmdlets", "Invoke-WebRequest/HttpClient or a native executable", "dispose streams/processes and inspect $LASTEXITCODE for native tools", "[byte[]]$audio = [IO.File]::ReadAllBytes($path)", "Treating PowerShell's object pipeline as a transparent binary pipe"),
  path("php", "PHP", "conceptual", "PHP strings can contain binary bytes; uploaded files live at temporary paths", "php://input, fopen, or $_FILES temporary upload", "fread bounded chunks or let cURL stream from a handle", "server-side cURL request; never browser-side key exposure", "close handles and finish before the web-server timeout removes temporary files", "curl_setopt($handle, CURLOPT_INFILE, $audioHandle);", "Double-encoding binary data or reading a temp upload after request cleanup"),
  path("sql", "SQL persistence", "conceptual", "Store metadata and references; raw audio storage is a separate retention decision", "final transcript/turn/tool events arrive from the application", "commit idempotent final events rather than every duplicate interim", "parameterized inserts and JSON/JSONB metadata", "retention deletes parent/child records consistently", "audio_uri + format metadata + transcript event tables", "Putting unbounded raw audio or duplicate word events into an unindexed JSON column"),
];

function lesson(input: Omit<AudioLesson, "status"> & { status?: ExperienceStatus }): AudioLesson {
  return { status: "conceptual", ...input };
}

function failure(
  id: string,
  title: string,
  mutation: AudioFailureLesson["mutation"],
  visibleSymptom: string,
  byteLevelCause: string,
  deepgramSymptom: string,
  evidence: string[],
  correction: string[],
): AudioFailureLesson {
  return { id, title, mutation, status: "simulated", visibleSymptom, byteLevelCause, deepgramSymptom, evidence, correction };
}

function path(
  language: QuestlineLanguageId,
  label: string,
  status: ExperienceStatus,
  memoryShape: string,
  ingress: string,
  chunking: string,
  transport: string,
  cleanup: string,
  codeConcept: string,
  failureRisk: string,
): LanguageAudioPath {
  return { language, label, status, memoryShape, ingress, chunking, transport, cleanup, codeConcept, failureRisk };
}

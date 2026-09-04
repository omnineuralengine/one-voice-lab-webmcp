# Audio Engineering for Voice AI

Audio engineering knowledge becomes applied voice engineering when it is connected to byte representation, transport, model configuration, turn behavior, and observable production symptoms.

## Signal-to-system map

```text
Acoustic pressure
  -> microphone and preamp
  -> analog-to-digital conversion
  -> typed samples in memory
  -> frames and chunks
  -> container or raw stream
  -> network transport
  -> speech model
  -> transcript and turn events
```

Each transition changes the evidence available to diagnose a problem.

## Waveform fundamentals

- Amplitude describes instantaneous signal magnitude; peak and RMS answer different questions.
- Frequency describes cycles per second; voice intelligibility depends on a range of components, not a single pitch.
- Phase matters when channels or multiple microphones combine.
- Transients are rapid changes that can be softened by compression, clipping, or excessive noise suppression.
- A low noise floor improves usable dynamic range but does not guarantee recognition quality.

The Audio Workbench should explain what a signal sounds like, what the waveform shows, how samples encode it, what reaches Deepgram, and which symptom appears.

## Digital audio

### Sample rate

Sample rate is the number of samples captured per second per channel. A declared sample rate that differs from the bytes' real rate changes time and pitch interpretation for raw audio. Containerized formats usually carry this metadata; raw PCM does not.

### Bit depth and sample representation

Bit depth constrains the number of representable amplitude steps and theoretical dynamic range. Common raw voice streams use signed integer samples, but an engineer must verify signedness, width, byte order, and normalization rather than assume them.

For signed little-endian 16-bit mono PCM:

```text
two consecutive bytes -> one int16 sample
sample count / sample rate -> duration in seconds
peak = max(abs(sample))
RMS = sqrt(mean(sample^2))
```

Convert to a wider numeric type before squaring to avoid overflow.

### Channels

Mono contains one sequence of samples. Interleaved stereo alternates left and right samples. Treating stereo bytes as mono changes the sample sequence and may mix unrelated speakers or create timing/configuration errors. `multichannel` transcription and speaker diarization solve different problems.

## Container versus encoding

A container organizes media and metadata; a codec or encoding defines how audio samples are represented or compressed.

| Example | Role | Diagnostic question |
| --- | --- | --- |
| WAV | Container, often wrapping PCM | Does the header describe the actual samples? |
| WebM or OGG | Container | Which codec is carried inside? |
| Raw PCM | No container | Were encoding, sample rate, and channels declared correctly? |
| MP3, AAC, Opus | Compressed encodings | Is this codec accepted in the selected API mode, and is the container intact? |

Never derive a Deepgram `encoding` parameter solely from a filename or a browser MIME label. Verify the actual captured media and the current [supported audio formats](https://developers.deepgram.com/docs/supported-audio-formats). For containerized streaming audio, the Deepgram Flux guide says to omit raw `encoding` and `sample_rate` parameters; for raw audio, they are required. See the [Flux quickstart](https://developers.deepgram.com/docs/flux/quickstart).

## Streaming and latency

- A frame is a codec- or device-defined unit.
- A chunk is the application unit sent or processed at one time.
- Buffering absorbs timing variation but adds latency.
- Jitter is variation in arrival timing.
- Backpressure is the mechanism that prevents a faster producer from overrunning a slower consumer.
- Underruns starve playback; overruns lose or delay capture data.

Chunk duration is more useful than byte count alone:

```text
duration = bytes / (sample_rate * channels * bytes_per_sample)
```

This formula applies to uncompressed PCM, not arbitrary compressed chunks.

## Capture and browser ownership

Browser microphone access must be initiated by the user. A safe workbench lifecycle is:

1. Request a selected media device only after an explicit action.
2. Display actual `MediaStreamTrack.getSettings()` values when the browser provides them.
3. Keep audio analysis local until the user explicitly starts an upload or live session.
4. Stop every media track, animation frame, recorder, source node, and `AudioContext` on stop or component unmount.
5. Never persist raw microphone audio or a temporary token in local storage.

Synthetic sine, silence, and noise fixtures can be generated locally. They are teaching inputs, not Deepgram measurements unless the user explicitly sends them through an existing guarded flow.

## Failure signatures

| Intentional break | Likely symptom | Evidence | First correction |
| --- | --- | --- | --- |
| Wrong raw sample rate metadata | Time/pitch distortion or poor transcript | Compute expected duration from byte count; compare capture settings | Send the real rate or resample deliberately |
| Clipped capture | Flattened peaks, harsh sound, missing detail | Repeated samples near full scale; peak meter | Reduce analog/digital gain and retest |
| Low gain | Very small RMS and poor signal-to-noise ratio | RMS, peak, noise floor, device settings | Improve gain staging before model tuning |
| Stereo treated as mono | Alternating or mixed sample sequence | Channel count and interleaving inspection | Preserve channels or downmix correctly |
| Excessively long chunks | Delayed events and uneven latency | Chunk timestamps and byte counts | Use a measured chunk-duration target |
| Silence | Connection works but no transcript | Nonzero chunk count with near-zero RMS | Validate capture source and silence handling |
| Container/codec mismatch | 400, no transcript, decode error, or immediate close | MIME, header bytes, request parameters, close event | Align actual bytes, content type, and API settings |

## Language-specific byte movement

### Python

Files and sockets carry `bytes`; text and JSON keys are `str`. Read chunks without decoding audio as UTF-8. An async sender must not perform blocking disk work inside the event loop.

### JavaScript and TypeScript

`Blob`, `ArrayBuffer`, `Uint8Array`, and Node `Buffer` are related but belong to different APIs and sometimes different runtimes. `MediaRecorder` usually produces containerized chunks. Web Audio exposes decoded numeric sample data, not the same bytes as a recorder blob.

### Go

`[]byte` references a backing array. If a producer reuses a buffer while another goroutine sends it, copy the valid range or coordinate ownership. `io.Reader` represents a stream rather than a complete file.

### .NET/C#

`byte[]` is an in-memory buffer; `Stream` is a sequential interface. Respect the number of bytes actually read. Propagate `CancellationToken` through reads, writes, and WebSocket operations.

### C++20

Use an owner such as `std::vector<std::int16_t>` or `std::vector<std::byte>` and make callback lifetime explicit. A realtime callback should not block, allocate unpredictably, or access an object that may already be destroyed. A bounded ring buffer is an architectural pattern, not automatically a correct implementation.

### Shell and PowerShell

Binary streams and text/object pipelines are not interchangeable. Avoid commands that silently decode, line-split, or serialize audio. Use an explicit file or binary-safe process pipeline and inspect exit codes.

## Turn-taking connection

VAD and endpointing consume evidence derived from the incoming signal. Noise, echo, clipping, silence thresholds, and buffer delays affect perceived turn behavior. Barge-in also requires the application to cancel reasoning, synthesis, and playback; detection alone does not stop every downstream stage.

Latency must retain provenance:

- measured: captured from timestamps;
- derived: calculated from measured inputs;
- simulated: deterministic teaching value;
- unavailable: not captured.

Never present a simulated waveform, turn event, or latency value as a live Deepgram measurement.

import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import { getLanguageTrack } from "@/lib/questline/language-tracks";
import type {
  AppliedMlLens,
  ExperienceStatus,
  QuestCodeExample,
  QuestDifficulty,
  QuestNode,
  QuestTier,
  QuestlineLanguageId,
} from "@/types/questline";

type TierBlueprint = {
  tier: QuestTier;
  title: string;
  concept: string;
  voiceValue: string;
  mistake: string;
  challenge: string;
  masteryQuestion: string;
  criteria: string[];
  api: string;
  workflow: CodeLabWorkflowId;
  audio: string;
  difficulty: QuestDifficulty;
};

const TIER_BLUEPRINTS: TierBlueprint[] = [
  {
    tier: 1,
    title: "Runtime and request foundations",
    concept: "Values have types, functions move data through explicit inputs and outputs, and an HTTP request crosses a process and trust boundary.",
    voiceValue: "Voice integrations fail when text, JSON, binary audio, configuration, and network errors are treated as interchangeable values.",
    mistake: "Copying syntax without identifying the runtime, input type, output type, or owner of the network call.",
    challenge: "Trace an audio URL from configuration through serialization to the HTTP request and identify every possible failure boundary.",
    masteryQuestion: "What executes this code, what data enters, and what resource must be closed?",
    criteria: ["Identify runtime and entry point", "Read an environment variable without printing it", "Construct and parse JSON", "Explain an HTTP status before reading the response body"],
    api: "stt-url",
    workflow: "transcribe-url",
    audio: "URL metadata versus audio bytes",
    difficulty: "foundation",
  },
  {
    tier: 2,
    title: "Deepgram API operator",
    concept: "Authentication, query parameters, headers, body bytes, response status, and response paths are separate parts of one request contract.",
    voiceValue: "A correct payload is necessary but not sufficient: the credential boundary, content type, and response correlation ID make the call safe and diagnosable.",
    mistake: "Embedding a permanent key in browser code or parsing a success-shaped payload before checking the HTTP status.",
    challenge: "Build a hosted-audio request, handle a non-2xx response, extract the transcript, and record metadata.request_id when present.",
    masteryQuestion: "Why does the API key belong in a trusted runtime while the transcript may return to the client?",
    criteria: ["Use a placeholder-backed environment variable", "Send a hosted URL or file body correctly", "Check non-2xx responses", "Extract transcript and request ID"],
    api: "stt-url",
    workflow: "transcribe-url",
    audio: "Hosted URL body versus binary file body",
    difficulty: "foundation",
  },
  {
    tier: 3,
    title: "Streaming and concurrency",
    concept: "A WebSocket is a long-lived bidirectional resource. Independent send, receive, cancellation, timeout, and cleanup paths must cooperate without blocking one another.",
    voiceValue: "Realtime speech depends on bounded chunks, event ordering, backpressure, reconnect policy, and deterministic cleanup.",
    mistake: "Sending before OPEN, blocking the receive loop, ignoring cancellation, or allowing reconnects to duplicate sessions.",
    challenge: "Draw the socket lifecycle and explain how one cancellation signal stops capture, send, receive, and downstream work.",
    masteryQuestion: "What continues running while your code awaits the next transcript event?",
    criteria: ["Explain the concurrency primitive", "Distinguish interim and final events", "Propagate cancellation", "Close the recorder/socket exactly once"],
    api: "stt-live",
    workflow: "live-mic",
    audio: "Frames, chunks, buffering, and backpressure",
    difficulty: "intermediate",
  },
  {
    tier: 4,
    title: "Audio systems",
    concept: "Audio is a timed sequence of samples represented as bytes; sample format, rate, channels, encoding, and container must describe the bytes that are actually sent.",
    voiceValue: "Misdescribed audio can look like a model-quality problem even when the failure begins before recognition.",
    mistake: "Treating WAV, PCM, Opus, and WebM as equivalent names or assuming metadata can repair mismatched bytes.",
    challenge: "Given a byte count, sample rate, channel count, and bit depth, estimate duration and identify a format mismatch.",
    masteryQuestion: "What does one sample mean in memory, and how does the receiver know how to interpret it?",
    criteria: ["Explain sample rate/bit depth/channels", "Distinguish container and codec", "Identify clipping and silence", "Choose a chunk strategy and explain its latency tradeoff"],
    api: "stt-file",
    workflow: "upload-audio",
    audio: "PCM, containers, codecs, levels, and chunk timing",
    difficulty: "intermediate",
  },
  {
    tier: 5,
    title: "Production integration",
    concept: "A production voice service combines configuration, validation, bounded retries, cancellation, observability, storage, rate limits, deployment, and human fallback.",
    voiceValue: "Customers experience the reliability of the entire path, not the isolated transcription request.",
    mistake: "Retrying every failure, storing every payload forever, or treating a provider request ID as the only observability context.",
    challenge: "Add a timeout, retry decision, redacted trace, retention rule, and human fallback to a working request.",
    masteryQuestion: "Which failures are safe to retry, and what evidence proves the retry did not duplicate business work?",
    criteria: ["Define timeout/cancellation", "Apply bounded safe retries", "Create a redacted trace", "Explain deployment and human fallback"],
    api: "auth-token",
    workflow: "temporary-token",
    audio: "End-to-end latency and observability",
    difficulty: "advanced",
  },
  {
    tier: 6,
    title: "Client impact capstone",
    concept: "Applied engineering begins with the customer outcome, maps ownership boundaries, selects the smallest verified capability, gathers evidence, and communicates tradeoffs.",
    voiceValue: "A credible solution ties code and audio behavior to evaluation criteria, failure handling, security, and measurable business value.",
    mistake: "Leading with a favorite SDK or model before understanding the client stack, source audio, risk, and success criteria.",
    challenge: "Diagnose an injected client-stack failure and export a solution brief with architecture, test plan, risks, and next questions.",
    masteryQuestion: "What would make you change this architecture after the proof of concept?",
    criteria: ["Perform stack discovery", "Choose and justify the API path", "Diagnose with evidence", "Define evaluation and rollback", "Explain the solution to a client"],
    api: "voice-agent-converse",
    workflow: "voice-agent",
    audio: "Complete capture-to-outcome system",
    difficulty: "client-impact",
  },
];

type TrackSeed = {
  language: QuestlineLanguageId;
  clientScenario: string;
  emphasis: string;
  tierTitles?: Partial<Record<QuestTier, string>>;
  status?: ExperienceStatus;
};

const TRACK_SEEDS: TrackSeed[] = [
  { language: "python", clientScenario: "A FastAPI team needs a repeatable batch and async evaluation service.", emphasis: "interpreter, virtual environment, bytes/str, asyncio, and backend evaluation", status: "executable", tierTitles: { 1: "Python runtime and HTTP foundations", 2: "Python Deepgram request operator", 3: "asyncio streaming without blocking", 4: "Python bytes and audio chunks", 5: "FastAPI evaluation service", 6: "Batch call-intelligence capstone" } },
  { language: "typescript", clientScenario: "A Next.js team needs browser audio, guarded server routes, and observable realtime behavior.", emphasis: "browser versus server runtime, event loop, types erased at runtime, WebSocket callbacks, and React boundaries", status: "executable", tierTitles: { 1: "TypeScript runtime boundaries", 2: "Next.js Deepgram request operator", 3: "Browser event-loop streaming", 4: "Blob, ArrayBuffer, and MediaRecorder", 5: "Observable Next.js voice integration", 6: "Browser voice-assistant capstone" } },
  { language: "go", clientScenario: "A Go service must handle many streaming sessions with cancellation and graceful shutdown.", emphasis: "compiled binaries, slices, goroutines, contexts, channels, and resource ownership", status: "docs-verification-required" },
  { language: "csharp", clientScenario: "An ASP.NET customer needs typed payloads, dependency injection, and propagated cancellation.", emphasis: ".NET tasks, managed memory, HttpClient, streams, dependency injection, and CancellationToken", status: "executable" },
  { language: "powershell", clientScenario: "A Windows engineer needs a diagnostic runbook for auth, files, PATH, and connectivity.", emphasis: "PowerShell objects, quoting, environment scope, Invoke-RestMethod, curl.exe, and process evidence", status: "executable" },
  { language: "shell", clientScenario: "A containerized service needs reproducible curl and ffmpeg diagnostics without confusing Bash with PowerShell.", emphasis: "processes, text and binary pipes, exit codes, signals, PATH, and shell quoting", status: "executable" },
  { language: "sql", clientScenario: "A support platform must store sessions, words, turns, tool calls, and evaluation evidence with retention.", emphasis: "declarative plans, schema design, JSON extraction, indexes, transactions, and retention", status: "conceptual" },
  { language: "cpp", clientScenario: "A native audio gateway must move int16 samples from a callback through a bounded queue without blocking.", emphasis: "native compilation, RAII, stack/heap ownership, buffers, threads, linker boundaries, and undefined behavior", status: "docs-verification-required" },
  { language: "php", clientScenario: "A PHP-FPM customer needs a safe file-upload proxy within worker and upload limits.", emphasis: "request lifecycle, cURL, temporary uploads, php.ini, environment configuration, and synchronous timeouts", status: "docs-verification-required" },
  { language: "html-css", clientScenario: "A voice UI must make microphone state, transcript updates, and errors accessible without JavaScript-only semantics.", emphasis: "semantic controls, accessible status, focus, responsive layout, and browser trust cues", status: "conceptual" },
  { language: "react", clientScenario: "A React microphone component intermittently leaks tracks and updates state from stale callbacks.", emphasis: "render purity, state, refs, effects, event handlers, stale closures, and cleanup", status: "executable" },
];

function appliedMlLens(tier: QuestTier, language: QuestlineLanguageId): AppliedMlLens {
  return {
    hypothesis: `A deliberately structured ${language} tier-${tier} implementation will make the target failure easier to reproduce and explain.`,
    inputDistribution: "Use representative languages, accents, audio formats, channel conditions, durations, and client deployment constraints.",
    modelOrConfiguration: tier < 3 ? "Hold the Deepgram request constant while learning the runtime." : "Change one verified runtime, audio, or request variable at a time.",
    expectedOutput: "A correct result plus enough sanitized evidence to explain how it was produced.",
    qualityMetric: tier === 4 ? "Segmented transcript accuracy and format-specific failure rate" : "Fixture pass rate and human-reviewed correctness",
    latencyMetric: tier >= 3 ? "Measured component and total perceived latency" : "Request duration with provenance",
    failureSegment: "Record failures by runtime, language/accent, audio condition, and integration layer rather than averaging them away.",
    testFixture: "A deterministic local fixture plus at least one representative customer-like sample.",
    productionSignal: "Error class, request/session correlation, latency, retry/handoff outcome, and task completion.",
    rollbackCondition: "Rollback when safety, correctness, or latency guardrails regress for a material segment.",
  };
}

function codeExamplesFor(language: QuestlineLanguageId, tier: QuestTier): QuestCodeExample[] {
  if (language === "python" && tier === 2) {
    return [{
      language,
      title: "Hosted URL transcription with raw REST",
      filename: "transcribe_url.py",
      runtime: "server",
      status: "executable",
      regions: { setup: [1, 3], authentication: [5, 5], request: [4, 10], parsing: [12, 13], errors: [11, 11] },
      code: `import os\nimport requests\n\nresponse = requests.post(\n    "https://api.deepgram.com/v1/listen",\n    params={"model": "nova-3", "language": "en", "smart_format": "true"},\n    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},\n    json={"url": "YOUR_AUDIO_URL"},\n    timeout=30,\n)\nresponse.raise_for_status()\ndata = response.json()\nprint(data["results"]["channels"][0]["alternatives"][0]["transcript"])`,
      notes: ["Run only in a trusted local/server environment.", "The Questline never executes this learner-facing example."],
      docs: speechDocs(),
    }];
  }
  if (language === "typescript" && tier === 2) {
    return [{
      language,
      title: "Server-only TypeScript request",
      filename: "src/server/transcribe.ts",
      runtime: "server",
      status: "executable",
      regions: { authentication: [6, 8], request: [2, 11], parsing: [14, 15], errors: [12, 12] },
      code: `const endpoint = new URL("https://api.deepgram.com/v1/listen");\nendpoint.searchParams.set("model", "nova-3");\nendpoint.searchParams.set("language", "en");\nconst response = await fetch(endpoint, {\n  method: "POST",\n  headers: {\n    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ url: "YOUR_AUDIO_URL" }),\n});\nif (!response.ok) throw new Error(\`Deepgram status \${response.status}\`);\nconst data = await response.json();\nconsole.log(data.results.channels[0].alternatives[0].transcript);`,
      notes: ["This file must remain server-only.", "Use the existing local route from browser code."],
      docs: speechDocs(),
    }];
  }
  if (language === "typescript" && tier === 3) {
    return [{
      language,
      title: "Browser resource lifecycle sketch",
      filename: "src/components/LiveSession.tsx",
      runtime: "browser",
      status: "docs-verification-required",
      regions: { authentication: [1, 3], request: [4, 4], "receive-event": [5, 7], cleanup: [8, 11] },
      code: `const grant = await fetch("/api/deepgram/token", { method: "POST" });\nconst { access_token } = await grant.json();\n// Use immediately in the verified browser WebSocket auth flow; never store or log it.\nconst socket = openVerifiedDeepgramSocket(access_token);\nsocket.addEventListener("message", (event) => {\n  const message = JSON.parse(String(event.data));\n  handleDocumentedEvent(message);\n});\nreturn () => {\n  recorderRef.current?.stop();\n  streamRef.current?.getTracks().forEach((track) => track.stop());\n  socket.close();\n};`,
      notes: ["The helper names are architectural placeholders, not invented SDK methods.", "Open the existing Live Mic implementation for the verified local flow."],
      docs: speechDocs(),
    }];
  }
  if (language === "cpp" && tier === 4) {
    return [{
      language,
      title: "Owned PCM buffer",
      filename: "src/audio_buffer.cpp",
      runtime: "native",
      status: "conceptual",
      regions: { setup: [1, 2], "send-audio": [4, 6], cleanup: [1, 6] },
      code: `#include <cstdint>\n#include <vector>\n\nvoid enqueue_pcm(std::vector<std::int16_t> samples) {\n  // Move ownership to a bounded worker queue; never block the audio callback.\n  audio_queue.try_push(std::move(samples));\n}`,
      notes: ["Queue type is intentionally unspecified.", "No Deepgram C++ SDK or WebSocket package is assumed."],
    }];
  }
  if (language === "html-css" && tier === 1) {
    return [{
      language,
      title: "Accessible microphone state",
      filename: "voice-controls.html",
      runtime: "browser",
      status: "conceptual",
      regions: { setup: [1, 4] },
      code: `<button type="button" aria-describedby="mic-help">Start microphone</button>\n<p id="mic-help">Audio is captured only after you press Start.</p>\n<p role="status" aria-live="polite">Microphone idle</p>\n<pre aria-label="Final transcript"></pre>`,
      notes: ["HTML communicates intent and state; JavaScript owns capture and cleanup."],
    }];
  }
  if (language === "react" && tier === 3) {
    return [{
      language,
      title: "Effect cleanup owns external resources",
      filename: "LiveTranscript.tsx",
      runtime: "browser",
      status: "executable",
      regions: { request: [1, 4], cleanup: [5, 9] },
      code: `useEffect(() => {\n  const socket = createSocketFromFreshInMemoryToken();\n  socket.addEventListener("message", handleMessage);\n\n  return () => {\n    socket.removeEventListener("message", handleMessage);\n    socket.close();\n    streamRef.current?.getTracks().forEach((track) => track.stop());\n  };\n}, []);`,
      notes: ["Helper creation is intentionally abstract; the lesson is ownership and cleanup.", "Never update parent state during render."],
    }];
  }
  return [];
}

function speechDocs() {
  return {
    docsUrl: "https://developers.deepgram.com/docs/speech-to-text",
    lastVerifiedAt: "2026-07-12",
    verificationStatus: "verified" as const,
    notes: "Raw REST and the existing local routes are canonical. Verify model, language, and option compatibility per request.",
  };
}

function buildTrackQuests(seed: TrackSeed): QuestNode[] {
  const track = getLanguageTrack(seed.language);
  return TIER_BLUEPRINTS.map((tier) => {
    const id = `${seed.language}-tier-${tier.tier}`;
    const previousId = tier.tier > 1 ? `${seed.language}-tier-${tier.tier - 1}` : null;
    const status = tier.tier === 6 || track.category === "bridge" ? "conceptual" : (seed.status ?? track.docsStatus);
    return {
      id,
      tier: tier.tier,
      title: seed.tierTitles?.[tier.tier] ?? `${track.label}: ${tier.title}`,
      languages: [seed.language],
      prerequisiteIds: previousId ? [previousId] : [],
      difficulty: tier.difficulty,
      status,
      firstPrinciplesConcept: `${tier.concept} In ${track.label}, emphasize ${seed.emphasis}.`,
      whyVoiceSystemsCare: tier.voiceValue,
      expectedMentalModel: `${track.runtime.executionModel} ${track.runtime.dataMovement.join(" -> ")}`,
      commonMistake: tier.mistake,
      clientScenario: seed.clientScenario,
      debuggingClue: `Inspect the ${track.label} entry point, runtime/configuration, data type at the boundary, status/event evidence, and cleanup path before changing the model.`,
      challenge: tier.challenge,
      masteryQuestion: tier.masteryQuestion,
      completionCriteria: tier.criteria,
      relatedApiOperationId: tier.api,
      relatedCodeLabWorkflowId: tier.workflow,
      relatedAudioConcept: tier.audio,
      codeExamples: codeExamplesFor(seed.language, tier.tier),
      appliedMlLens: appliedMlLens(tier.tier, seed.language),
    } satisfies QuestNode;
  });
}

export const QUEST_NODES: QuestNode[] = TRACK_SEEDS.flatMap(buildTrackQuests);

export function getQuestNode(id: string) {
  return QUEST_NODES.find((quest) => quest.id === id) ?? QUEST_NODES[0];
}

export function getQuestNodesForLanguage(language: QuestlineLanguageId) {
  return QUEST_NODES.filter((quest) => quest.languages.includes(language));
}

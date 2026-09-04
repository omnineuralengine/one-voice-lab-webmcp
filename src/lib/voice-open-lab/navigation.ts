export const VOICE_OPEN_LAB_NAVIGATION = [
  { id: "explore", label: "Explore", href: "/", description: "Start from a human goal, then choose the right capability." },
  { id: "compare", label: "Compare", href: "/providers", description: "Compare provider capabilities, readiness, and attributable evidence." },
  { id: "evaluate", label: "Evaluate", href: "/evaluate", description: "Run controlled comparisons and inspect the evidence behind a result." },
  { id: "build", label: "Build", href: "/build", description: "Open technical tools for applied voice engineering." },
  { id: "learn", label: "Learn", href: "/learn", description: "Understand events, architecture, latency, and recovery." },
] as const;

export type VoiceOpenLabAreaId = (typeof VOICE_OPEN_LAB_NAVIGATION)[number]["id"];

export function getVoiceOpenLabNavigationArea(id: VoiceOpenLabAreaId) {
  const area = VOICE_OPEN_LAB_NAVIGATION.find((item) => item.id === id);
  if (!area) throw new Error(`Missing canonical ONE navigation area: ${id}`);
  return area;
}

export const VOICE_OPEN_LAB_EXPERIENCES = [
  { id: "talk", label: "Talk", description: "Use the microphone for realtime speech-to-text.", href: "/?module=live-mic", moduleId: "live-mic", evidence: "Repository verified" },
  { id: "upload", label: "Upload", description: "Choose an approved audio file, then explicitly transcribe it.", href: "/?module=upload-audio", moduleId: "upload-audio", evidence: "Repository verified" },
  { id: "generate", label: "Generate", description: "Turn reviewed text into synthesized speech.", href: "/?module=tts", moduleId: "tts", evidence: "Repository verified" },
  { id: "agent", label: "Speech-to-speech", description: "Inspect the Deepgram provider-specific Voice Agent preview; hosted execution is unavailable.", href: "/?module=api-studio&operation=voice-agent-converse", moduleId: "api-studio", evidence: "Hosted execution unavailable" },
] as const;

export type VoiceOpenLabExperienceId = (typeof VOICE_OPEN_LAB_EXPERIENCES)[number]["id"];

export const VOICE_OPEN_LAB_BUILD_PATH = [
  { id: "understand", step: "Understand", label: "Understand the need", description: "Start with the customer goal, constraints, and a measurable definition of success.", href: "/pre-sales-studio" },
  { id: "design", step: "Design", label: "Design the system", description: "Make ownership, data flow, failure boundaries, and tradeoffs visible.", href: "/architecture-studio" },
  { id: "validate", step: "Validate", label: "Validate and hand off", description: "Turn evidence into tests, decisions, SDK diagnosis, and a practical handoff.", href: "/live-solution-studio" },
] as const;

export const VOICE_OPEN_LAB_BUILD_TOOLS = [
  { id: "api-lab", label: "API Lab", description: "Build and inspect allowlisted requests.", href: "/?module=api-studio" },
  { id: "telephony-readiness", label: "Telephony Readiness Lab", description: "Stress deterministic Twilio ConversationRelay simulations and inspect production-readiness evidence without placing a call.", href: "/telephony-readiness" },
  { id: "language-workbench", label: "Language Workbench", description: "Inspect verified language configuration before execution.", href: "/?module=language-explorer" },
  { id: "audio-signal-lab", label: "Audio Signal Lab", description: "Understand the signal before tuning the speech system.", href: "/?module=audio-signal-lab" },
] as const;

export type VoiceOpenLabBuildToolId = (typeof VOICE_OPEN_LAB_BUILD_TOOLS)[number]["id"];

export const VOICE_OPEN_LAB_LEARN_SURFACES = [
  { id: "pipeline", label: "Voice system pipeline", description: "Trace audio, speech, agent, tool, voice, and outcome stages.", href: "/?module=applied-voice-systems" },
  { id: "methodology", label: "Evaluation methodology", description: "Understand what one fixture can and cannot prove.", href: "/methodology" },
  { id: "capabilities", label: "Capability evidence", description: "Read implementation status without upgrading claims.", href: "/capabilities" },
  { id: "language", label: "Language configuration", description: "Learn explicit-language and multilingual boundaries.", href: "/?module=language-explorer" },
  { id: "privacy", label: "Privacy and redaction", description: "Separate transcript controls from raw-audio governance.", href: "/?module=redaction-lab" },
  { id: "evolution", label: "Lab evolution", description: "Inspect questions, evidence, limitations, and next experiments.", href: "/?module=lab-evolution" },
] as const;

export type VoiceOpenLabLearnSurfaceId = (typeof VOICE_OPEN_LAB_LEARN_SURFACES)[number]["id"];

export const VOICE_OPEN_LAB_HUMAN_LENS_IDS = [
  "beginner",
  "operator",
  "researcher",
  "developer",
] as const;

export type VoiceOpenLabHumanLensId = (typeof VOICE_OPEN_LAB_HUMAN_LENS_IDS)[number];

export type VoiceOpenLabHumanLens = Readonly<{
  id: VoiceOpenLabHumanLensId;
  label: string;
  primaryAreaId: VoiceOpenLabAreaId;
  supportingAreaIds: readonly VoiceOpenLabAreaId[];
  specialistBuildToolIds: readonly VoiceOpenLabBuildToolId[];
  learnSurfaceIds: readonly VoiceOpenLabLearnSurfaceId[];
}>;

export const VOICE_OPEN_LAB_HUMAN_LENSES = {
  beginner: {
    id: "beginner",
    label: "Beginner",
    primaryAreaId: "explore",
    supportingAreaIds: ["learn"],
    specialistBuildToolIds: [],
    learnSurfaceIds: [],
  },
  operator: {
    id: "operator",
    label: "Operator",
    primaryAreaId: "build",
    supportingAreaIds: [],
    specialistBuildToolIds: ["api-lab"],
    learnSurfaceIds: [],
  },
  researcher: {
    id: "researcher",
    label: "Researcher",
    primaryAreaId: "evaluate",
    supportingAreaIds: ["compare", "learn"],
    specialistBuildToolIds: [],
    learnSurfaceIds: ["methodology"],
  },
  developer: {
    id: "developer",
    label: "Developer",
    primaryAreaId: "build",
    supportingAreaIds: ["compare"],
    specialistBuildToolIds: ["api-lab"],
    learnSurfaceIds: [],
  },
} as const satisfies Readonly<Record<VoiceOpenLabHumanLensId, VoiceOpenLabHumanLens>>;

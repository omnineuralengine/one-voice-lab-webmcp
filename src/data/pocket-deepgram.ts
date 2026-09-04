import type { PocketTarget } from "@/types/pocket-deepgram";

export const POCKET_TARGETS: PocketTarget[] = [
  { id: "api-lab", label: "API Lab", shortLabel: "API", description: "Inspect endpoints, payloads, and guarded requests.", href: "/?module=api-studio", category: "build" },
  { id: "pre-sales", label: "Pre-Sales Engineering", shortLabel: "PSE", description: "Discover, design, validate, and align a technical win.", href: "/pre-sales-studio", category: "design" },
  { id: "architecture", label: "Architecture Studio", shortLabel: "ARCH", description: "Run collaborative discovery and solution architecture.", href: "/architecture-studio", category: "design" },
  { id: "live-mic", label: "Live Mic", shortLabel: "MIC", description: "Open the realtime browser transcription workflow.", href: "/?module=live-mic", category: "run" },
  { id: "tts", label: "Text to Speech", shortLabel: "TTS", description: "Open the guarded Aura speech workflow.", href: "/?module=tts", category: "run" },
  { id: "voice-agent", label: "Voice Agent", shortLabel: "AGENT", description: "Inspect the voice-agent API and orchestration path.", href: "/?module=api-studio&operation=voice-agent-converse&source=pocket", category: "build" },
  { id: "latency", label: "Flux Conversation Observatory", shortLabel: "FLUX", description: "Inspect synthetic or live Flux turn events, configuration, and locally measured timing.", href: "/flux-observatory", category: "observe" },
];

export const POCKET_TARGET_IDS = new Set(POCKET_TARGETS.map((target) => target.id));

export function getPocketTarget(id: string) {
  return POCKET_TARGETS.find((target) => target.id === id) ?? null;
}

import type { MetadataRoute } from "next";

import {
  getVoiceOpenLabNavigationArea,
  type VoiceOpenLabAreaId,
} from "@/lib/voice-open-lab/navigation";

const CANONICAL_SHORTCUT_IDS = ["compare", "evaluate", "build", "learn"] as const satisfies readonly VoiceOpenLabAreaId[];

const SHORTCUT_DESCRIPTIONS: Readonly<Record<(typeof CANONICAL_SHORTCUT_IDS)[number], string>> = {
  compare: "Inspect provider capabilities, readiness, and attributable evidence.",
  evaluate: "Inspect controlled comparisons and their evidence boundaries.",
  build: "Open applied voice engineering and integration tools.",
  learn: "Explore voice architecture, methodology, privacy, and recovery.",
};

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ONE Voice Lab",
    short_name: "ONE Voice",
    description: "An open Omni Neural Engine playground for voice, agents, simulation, and human-controlled AI systems.",
    id: "/?source=pocket-pwa",
    start_url: "/?source=one-pwa",
    scope: "/",
    display: "standalone",
    background_color: "#03060a",
    theme_color: "#03060a",
    orientation: "any",
    categories: ["business", "developer tools", "productivity"],
    icons: [
      {
        src: "/brand/one-voice-lab-logo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/one-voice-lab-logo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: CANONICAL_SHORTCUT_IDS.map((id) => {
      const area = getVoiceOpenLabNavigationArea(id);
      return {
        name: area.label,
        short_name: area.label,
        description: SHORTCUT_DESCRIPTIONS[id],
        url: area.href,
        icons: [{ src: "/brand/one-voice-lab-logo.png", sizes: "1254x1254", type: "image/png" }],
      };
    }),
  };
}

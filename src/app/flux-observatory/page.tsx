import type { Metadata } from "next";

import { FluxConversationObservatory } from "@/components/flux-observatory/FluxConversationObservatory";

export const metadata: Metadata = {
  title: "Flux Conversation Observatory | Deepgram Applied Voice Learning Lab",
  description: "Inspect Flux turn events, configuration acknowledgements, locally derived timing, and sanitized POC evidence.",
  robots: { index: false, follow: false },
};

export default function FluxObservatoryPage() {
  return <FluxConversationObservatory />;
}

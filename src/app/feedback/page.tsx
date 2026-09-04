import type { Metadata } from "next";

import { FeedbackPanel } from "@/components/feedback/FeedbackPanel";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const metadata: Metadata = createPublicMetadata({
  title: "Feedback",
  description: "Tell ONE Voice Lab what helped, what did not, and which voice AI learning experience should improve next.",
  path: "/feedback",
});

export default function FeedbackPage() {
  return (
    <main className="voice-open-route-shell min-h-screen pb-28">
      <VoiceOpenLabNav />
      <header className="voice-open-route-hero">
        <p>ONE learning loop</p>
        <h1>Shape the Lab</h1>
        <span>One tap, one note, or one short dictated thought can help the next human understand voice AI faster.</span>
        <div><strong>Yay or nay</strong><strong>Text or speech</strong><strong>No raw audio stored</strong></div>
      </header>
      <FeedbackPanel />
    </main>
  );
}

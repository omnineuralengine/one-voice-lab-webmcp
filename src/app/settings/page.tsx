import type { Metadata } from "next";

import { OneSettings } from "@/components/one/OneSettings";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const metadata: Metadata = createPublicMetadata({
  title: "ONE Account and Preferences",
  description: "Understand guest and account state, choose information depth, customize ONE locally, and manage bounded owned preferences.",
  path: "/settings",
});

export default function SettingsPage() {
  return <main className="voice-open-route-shell one-settings-page"><VoiceOpenLabNav /><header className="voice-open-route-hero"><p>Account · human-controlled</p><h1>Account and preferences</h1><span>Understand what belongs to this device, what belongs to your account, and how much detail ONE shows—without turning identity into an admission ticket.</span><div><strong>Guest-first</strong><strong>Local by default</strong><strong>Cloud sync is explicit</strong></div></header><OneSettings /></main>;
}

import type { Metadata } from "next";
import Link from "next/link";

import { DiscoveryNav } from "@/components/discovery/DiscoveryNav";
import { ModuleHero, ModulePageShell, ModulePanel } from "@/components/one/ModulePrimitives";
import { FishAudioApiStudio } from "@/components/providers/FishAudioApiStudio";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { getProviderPlatformProjection } from "@/lib/providers/platform-service";
import { readPublicProviderOperationalPolicies } from "@/lib/providers/policy-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPublicMetadata({
  title: "Fish Audio API Studio",
  description: "A bounded, explicit-action Fish Audio voice catalog, Text to Speech, and beta prerecorded Speech to Text prototype in the independent ONE Voice Lab.",
  path: "/providers/fish-audio/api-studio",
});

export default async function FishAudioApiStudioPage() {
  const policies = await readPublicProviderOperationalPolicies();
  const provider = getProviderPlatformProjection("fish-audio", { policies });
  const configured = provider?.credential.state === "configured-not-runtime-verified";
  const executionEnabled = provider?.readiness.state === "live-enabled";

  return (
    <ModulePageShell className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <VoiceOpenLabNav />
        <DiscoveryNav />
        <ModuleHero
          eyebrow="Fish Audio · Contract tests passed · community-built lab"
          title="Fish Audio API Studio"
          outcome="Inspect normalized public voice-model metadata, then deliberately run bounded Text to Speech or beta prerecorded Speech to Text requests without exposing a permanent API key to the browser."
          actions={<Link className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/providers/fish-audio">Read Fish Audio evidence profile</Link>}
        />
        <ModulePanel title="Converged safety boundary" description="This is an independent ONE Voice Lab integration, not an official Fish Audio product, benchmark, endorsement, or production-readiness claim.">
          <p className="text-sm leading-6 text-slate-300">Deterministic fixtures verify the canonical adapters and public-only normalization boundary. Live execution stays disabled unless current server policy, cost admission, configuration, and health state all permit it; no live Fish request was used to verify this convergence.</p>
        </ModulePanel>
        <FishAudioApiStudio configured={configured} executionEnabled={executionEnabled} />
      </div>
    </ModulePageShell>
  );
}

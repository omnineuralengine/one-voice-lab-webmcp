import type { Metadata } from "next";

import { ParticipantWorkspace } from "@/components/architecture-studio/ParticipantWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join Voice Architecture Studio", robots: { index: false, follow: false } };

export default async function ArchitectureStudioParticipantPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ParticipantWorkspace code={code.toUpperCase()} />;
}

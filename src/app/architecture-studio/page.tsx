import type { Metadata } from "next";

import { StudioLanding } from "@/components/architecture-studio/StudioLanding";
import { studioBackendMode } from "@/lib/architecture-studio/session-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deepgram Voice Architecture Studio",
  description: "A simulated, collaborative CCaaS solution-discovery workshop inside ONE Voice Lab.",
  robots: { index: false, follow: false },
};

export default function ArchitectureStudioPage() {
  return <StudioLanding configuredMode={studioBackendMode()} />;
}

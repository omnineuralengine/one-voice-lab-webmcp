import type { Metadata } from "next";

import { PreSalesStudio } from "@/components/pre-sales-studio/PreSalesStudio";
import { isOpenLabMode } from "@/lib/open-lab";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deepgram Pre-Sales Solution Studio",
  description: "From First Question to Technical Win — a public-story-inspired, interactive pre-sales workshop.",
};

export default function PreSalesStudioPage() {
  return <PreSalesStudio liveApiAvailable={Boolean(process.env.DEEPGRAM_API_KEY?.trim())} openLabMode={isOpenLabMode()} />;
}

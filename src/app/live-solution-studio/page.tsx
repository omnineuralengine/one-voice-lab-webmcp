import type { Metadata } from "next";
import { connection } from "next/server";
import { LiveSolutionStudio } from "@/components/live-solution-studio/LiveSolutionStudio";

export const metadata: Metadata = { title: "Live Solution Studio | ONE Voice Lab", description: "Turn a live technical question into an evidence-aware voice solution brief with provider-specific Deepgram evidence kept intact.", robots: { index: false, follow: false } };
export default async function LiveSolutionStudioPage() {
  await connection();
  return <LiveSolutionStudio />;
}

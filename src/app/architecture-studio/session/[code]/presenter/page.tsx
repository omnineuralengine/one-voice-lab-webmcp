import type { Metadata } from "next";

import { PresenterWorkspace } from "@/components/architecture-studio/PresenterWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Presenter · Voice Architecture Studio", robots: { index: false, follow: false } };

export default async function ArchitectureStudioPresenterPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PresenterWorkspace code={code.toUpperCase()} />;
}

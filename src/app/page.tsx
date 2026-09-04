import { DeepgramControlRoom } from "@/components/deepgram-control-room";
import { CodeLabLaunchExpiryNotice } from "@/components/CodeLabLaunchExpiryNotice";
import { OneHome } from "@/components/one/OneHome";
import { CodeLabLaunchProvider } from "@/context/code-lab-launch-context";
import { LiveObservatoryProvider } from "@/context/live-observatory-context";
import { isOpenLabDeepgramEnabled, isOpenLabMode, shouldUseHostedReviewMode } from "@/lib/open-lab";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ module?: string; operation?: string; workflow?: string; source?: string; command?: string }> }) {
  const initialKeyDetected = Boolean(process.env.DEEPGRAM_API_KEY?.trim());
  const openLabMode = isOpenLabMode();
  const openLabDeepgramEnabled = isOpenLabDeepgramEnabled();
  const hostedReviewMode = shouldUseHostedReviewMode();
  const shellStartedAt = new Date().toISOString();
  const { module, operation, workflow, source, command } = await searchParams;
  const legacyLabRequested = Boolean(module || operation || workflow || command === "1");

  if (!legacyLabRequested) return <OneHome />;

  return (
    <CodeLabLaunchProvider>
      <CodeLabLaunchExpiryNotice />
      <LiveObservatoryProvider>
        <DeepgramControlRoom key={`${module ?? "overview"}:${operation ?? "default"}:${workflow ?? "default"}:${source ?? "direct"}`} initialKeyDetected={initialKeyDetected} hostedReviewMode={hostedReviewMode} openLabMode={openLabMode} openLabDeepgramEnabled={openLabDeepgramEnabled} shellStartedAt={shellStartedAt} initialModule={module} initialApiOperation={operation} initialCodeWorkflow={workflow} initialHandoffSource={source} initialCommand={command === "1"} />
      </LiveObservatoryProvider>
    </CodeLabLaunchProvider>
  );
}

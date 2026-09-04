"use client";

import { AiReasoningPanel } from "@/components/ai/AiReasoningPanel";
import { buildArchitectureAiContext } from "@/lib/ai/context";
import type { PublicStudioSession } from "@/types/architecture-studio";

export function ArchitectureAiLayer({ session, onAcceptProposal }: { session: PublicStudioSession; onAcceptProposal: (proposal: string) => void }) {
  const context = buildArchitectureAiContext(session);
  return <div className="grid gap-4 xl:grid-cols-2"><AiReasoningPanel title="Red Team This Architecture" description="A deep, structured adversarial review across engineering, security, SRE, networking/media, voice UX, accessibility, cost, privacy, and recovery. It does not edit the topology." feature="architecture-red-team" reasoningClass="DEEP" context={context} prompts={["Find the strongest aspect, weakest assumption, hidden failure, and production blocker.", "Focus on media, networking, reconnect, and observability failures.", "Review security, privacy, accessibility, cost, and ownership boundaries."]} onAcceptProposal={onAcceptProposal}/><AiReasoningPanel title="Generate POC" description="Turn the current deterministic architecture and open gaps into a proposed evaluation plan. Numeric targets are never treated as approved when they are unknown." feature="poc-generator" reasoningClass="DEEP" context={context} prompts={["Generate a representative POC for this architecture.", "Design the production-readiness evidence plan."]} onAcceptProposal={onAcceptProposal}/></div>;
}

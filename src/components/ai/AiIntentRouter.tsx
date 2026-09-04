"use client";

import { AiReasoningPanel } from "@/components/ai/AiReasoningPanel";

export function AiIntentRouter() {
  return <AiReasoningPanel title="What are you trying to build or understand?" description="Describe a voice-system problem. The AI proposes a path through existing Lab modules; direct navigation always remains available." feature="intent-router" reasoningClass="FAST" context={{ moduleId: "overview", moduleName: "Lab overview", summary: "Public entry point to ONE Voice Lab by Omni Neural Engine.", facts: ["The Lab has deterministic Audio Signal, Architecture, Live Solution, API, evaluation, and deliverable workflows."], assumptions: [], openQuestions: [], architecture: [], risks: [], evidence: [{ id: "repo-capability-registry", label: "Lab capability registry", type: "repository", summary: "The repository registry defines currently implemented Lab modules." }] }} prompts={["I have Twilio audio and my agent interrupts callers too early.", "I need to diagnose latency in a streaming voice agent.", "Help me turn a customer problem into a defensible POC."]}/>;
}

import Link from "next/link";

import { CodeLabLaunchExpiryNotice } from "@/components/CodeLabLaunchExpiryNotice";
import { OneConciergeHomeEntry } from "@/components/concierge/OneConciergeHomeEntry";
import {
  AdaptiveSection,
  ExplainThis,
  HumanDepthControl,
  TechnicalDetails,
} from "@/components/one/AdaptiveInterface";
import { ModuleHero, ModulePageShell, ModulePanel } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { CodeLabLaunchProvider } from "@/context/code-lab-launch-context";
import { VOICE_OPEN_LAB_EXPERIENCES } from "@/lib/voice-open-lab/navigation";

type HomeCapability = {
  title: string;
  description: string;
  href: string;
  action: string;
  context?: string;
  availability?: string;
  testId?: string;
};

function homeExperience(id: (typeof VOICE_OPEN_LAB_EXPERIENCES)[number]["id"]) {
  const experience = VOICE_OPEN_LAB_EXPERIENCES.find((candidate) => candidate.id === id);
  if (!experience) throw new Error(`The canonical ${id} experience is missing.`);
  return experience;
}

const uploadExperience = homeExperience("upload");
const generateExperience = homeExperience("generate");
const speechToSpeechExperience = homeExperience("agent");

const CAPABILITIES: readonly HomeCapability[] = [
  {
    title: "Turn speech into text",
    description: "Choose a trusted audio file and review a transcript. Nothing is sent until you act.",
    href: uploadExperience.href,
    action: "Open speech-to-text workspace",
    context: "Current interactive workspace: Deepgram. Other providers can be inspected in Provider Hub.",
  },
  {
    title: "Create speech from text",
    description: "Write or review text, choose a voice, and inspect the provider-specific protected controls.",
    href: generateExperience.href,
    action: "Open text-to-speech workspace",
    context: "Current interactive workspace: Deepgram. Other providers can be inspected in Provider Hub.",
  },
  {
    title: "Speech-to-speech",
    description: "Inspect the Deepgram Voice Agent configuration and event contract without starting a hosted session.",
    href: speechToSpeechExperience.href,
    action: "Inspect provider-specific preview",
    context: "Provider-specific preview · Deepgram",
    availability: "Hosted execution unavailable",
    testId: "speech-to-speech-capability",
  },
  {
    title: "Compare providers",
    description: "Explore capabilities and readiness without treating catalog membership as quality evidence.",
    href: "/providers",
    action: "Explore providers",
  },
  {
    title: "Evaluate voice outputs",
    description: "Compare deterministic fixture voices, listen blind, and inspect how each result was measured.",
    href: "/evaluate",
    action: "Open Evaluate",
  },
];

export function OneHome() {
  return (
    <CodeLabLaunchProvider>
      <CodeLabLaunchExpiryNotice />
      <ModulePageShell className="one-human-home">
      <div className="one-human-home__inner">
        <VoiceOpenLabNav current="explore" />
        <ModuleHero
          className="one-human-home__hero"
          eyebrow="Omni Neural Engine · independent"
          title="What would you like to explore?"
          outcome="Use voice and evaluation capabilities without learning a provider's API first. Go deeper only when the detail helps."
        />

        <OneConciergeHomeEntry />

        <HumanDepthControl />

        <section aria-labelledby="one-capabilities-title" className="one-capability-entry">
          <div className="one-section-heading">
            <div><p>Prefer to choose directly?</p><h2 id="one-capabilities-title">Open a capability yourself</h2></div>
            <span>Every path remains directly available. No provider call runs on page load.</span>
          </div>
          <div className="one-capability-grid">
            {CAPABILITIES.map((capability) => (
              <Link data-testid={capability.testId} href={capability.href} key={capability.href}>
                <span>{capability.title}</span>
                <p>{capability.description}</p>
                {capability.context ? <small className="mt-2 block text-xs font-semibold text-violet-100">{capability.context}</small> : null}
                {capability.availability ? <small className="mt-1 block text-xs font-semibold text-amber-200">{capability.availability}</small> : null}
                <strong>{capability.action}<span aria-hidden="true"> →</span></strong>
              </Link>
            ))}
          </div>
        </section>

        <ExplainThis summary="How ONE keeps providers and evidence separate">
          <p>Providers supply capabilities. ONE keeps the workflow, policy, measurements, and explanation coherent across them.</p>
          <p>A provider name remains visible whenever it matters for provenance. Availability is not treated as quality, and one fixture is not treated as a universal ranking.</p>
        </ExplainThis>

        <AdaptiveSection
          description="Safe simulations, solution-building paths, and contextual learning."
          minimum="detailed"
          summary="Explore more ways to learn and build"
        >
          <div className="one-human-home__path-grid">
            <Link href="/simulation-lab"><strong>Simulate a voice system</strong><span>Replay bounded failure conditions with zero provider spend.</span></Link>
            <Link href="/build"><strong>Build a solution</strong><span>Move from a human need to architecture, validation, and handoff.</span></Link>
            <Link href="/learn"><strong>Learn in context</strong><span>Understand voice concepts close to the moment they become useful.</span></Link>
          </div>
        </AdaptiveSection>

        <TechnicalDetails summary="Open technical and operational tools">
          <ModulePanel description="These remain part of ONE without defining its first impression." title="Inspect the underlying system">
            <div className="one-human-home__technical-links">
              <Link href="/?module=api-studio">API Lab</Link>
              <Link href="/methodology">Evaluation methodology</Link>
              <Link href="/evals">Public evidence registry</Link>
              <Link href="/for-agents">Machine-readable discovery</Link>
              <Link data-testid="open-lab-keyboard-shortcut-card" href="/">Keyboard and keyboard shortcuts controls</Link>
            </div>
          </ModulePanel>
        </TechnicalDetails>
      </div>
      </ModulePageShell>
    </CodeLabLaunchProvider>
  );
}

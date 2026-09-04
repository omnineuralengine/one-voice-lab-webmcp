"use client";

import { useState } from "react";

import {
  FieldLabel,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  downloadTextFile,
  inputClassName,
  primaryButtonClassName,
  slugify,
  textareaClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import {
  serializeContextPackJson,
  serializeContextPackMarkdown,
} from "@/lib/applied-voice/academy";
import { CLIENT_SCENARIOS } from "@/lib/applied-voice/scenarios";
import type {
  AudioSource,
  ClientContextPack,
  ClientDiscoveryInput,
  ConversationProfile,
  WorkflowRequirement,
} from "@/types/applied-voice";

type DiscoveryGroup = "business" | "audio" | "architecture" | "reliability";

const AUDIO_OPTIONS: AudioSource[] = ["browser-microphone", "mobile-application", "uploaded-recordings", "contact-center-recording", "pstn-phone-call", "sip-rtp-media", "webrtc", "live-media-stream", "unknown"];
const PROFILE_OPTIONS: ConversationProfile[] = ["monologue", "two-person-call", "multi-speaker-meeting", "interactive-voice-agent", "high-interruption", "noisy", "domain-vocabulary", "multilingual-code-switching"];
const WORKFLOW_OPTIONS: WorkflowRequirement[] = ["transcript", "speaker-labels", "summary", "intent", "sentiment", "topics", "searchable-words-timestamps", "agent-response", "function-tool-call", "human-escalation", "audit-record", "voice-output", "outbound-transactional-message"];

export function ClientDiscovery({
  input,
  contextPack,
  persistenceMessage,
  onInputChange,
  onLoadScenario,
  onGenerate,
}: {
  input: ClientDiscoveryInput;
  contextPack: ClientContextPack | null;
  persistenceMessage: string;
  onInputChange: (input: ClientDiscoveryInput) => void;
  onLoadScenario: (scenarioId: string) => void;
  onGenerate: () => void;
}) {
  const [group, setGroup] = useState<DiscoveryGroup>("business");

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(440px,1.05fr)_minmax(330px,.95fr)] gap-3 p-3">
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Applied discovery simulator"
          title="Turn client reality into an explicit system hypothesis"
          detail="Preset details are fictional examples. Recommendations remain explainable, conditional, and locally generated."
          actions={<ProvenanceBadge value="working" />}
        />
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-white/10 bg-black/15 p-3">
          <FieldLabel label="Client context preset">
            <select value={input.scenarioId ?? ""} onChange={(event) => onLoadScenario(event.target.value)} className={`${inputClassName} min-w-56`}>
              <option value="">Custom discovery draft</option>
              {CLIENT_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
            </select>
          </FieldLabel>
          <p className={`ml-auto max-w-60 pb-2 text-right text-[9px] leading-3.5 ${persistenceMessage.includes("not saved") ? "text-amber-200" : "text-slate-600"}`}>{persistenceMessage}</p>
        </div>
        <div className="grid shrink-0 grid-cols-4 gap-1 border-b border-white/10 p-1.5">
          {(["business", "audio", "architecture", "reliability"] as DiscoveryGroup[]).map((item) => (
            <button key={item} type="button" onClick={() => setGroup(item)} className={`h-8 rounded text-[9px] font-semibold capitalize focus-visible:outline-2 focus-visible:outline-cyan-200 ${group === item ? "bg-cyan-200 text-slate-950" : "text-slate-500 hover:bg-white/[0.04] hover:text-white"}`}>{item}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {group === "business" ? <BusinessFields value={input} onChange={onInputChange} /> : null}
          {group === "audio" ? <AudioFields value={input} onChange={onInputChange} /> : null}
          {group === "architecture" ? <ArchitectureFields value={input} onChange={onInputChange} /> : null}
          {group === "reliability" ? <ReliabilityFields value={input} onChange={onInputChange} /> : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#071018] p-3">
          <p className="max-w-lg text-[9px] leading-3.5 text-slate-600">The pack is a discovery hypothesis, not a hidden recommendation engine. Every recommendation includes its assumption, alternative, and validation step.</p>
          <button type="button" onClick={onGenerate} className={primaryButtonClassName}>Generate Client Context Pack</button>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Explainable output"
          title={contextPack ? "Client Context Pack" : "No context pack yet"}
          detail={contextPack ? `Derived locally · ${contextPack.recommendations.length} explicit recommendations` : "Complete the discovery fields, then generate a pack."}
          actions={contextPack ? (
            <>
              <button type="button" onClick={() => downloadTextFile(`${slugify(input.industry)}-context-pack.json`, serializeContextPackJson(contextPack), "application/json")} className={buttonClassName}>JSON</button>
              <button type="button" onClick={() => downloadTextFile(`${slugify(input.industry)}-context-pack.md`, serializeContextPackMarkdown(contextPack), "text/markdown")} className={buttonClassName}>Markdown</button>
            </>
          ) : null}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {contextPack ? <ContextPackView pack={contextPack} /> : <div className="grid h-full place-items-center text-center"><div><p className="text-sm font-semibold text-slate-300">Discovery evidence comes first</p><p className="mt-2 max-w-sm text-[10px] leading-4 text-slate-600">Start with the user journey, audio path, workflow, and unacceptable failures. Product selection follows those constraints.</p></div></div>}
        </div>
      </Panel>
    </div>
  );
}

function BusinessFields({ value, onChange }: FieldProps) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <TextField label="Industry" value={value.industry} onChange={(industry) => onChange({ ...value, industry })} />
      <TextField label="Human users involved" value={value.humanUsers.join(", ")} onChange={(text) => onChange({ ...value, humanUsers: splitList(text) })} />
      <AreaField label="User journey" value={value.userJourney} onChange={(userJourney) => onChange({ ...value, userJourney })} wide />
      <AreaField label="Primary business problem" value={value.primaryBusinessProblem} onChange={(primaryBusinessProblem) => onChange({ ...value, primaryBusinessProblem })} wide />
      <AreaField label="Current workflow" value={value.currentWorkflow} onChange={(currentWorkflow) => onChange({ ...value, currentWorkflow })} />
      <AreaField label="Desired outcome" value={value.desiredOutcome} onChange={(desiredOutcome) => onChange({ ...value, desiredOutcome })} />
      <FieldLabel label="Audience">
        <select value={value.audience} onChange={(event) => onChange({ ...value, audience: event.target.value as ClientDiscoveryInput["audience"] })} className={inputClassName}><option value="customer-facing">Customer-facing</option><option value="internal">Internal</option><option value="both">Both</option></select>
      </FieldLabel>
      <FieldLabel label="Direction">
        <select value={value.direction} onChange={(event) => onChange({ ...value, direction: event.target.value as ClientDiscoveryInput["direction"] })} className={inputClassName}><option value="inbound">Inbound</option><option value="outbound">Outbound</option><option value="both">Both</option></select>
      </FieldLabel>
    </div>
  );
}

function AudioFields({ value, onChange }: FieldProps) {
  return (
    <div className="space-y-4">
      <ToggleGrid label="Audio source" options={AUDIO_OPTIONS} selected={value.audioSources} onToggle={(item) => onChange({ ...value, audioSources: toggleItem(value.audioSources, item) })} />
      <ToggleGrid label="Conversation profile" options={PROFILE_OPTIONS} selected={value.conversationProfiles} onToggle={(item) => onChange({ ...value, conversationProfiles: toggleItem(value.conversationProfiles, item) })} />
      <div className="grid gap-3 xl:grid-cols-2">
        <FieldLabel label="Batch or realtime"><select value={value.processing} onChange={(event) => onChange({ ...value, processing: event.target.value as ClientDiscoveryInput["processing"] })} className={inputClassName}><option value="batch">Batch</option><option value="realtime">Realtime</option><option value="both">Both</option><option value="unknown">Unknown</option></select></FieldLabel>
        <TextField label="Expected concurrency" value={value.expectedConcurrency} onChange={(expectedConcurrency) => onChange({ ...value, expectedConcurrency })} />
        <TextField label="Typical audio duration" value={value.typicalAudioDuration} onChange={(typicalAudioDuration) => onChange({ ...value, typicalAudioDuration })} />
        <TextField label="Audio format if known" value={value.audioFormat} onChange={(audioFormat) => onChange({ ...value, audioFormat })} />
        <TextField label="Languages and accents" value={value.languagesAndAccents.join(", ")} onChange={(text) => onChange({ ...value, languagesAndAccents: splitList(text) })} />
        <TextField label="Required response latency" value={value.requiredResponseLatency} onChange={(requiredResponseLatency) => onChange({ ...value, requiredResponseLatency })} />
      </div>
    </div>
  );
}

function ArchitectureFields({ value, onChange }: FieldProps) {
  return (
    <div className="space-y-4">
      <ToggleGrid label="Business workflow requirements" options={WORKFLOW_OPTIONS} selected={value.workflowRequirements} onToggle={(item) => onChange({ ...value, workflowRequirements: toggleItem(value.workflowRequirements, item) })} />
      <div className="grid gap-3 xl:grid-cols-2">
        <TextField label="Data retention" value={value.dataRetention} onChange={(dataRetention) => onChange({ ...value, dataRetention })} />
        <TextField label="Region / data residency" value={value.regionDataResidency} onChange={(regionDataResidency) => onChange({ ...value, regionDataResidency })} />
        <FieldLabel label="Self-hosted requirement"><select value={value.selfHostedRequired === null ? "unknown" : String(value.selfHostedRequired)} onChange={(event) => onChange({ ...value, selfHostedRequired: event.target.value === "unknown" ? null : event.target.value === "true" })} className={inputClassName}><option value="unknown">Unknown / discover</option><option value="false">No</option><option value="true">Yes</option></select></FieldLabel>
        <TextField label="Existing cloud environment" value={value.cloudEnvironment} onChange={(cloudEnvironment) => onChange({ ...value, cloudEnvironment })} />
        <TextField label="Application stack" value={value.applicationStack} onChange={(applicationStack) => onChange({ ...value, applicationStack })} />
        <TextField label="Telephony / contact-center provider" value={value.telephonyProvider} onChange={(telephonyProvider) => onChange({ ...value, telephonyProvider })} />
        <div className="xl:col-span-2"><TextField label="Downstream systems" value={value.downstreamSystems.join(", ")} onChange={(text) => onChange({ ...value, downstreamSystems: splitList(text) })} /></div>
      </div>
    </div>
  );
}

function ReliabilityFields({ value, onChange }: FieldProps) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <AreaField label="If transcription fails" value={value.transcriptionFailureBehavior} onChange={(transcriptionFailureBehavior) => onChange({ ...value, transcriptionFailureBehavior })} />
      <AreaField label="If a function call fails" value={value.functionFailureBehavior} onChange={(functionFailureBehavior) => onChange({ ...value, functionFailureBehavior })} />
      <AreaField label="If the agent is uncertain" value={value.uncertaintyBehavior} onChange={(uncertaintyBehavior) => onChange({ ...value, uncertaintyBehavior })} />
      <AreaField label="What must never happen" value={value.mustNeverHappen.join("\n")} onChange={(text) => onChange({ ...value, mustNeverHappen: splitLines(text) })} />
      <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] text-slate-300"><input type="checkbox" checked={value.humanHandoffRequired} onChange={(event) => onChange({ ...value, humanHandoffRequired: event.target.checked })} className="accent-cyan-300" />Human handoff is required</label>
      <AreaField label="Additional discovery notes" value={value.notes ?? ""} onChange={(notes) => onChange({ ...value, notes })} />
    </div>
  );
}

function ContextPackView({ pack }: { pack: ClientContextPack }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.045] p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200/65">Problem statement</p><p className="mt-2 text-xs leading-5 text-slate-300">{pack.problemStatement}</p></div>
      <PackList title="Recommended Deepgram products" items={pack.recommendedProducts} />
      <PackList title="Model family" items={pack.recommendedModelFamily} />
      <PackList title="Transport + request path" items={[...pack.proposedTransport, ...pack.proposedRequestPath]} mono />
      <div>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why these recommendations</p>
        <div className="space-y-2">
          {pack.recommendations.map((recommendation) => (
            <article key={recommendation.id} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2"><p className="text-[11px] font-semibold text-white">{recommendation.recommendation}</p><ProvenanceBadge value={recommendation.provenance} /></div>
              <dl className="mt-2 grid gap-2 text-[10px] leading-4 xl:grid-cols-2"><Explain label="Why this fits" value={recommendation.why} /><Explain label="Assumption" value={recommendation.assumption} /><Explain label="Alternative" value={recommendation.alternative} /><Explain label="Validate" value={recommendation.validation} /></dl>
            </article>
          ))}
        </div>
      </div>
      <PackList title="Required integrations" items={pack.requiredIntegrations} />
      <PackList title="Security model" items={pack.securityModel} />
      <PackList title="Risks" items={pack.risks} tone="amber" />
      <PackList title="Unanswered questions" items={pack.unansweredQuestions} tone="violet" />
      <PackList title="Suggested POC" items={pack.suggestedProofOfConcept} />
      <PackList title="Success metrics" items={pack.successMetrics} />
      <PackList title="Production-readiness gaps" items={pack.productionReadinessGaps} tone="amber" />
    </div>
  );
}

type FieldProps = { value: ClientDiscoveryInput; onChange: (input: ClientDiscoveryInput) => void };

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <FieldLabel label={label}><input value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} /></FieldLabel>;
}

function AreaField({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return <div className={wide ? "xl:col-span-2" : ""}><FieldLabel label={label}><textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} className={textareaClassName} /></FieldLabel></div>;
}

function ToggleGrid<T extends string>({ label, options, selected, onToggle }: { label: string; options: T[]; selected: T[]; onToggle: (item: T) => void }) {
  return <fieldset><legend className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</legend><div className="flex flex-wrap gap-1.5">{options.map((option) => <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => onToggle(option)} className={`rounded-md border px-2 py-1.5 text-[9px] font-semibold transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${selected.includes(option) ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.025] text-slate-500 hover:text-white"}`}>{humanize(option)}</button>)}</div></fieldset>;
}

function PackList({ title, items, mono = false, tone = "default" }: { title: string; items: string[]; mono?: boolean; tone?: "default" | "amber" | "violet" }) {
  const border = tone === "amber" ? "border-amber-300/15" : tone === "violet" ? "border-violet-300/15" : "border-white/[0.08]";
  return <div className={`rounded-lg border bg-black/15 p-3 ${border}`}><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p><ul className={`mt-2 space-y-1.5 text-[10px] leading-4 text-slate-400 ${mono ? "font-mono" : ""}`}>{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-cyan-300/60" /><span>{item}</span></li>)}</ul></div>;
}

function Explain({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-semibold text-slate-500">{label}</dt><dd className="mt-0.5 text-slate-400">{value}</dd></div>;
}

function toggleItem<T>(items: T[], item: T) { return items.includes(item) ? items.filter((value) => value !== item) : [...items, item]; }
function splitList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function splitLines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
function humanize(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

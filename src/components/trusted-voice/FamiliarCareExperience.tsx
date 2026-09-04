"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_FAMILIAR_CARE_OPT_OUT,
  DEFAULT_FAMILIAR_CARE_SCENARIO,
  EMPTY_FAMILIAR_CARE_CONSENT,
  FAMILIAR_CARE_DISCLOSURE_OPTIONS,
  FAMILIAR_CARE_FALLBACK_OPTIONS,
  FAMILIAR_CARE_SCENARIOS,
  FAMILIAR_CARE_SENSITIVE_POLICY_OPTIONS,
  analyzeFamiliarCareText,
  buildFamiliarCareDeliveryPreview,
  familiarCareConsentReady,
  sanitizeFamiliarCareRequest,
  validateFamiliarCareRequest,
  type FamiliarCareConsent,
  type FamiliarCareDisclosureStyle,
  type FamiliarCareFallbackChannel,
  type FamiliarCareRequestPolicy,
  type FamiliarCareScenario,
  type FamiliarCareSensitiveDetailPolicy,
} from "@/lib/familiar-care";
import { buildInspectorRecord, createTimelineEvent, type ApiDebugEnvelope, type InspectorRecord } from "@/lib/inspection";
import { AURA_VOICE_GROUPS, getDefaultVoiceForLanguage, getVoiceOption, type TtsVoiceLanguageCode } from "@/lib/tts-voices";
import type { LabResult, TtsResponseData, TtsVoiceModel } from "@/lib/types";

type StatusState = { status: "idle" | "loading" | "success" | "error"; message: string };

export function FamiliarCareExperience({
  hostedReviewMode,
  onInspectorChange,
  onResult,
  onStateChange,
  onOpenRedactionLab,
}: {
  hostedReviewMode: boolean;
  onInspectorChange: (record: InspectorRecord | null) => void;
  onResult: (result: LabResult) => void;
  onStateChange: (state: StatusState) => void;
  onOpenRedactionLab?: (preset: "healthcare-contact-center" | "financial-contact-center") => void;
}) {
  const [scenarioId, setScenarioId] = useState(DEFAULT_FAMILIAR_CARE_SCENARIO.id);
  const [recipientContext, setRecipientContext] = useState(DEFAULT_FAMILIAR_CARE_SCENARIO.recipientContext);
  const [purpose, setPurpose] = useState(DEFAULT_FAMILIAR_CARE_SCENARIO.messagePurpose);
  const [institution, setInstitution] = useState(DEFAULT_FAMILIAR_CARE_SCENARIO.institution);
  const [tone, setTone] = useState(DEFAULT_FAMILIAR_CARE_SCENARIO.recommendedTone);
  const [message, setMessage] = useState(DEFAULT_FAMILIAR_CARE_SCENARIO.sampleMessage);
  const [language, setLanguage] = useState<TtsVoiceLanguageCode>(DEFAULT_FAMILIAR_CARE_SCENARIO.language);
  const [voiceModel, setVoiceModel] = useState<TtsVoiceModel>(DEFAULT_FAMILIAR_CARE_SCENARIO.voiceModel);
  const [disclosureStyle, setDisclosureStyle] = useState<FamiliarCareDisclosureStyle>("spoken-and-displayed");
  const [sensitivePolicy, setSensitivePolicy] = useState<FamiliarCareSensitiveDetailPolicy>("no-sensitive-details");
  const [fallbackChannel, setFallbackChannel] = useState<FamiliarCareFallbackChannel>(DEFAULT_FAMILIAR_CARE_SCENARIO.fallbackChannel);
  const [optOutInstruction, setOptOutInstruction] = useState(DEFAULT_FAMILIAR_CARE_OPT_OUT);
  const [consent, setConsent] = useState<FamiliarCareConsent>(EMPTY_FAMILIAR_CARE_CONSENT);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [hostedUnlocked, setHostedUnlocked] = useState(!hostedReviewMode);
  const [state, setState] = useState<StatusState>({ status: "idle", message: "" });
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const scenario = FAMILIAR_CARE_SCENARIOS.find((item) => item.id === scenarioId) ?? DEFAULT_FAMILIAR_CARE_SCENARIO;
  const policy = useMemo(() => ({
    scenarioId,
    riskLevel: scenario.riskLevel,
    disclosureStyle,
    sensitiveDetailPolicy: sensitivePolicy,
    fallbackChannel,
    optOutInstruction,
    consent,
  }), [consent, disclosureStyle, fallbackChannel, optOutInstruction, scenario.riskLevel, scenarioId, sensitivePolicy]);
  const preview = useMemo(() => buildFamiliarCareDeliveryPreview({ scenarioId, message, disclosureStyle, fallbackChannel, optOutInstruction }), [disclosureStyle, fallbackChannel, message, optOutInstruction, scenarioId]);
  const validation = useMemo(() => validateFamiliarCareRequest({ text: message, policy, hosted: hostedReviewMode }), [hostedReviewMode, message, policy]);
  const findings = useMemo(() => analyzeFamiliarCareText(message), [message]);
  const selectedVoice = getVoiceOption(voiceModel);
  const canGenerate = validation.ok && hostedUnlocked && state.status !== "loading";

  useEffect(() => {
    audioUrlRef.current = audioUrl;
    if (audioUrl) audioRef.current?.focus();
  }, [audioUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (hostedReviewMode) void fetch("/api/deepgram/familiar-care-session", { method: "DELETE", keepalive: true });
    };
  }, [hostedReviewMode]);

  function updateState(next: StatusState) {
    if (!mountedRef.current) return;
    setState(next);
    onStateChange(next);
  }

  function clearAudio() {
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setDuration(null);
  }

  function resetConsentAndAudio(messageText: string) {
    setConsent(EMPTY_FAMILIAR_CARE_CONSENT);
    clearAudio();
    updateState({ status: "idle", message: messageText });
  }

  function loadScenario(next: FamiliarCareScenario) {
    setScenarioId(next.id);
    setRecipientContext(next.recipientContext);
    setPurpose(next.messagePurpose);
    setInstitution(next.institution);
    setTone(next.recommendedTone);
    setMessage(next.sampleMessage);
    setLanguage(next.language);
    setVoiceModel(next.voiceModel);
    setDisclosureStyle("spoken-and-displayed");
    setSensitivePolicy("no-sensitive-details");
    setFallbackChannel(next.fallbackChannel);
    setOptOutInstruction(DEFAULT_FAMILIAR_CARE_OPT_OUT);
    resetConsentAndAudio(`${next.title} loaded. Review the policy and confirm consent before previewing audio.`);
  }

  function updateLanguage(value: TtsVoiceLanguageCode) {
    setLanguage(value);
    setVoiceModel(getDefaultVoiceForLanguage(value));
    resetConsentAndAudio("Language context changed. Consent must be reconfirmed.");
  }

  function updateVoice(value: TtsVoiceModel) {
    setVoiceModel(value);
    setLanguage(getVoiceOption(value).languageCode);
    resetConsentAndAudio("Approved voice context changed. Consent must be reconfirmed.");
  }

  async function unlockHostedPreview() {
    updateState({ status: "loading", message: "Opening the protected reviewer session…" });
    try {
      const response = await fetch("/api/deepgram/familiar-care-session", { method: "POST" });
      const body = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message || "The protected reviewer session could not be opened.");
      setHostedUnlocked(true);
      updateState({ status: "success", message: "Protected reviewer session unlocked. No voice preview has been generated." });
    } catch (error) {
      updateState({ status: "error", message: error instanceof Error ? error.message : "Reviewer unlock failed." });
    }
  }

  async function generate() {
    if (!canGenerate) {
      const messageText = !hostedUnlocked
        ? "Unlock the protected reviewer session before generating audio."
        : validation.errors.join(" ") || "Complete the consent and policy checks before generating audio.";
      const inspector = localInspector(policy, voiceModel, message.length, 400, messageText);
      onInspectorChange(inspector);
      updateState({ status: "error", message: messageText });
      return;
    }

    clearAudio();
    updateState({ status: "loading", message: "Requesting a short approved Aura voice preview…" });
    let serverAudioUrl: string | null = null;
    try {
      const response = await fetch("/api/deepgram/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: preview.spokenText, model: voiceModel, familiarCare: policy }),
      });
      const envelope = await response.json() as ApiDebugEnvelope<TtsResponseData>;
      if (!response.ok || !envelope.ok || !envelope.data) throw new FamiliarCareResponseError(envelope.error?.message || "Voice preview failed.", envelope.inspector);
      serverAudioUrl = envelope.data.audioUrl;
      if (!serverAudioUrl.startsWith("/api/deepgram/tts?id=")) throw new FamiliarCareResponseError("The audio handoff URL was not recognized.", envelope.inspector);
      const audioResponse = await fetch(serverAudioUrl, { cache: "no-store" });
      if (!audioResponse.ok) throw new FamiliarCareResponseError("Generated audio could not be loaded.", envelope.inspector);
      const blob = await audioResponse.blob();
      const nextAudioUrl = URL.createObjectURL(blob);
      if (!mountedRef.current) {
        URL.revokeObjectURL(nextAudioUrl);
        return;
      }
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextAudioUrl;
      });
      onInspectorChange(envelope.inspector);
      updateState({ status: "success", message: "Approved Aura voice preview is ready. Playback has not started." });
      onResult({
        title: "Familiar Care Voice Preview",
        transcript: "",
        raw: { ...sanitizeFamiliarCareRequest({ text: preview.spokenText, model: voiceModel, policy }), audio: { ready: true, persisted: false, autoplay: false } },
        notes: "The preview used an existing Deepgram Aura model. Message text, recipient details, and audio are excluded from this diagnostic result.",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Voice preview failed.";
      onInspectorChange(error instanceof FamiliarCareResponseError && error.inspector ? error.inspector : localInspector(policy, voiceModel, message.length, 500, messageText));
      updateState({ status: "error", message: messageText });
    } finally {
      if (serverAudioUrl) await fetch(serverAudioUrl, { method: "DELETE" }).catch(() => undefined);
    }
  }

  return (
    <div className="h-full min-h-[560px] overflow-auto rounded-lg border border-white/10 bg-black/20 p-4 text-slate-200" data-testid="familiar-care">
      <header className="rounded-xl border border-cyan-200/20 bg-gradient-to-br from-cyan-300/[.09] via-slate-950/70 to-violet-300/[.08] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-200/70">Trusted Voice</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Familiar Care</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Consent-first voice experiences that make routine care and service messages feel more familiar without pretending to be a real person.</p>
        <p className="mt-3 text-sm font-semibold text-cyan-100">Familiar should never mean deceptive.</p>
        {hostedReviewMode ? <div className="mt-4 rounded-lg border border-violet-200/20 bg-violet-200/[.06] p-3"><p className="text-xs font-semibold text-violet-100">Hosted Review Mode — protected live preview</p><p className="mt-1 text-xs leading-5 text-slate-400">Explore the consent model and message design now. Unlock the reviewer session to generate a short approved voice preview.</p>{!hostedUnlocked ? <button type="button" onClick={unlockHostedPreview} disabled={state.status === "loading"} className={secondaryButton}>Unlock reviewer session</button> : <p className="mt-2 text-xs text-emerald-200">Reviewer session unlocked · cooldown and three-preview quota apply</p>}</div> : null}
      </header>

      <section className="mt-4">
        <h3 className={sectionTitle}>Scenario library</h3>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {FAMILIAR_CARE_SCENARIOS.map((item) => <ScenarioCard key={item.id} scenario={item} active={item.id === scenarioId} canPreview={item.id === scenarioId && canGenerate} onLoad={() => loadScenario(item)} onPreview={generate} />)}
        </div>
      </section>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[.82fr_1.18fr]">
        <div className="space-y-4">
          <section className={panelClass}>
            <h3 className={sectionTitle}>Consent gate</h3>
            <p className={sectionSubtitle}>Every confirmation is checked again by the server before TTS.</p>
            <div className="mt-3 space-y-2">
              <ConsentCheck checked={consent.permission} onChange={(value) => setConsent((current) => ({ ...current, permission: value }))}>I have permission to use this voice or message.</ConsentCheck>
              <ConsentCheck checked={consent.syntheticVoice} onChange={(value) => setConsent((current) => ({ ...current, syntheticVoice: value }))}>This demo uses an approved synthetic voice and does not claim to be a live person.</ConsentCheck>
              <ConsentCheck checked={consent.noImpersonation} onChange={(value) => setConsent((current) => ({ ...current, noImpersonation: value }))}>I will not impersonate a real person without consent.</ConsentCheck>
              <ConsentCheck checked={consent.sensitiveChannel} onChange={(value) => setConsent((current) => ({ ...current, sensitiveChannel: value }))}>I understand that sensitive details should remain in a verified secondary channel.</ConsentCheck>
              <ConsentCheck checked={consent.optOut} onChange={(value) => setConsent((current) => ({ ...current, optOut: value }))}>I understand that the recipient must be able to opt out.</ConsentCheck>
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5" aria-live="polite">
              <p className={familiarCareConsentReady(consent) ? "font-semibold text-emerald-200" : "font-semibold text-amber-100"}>{familiarCareConsentReady(consent) ? "Consent confirmed" : "Consent confirmation incomplete"}</p>
              <p>Synthetic voice disclosed: {consent.syntheticVoice ? "Yes" : "Pending"}</p><p>Sensitive detail policy selected: {policyLabel(sensitivePolicy)}</p><p>Opt-out path selected: {consent.optOut && optOutInstruction.trim() ? "Yes" : "Pending"}</p>
            </div>
          </section>

          <section className={panelClass}>
            <h3 className={sectionTitle}>Why these guardrails exist</h3>
            <ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-400 sm:grid-cols-2">{["Informed consent and revocation", "Clear recipient expectations", "Grief-sensitive design", "Impersonation risk", "Healthcare privacy", "Financial safety", "Disclosure and opt-out", "Fallback to a human"].map((item) => <li key={item} className="rounded border border-white/10 bg-black/20 p-2">{item}</li>)}</ul>
            <p className="mt-3 rounded border border-amber-200/20 bg-amber-200/[.05] p-3 text-xs leading-5 text-amber-50">Exact voice replication is outside this demo. A real deployment would require documented consent, clear disclosure, revocation rules, and careful grief-sensitive design.</p>
          </section>
        </div>

        <div className="space-y-4">
          <section className={panelClass}>
            <h3 className={sectionTitle}>Message builder</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Labeled label="Recipient context"><input value={recipientContext} onChange={(event) => setRecipientContext(event.target.value)} className={inputClass} /></Labeled>
              <Labeled label="Message purpose"><input value={purpose} onChange={(event) => setPurpose(event.target.value)} className={inputClass} /></Labeled>
              <Labeled label="Institution or sender"><input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="Optional" className={inputClass} /></Labeled>
              <Labeled label="Recommended tone"><input value={tone} onChange={(event) => setTone(event.target.value)} className={inputClass} /></Labeled>
              <Labeled label="Language"><select value={language} onChange={(event) => updateLanguage(event.target.value as TtsVoiceLanguageCode)} className={inputClass}>{AURA_VOICE_GROUPS.map((group) => <option key={group.languageCode} value={group.languageCode}>{group.language}</option>)}</select></Labeled>
              <Labeled label="Approved voice model"><select value={voiceModel} onChange={(event) => updateVoice(event.target.value as TtsVoiceModel)} className={inputClass}>{AURA_VOICE_GROUPS.map((group) => <optgroup key={group.languageCode} label={group.language}>{group.voices.map((voice) => <option key={voice.value} value={voice.value}>{voice.label}</option>)}</optgroup>)}</select></Labeled>
              <Labeled label="Disclosure style"><select value={disclosureStyle} onChange={(event) => setDisclosureStyle(event.target.value as FamiliarCareDisclosureStyle)} className={inputClass}>{FAMILIAR_CARE_DISCLOSURE_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value === "displayed-only" && scenario.riskLevel !== "Low"}>{option.label}</option>)}</select></Labeled>
              <Labeled label="Sensitive detail policy"><select value={sensitivePolicy} onChange={(event) => setSensitivePolicy(event.target.value as FamiliarCareSensitiveDetailPolicy)} className={inputClass}>{FAMILIAR_CARE_SENSITIVE_POLICY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Labeled>
              {onOpenRedactionLab ? <div className="rounded-lg border border-cyan-200/15 bg-cyan-200/[.035] p-3"><p className="text-xs font-semibold text-cyan-50">Review message for sensitive content</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Trusted Voice prevents risky text from being spoken. Deepgram STT redaction is a separate mechanism that changes transcript output only and never sanitizes TTS audio.</p><button type="button" onClick={() => onOpenRedactionLab(scenario.riskLevel === "High" && scenario.id.includes("financial") ? "financial-contact-center" : "healthcare-contact-center")} className={`${secondaryButton} mt-2`}>Open related Redaction Lab policy</button></div> : null}
              <Labeled label="Fallback channel"><select value={fallbackChannel} onChange={(event) => setFallbackChannel(event.target.value as FamiliarCareFallbackChannel)} className={inputClass}>{FAMILIAR_CARE_FALLBACK_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value === "none" && scenario.riskLevel !== "Low"}>{option.label}</option>)}</select></Labeled>
              <Labeled label="Opt-out instruction"><input value={optOutInstruction} onChange={(event) => setOptOutInstruction(event.target.value)} className={inputClass} /></Labeled>
            </div>
            <Labeled label="Message text"><textarea value={message} onChange={(event) => { setMessage(event.target.value); clearAudio(); }} rows={6} maxLength={hostedReviewMode ? 500 : 800} className={`${inputClass} mt-3 min-h-36 resize-y py-3`} /></Labeled>
            <p className="mt-2 text-[11px] text-slate-500">{message.length}/{hostedReviewMode ? 500 : 800} characters. Detection is heuristic and cannot identify every sensitive detail.</p>
            <p className="mt-2 rounded border border-cyan-200/15 bg-cyan-200/[.04] p-2 text-xs leading-5 text-cyan-50">Keep medication names, diagnoses, account numbers, balances, and similar details in a verified app, portal, or text channel.</p>
            {findings.length ? <div className="mt-3 space-y-2" role="alert" aria-live="assertive">{findings.map((finding, index) => <div key={`${finding.category}-${index}`} className={`rounded border p-3 text-xs leading-5 ${finding.kind === "blocked" ? "border-red-300/25 bg-red-300/[.06] text-red-100" : "border-amber-200/25 bg-amber-200/[.05] text-amber-50"}`}><strong>{finding.kind === "blocked" ? "Blocked" : "Review"}: {finding.category}</strong><p>Flagged passage: “{finding.passage}”</p><p>{finding.explanation}</p></div>)}</div> : null}
          </section>

          <section className={panelClass} aria-labelledby="delivery-preview-title">
            <h3 id="delivery-preview-title" className={sectionTitle}>Delivery Preview</h3>
            <p className={sectionSubtitle}>The spoken order below is the exact text sent to TTS.</p>
            <div className="mt-3 space-y-2 text-xs leading-5"><PreviewLine label={preview.disclosurePlacement === "spoken-end" ? "3 · Disclosure" : "1 · Disclosure"} text={preview.disclosure} /><PreviewLine label={preview.disclosurePlacement === "spoken-end" ? "1 · Message" : "2 · Message"} text={message} /><PreviewLine label="Fallback" text={preview.fallback || "Not selected"} /><PreviewLine label="Opt-out" text={optOutInstruction || "Required"} /></div>
            <div className="mt-3 rounded border border-cyan-200/15 bg-cyan-200/[.04] p-3" aria-label="Exact spoken delivery text"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-200/65">Exact spoken TTS text</p><p className="mt-1 text-xs leading-5 text-cyan-50">{preview.spokenText}</p></div>
            {validation.errors.length ? <ul className="mt-3 rounded border border-red-300/20 bg-red-300/[.05] p-3 text-xs leading-5 text-red-100" aria-live="polite">{validation.errors.map((error) => <li key={error}>• {error}</li>)}</ul> : null}
            <button type="button" onClick={generate} disabled={!canGenerate} data-shortcut-command="run_primary" data-shortcut-label="Preview Approved Voice" className={`${primaryButton} mt-4`}>{state.status === "loading" ? "Preparing preview…" : "Preview Approved Voice"}</button>
            {state.message ? <p className={`mt-3 text-xs leading-5 ${state.status === "error" ? "text-red-200" : state.status === "success" ? "text-emerald-200" : "text-slate-400"}`} role="status" aria-live="polite">{state.message}</p> : null}
          </section>

          <section className={panelClass}>
            <h3 className={sectionTitle}>Approved voice preview</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><Meta label="Aura model" value={voiceModel} /><Meta label="Language" value={language} /><Meta label="Tone" value={selectedVoice.tone} /><Meta label="Disclosure" value={FAMILIAR_CARE_DISCLOSURE_OPTIONS.find((item) => item.value === disclosureStyle)?.label || disclosureStyle} /><Meta label="Duration" value={duration === null ? "Not available" : `${duration.toFixed(1)} seconds`} /><Meta label="Notice" value="Synthetic voice" /></div>
            {audioUrl ? <><audio ref={audioRef} controls src={audioUrl} preload="metadata" onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null)} className="mt-3 h-10 w-full" aria-label="Familiar Care approved synthetic voice preview" /><div className="mt-3 flex gap-2"><button type="button" onClick={generate} disabled={!canGenerate} className={secondaryButton}>Regenerate</button><button type="button" onClick={clearAudio} className={secondaryButton}>Clear audio</button></div></> : <p className="mt-3 text-xs text-slate-500">No audio generated. Preview never autoplays and is not persisted by default.</p>}
          </section>

          <section className={panelClass}>
            <h3 className={sectionTitle}>Applied Engineering Notes</h3>
            <p className="mt-3 rounded border border-white/10 bg-black/20 p-3 font-mono text-[11px] leading-5 text-cyan-50">Institution event → approved message template → sensitive-detail policy → consent and preference check → Deepgram TTS → disclosure → delivery channel → fallback and opt-out → audit event</p>
            <p className="mt-3 text-xs leading-5 text-slate-400">Consider idempotency, preference lookup, template approval, locale handling, model fallback, delivery failure, TTS timeout, retention, observability, audit logging, and human escalation.</p>
            <details className="mt-3 rounded border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer text-xs font-semibold text-cyan-100">View raw request</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-300">{JSON.stringify(sanitizeFamiliarCareRequest({ text: preview.spokenText, model: voiceModel, policy }), null, 2)}</pre></details>
          </section>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, active, canPreview, onLoad, onPreview }: { scenario: FamiliarCareScenario; active: boolean; canPreview: boolean; onLoad: () => void; onPreview: () => void }) {
  return <article className={`rounded-xl border p-4 ${active ? "border-cyan-200/35 bg-cyan-200/[.06]" : "border-white/10 bg-white/[.03]"}`}><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-white">{scenario.title}</h4><p className="mt-1 text-xs leading-5 text-slate-400">{scenario.purpose}</p></div><span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-semibold ${scenario.riskLevel === "High" ? "border-red-300/25 text-red-100" : "border-amber-200/25 text-amber-50"}`}>{scenario.riskLevel} risk</span></div><p className="mt-3 rounded border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-300">{scenario.sampleMessage}</p><dl className="mt-3 grid gap-2 text-[11px] leading-5 sm:grid-cols-2"><div><dt className="font-semibold text-slate-300">Tone</dt><dd className="text-slate-500">{scenario.recommendedTone}</dd></div><div><dt className="font-semibold text-slate-300">Fallback</dt><dd className="text-slate-500">{FAMILIAR_CARE_FALLBACK_OPTIONS.find((item) => item.value === scenario.fallbackChannel)?.label}</dd></div><div><dt className="font-semibold text-slate-300">Privacy</dt><dd className="text-slate-500">{scenario.privacyConsiderations}</dd></div><div><dt className="font-semibold text-slate-300">Disclosure</dt><dd className="text-slate-500">{scenario.disclosureRequirements}</dd></div></dl><div className="mt-3"><p className="text-[11px] font-semibold text-slate-300">Consent requirements</p><ul className="mt-1 text-[11px] leading-5 text-slate-500">{scenario.consentRequirements.map((item) => <li key={item}>• {item}</li>)}</ul></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onLoad} className={secondaryButton}>Load Builder</button><button type="button" onClick={onPreview} disabled={!canPreview} className={primaryButton}>Preview Approved Voice</button></div></article>;
}

function ConsentCheck({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-200"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-cyan-200" /><span>{children}</span></label>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-slate-300"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function PreviewLine({ label, text }: { label: string; text: string }) { return <div className="rounded border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-200/65">{label}</p><p className="mt-1 text-slate-300">{text}</p></div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div className="rounded border border-white/10 bg-black/20 p-2"><p className="text-[9px] uppercase tracking-[.12em] text-slate-600">{label}</p><p className="mt-1 break-words text-[11px] text-slate-300">{value}</p></div>; }
function policyLabel(value: FamiliarCareSensitiveDetailPolicy) { return FAMILIAR_CARE_SENSITIVE_POLICY_OPTIONS.find((item) => item.value === value)?.label || value; }

function localInspector(policy: FamiliarCareRequestPolicy, model: TtsVoiceModel, textLength: number, status: number, message: string) {
  const now = new Date().toISOString();
  return buildInspectorRecord({ module: "Trusted Voice: Familiar Care", startedAt: now, completedAt: now, request: { method: "LOCAL", endpoint: "/api/deepgram/tts", bodyPreview: { model, textLength, familiarCare: { scenarioId: policy.scenarioId, riskLevel: policy.riskLevel, consentConfirmed: familiarCareConsentReady(policy.consent) }, credentials: "***server-only***", sensitiveRecipientDetails: "***redacted***" } }, response: { status, bodyPreview: { message } }, timeline: [createTimelineEvent({ type: "familiar_care.blocked", label: "Familiar Care preview blocked", detail: message, at: now })], notes: ["No Deepgram call was made.", "Message text, recipient details, credentials, and audio are excluded from diagnostics."] });
}

class FamiliarCareResponseError extends Error {
  constructor(message: string, public inspector?: InspectorRecord) { super(message); this.name = "FamiliarCareResponseError"; }
}

const panelClass = "rounded-xl border border-white/10 bg-[#071016]/80 p-4";
const sectionTitle = "text-sm font-semibold text-white";
const sectionSubtitle = "mt-1 text-xs leading-5 text-slate-500";
const inputClass = "min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-200/40";
const primaryButton = "rounded-lg border border-cyan-200/35 bg-cyan-200 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButton = "mt-2 rounded-lg border border-white/15 bg-white/[.05] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import { HumanDepthControl } from "@/components/one/AdaptiveInterface";
import { useOneExperience } from "@/components/one/OneExperienceProvider";
import {
  getContextualConciergeIntents,
  getOneConciergeDestination,
  getOneConciergeIntent,
  ONE_CONCIERGE_REGISTRY_VERSION,
  type OneConciergeDestinationId,
} from "@/lib/concierge/registry";
import {
  ONE_CONCIERGE_MAX_INPUT_LENGTH,
  resolveOneConciergeGoal,
  type OneConciergeResolution,
} from "@/lib/concierge/resolver";
import {
  createOneConciergeState,
  reduceOneConciergeState,
} from "@/lib/concierge/state-machine";
import type {
  OneConciergeSpeechCapture,
  OneConciergeSpeechError,
} from "@/lib/concierge/browser-speech";
import { INTERFACE_DEPTHS, type InterfaceDepth } from "@/lib/one/interface-depth";
import {
  cancelActiveBrowserSpeechCapture,
  claimBrowserSpeechCapture,
  type BrowserSpeechCaptureLease,
} from "@/lib/speech/browser-speech-coordinator";

type OpenConciergeOptions = Readonly<{
  opener?: HTMLElement | null;
  preset?: string;
}>;

type OneConciergeContextValue = Readonly<{
  isOpen: boolean;
  openConcierge: (options?: OpenConciergeOptions) => void;
  closeConcierge: () => void;
}>;

const OneConciergeContext = createContext<OneConciergeContextValue | null>(null);

export function OneConciergeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const one = useOneExperience();
  const [state, dispatch] = useReducer(reduceOneConciergeState, undefined, () => createOneConciergeState());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const phaseHeadingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const priorOpenRef = useRef(false);
  const priorFocusStepRef = useRef("closed");
  const pathnameRef = useRef(pathname);
  const principalRef = useRef(principalKey(one.authReady, one.user?.id ?? null));
  const speechRef = useRef<OneConciergeSpeechCapture | null>(null);
  const speechLeaseRef = useRef<BrowserSpeechCaptureLease | null>(null);
  const speechGenerationRef = useRef(0);

  const abortSpeech = useCallback(() => {
    speechGenerationRef.current += 1;
    speechLeaseRef.current?.release();
    speechLeaseRef.current = null;
    const speech = speechRef.current;
    speechRef.current = null;
    speech?.cancel();
  }, []);

  const invalidate = useCallback(() => {
    abortSpeech();
    dispatch({ type: "INVALIDATE" });
  }, [abortSpeech]);

  const closeConcierge = useCallback(() => {
    abortSpeech();
    dispatch({ type: "CLOSE" });
  }, [abortSpeech]);

  const resetConcierge = useCallback(() => {
    abortSpeech();
    dispatch({ type: "RESET" });
  }, [abortSpeech]);

  const editGoal = useCallback(() => {
    abortSpeech();
    dispatch({ type: "SET_INPUT", value: state.input });
  }, [abortSpeech, state.input]);

  const openConcierge = useCallback((options: OpenConciergeOptions = {}) => {
    abortSpeech();
    cancelActiveBrowserSpeechCapture();
    openerRef.current = options.opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dispatch({ type: "OPEN", preset: options.preset });
  }, [abortSpeech]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (state.open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!state.open && dialog.open) {
      dialog.close();
    }
    if (priorOpenRef.current && !state.open) {
      window.requestAnimationFrame(() => openerRef.current?.focus());
      openerRef.current = null;
    }
    priorOpenRef.current = state.open;
  }, [state.open]);

  const focusStep = getFocusStep(state.phase);
  useEffect(() => {
    if (!state.open) {
      priorFocusStepRef.current = "closed";
      return;
    }
    if (priorFocusStepRef.current === focusStep) return;
    priorFocusStepRef.current = focusStep;
    window.requestAnimationFrame(() => {
      if (focusStep === "input") inputRef.current?.focus();
      else phaseHeadingRef.current?.focus();
    });
  }, [focusStep, state.open]);

  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    invalidate();
  }, [invalidate, pathname]);

  useEffect(() => {
    const nextPrincipal = principalKey(one.authReady, one.user?.id ?? null);
    const previousPrincipal = principalRef.current;
    if (previousPrincipal === nextPrincipal) return;
    principalRef.current = nextPrincipal;
    // Initial session resolution establishes the first trustworthy principal;
    // it is not a transition between humans. Keep any disabled, tab-local draft
    // visible while the provider moves from "checking" to its initial state.
    if (previousPrincipal === "checking" && nextPrincipal !== "checking") return;
    invalidate();
  }, [invalidate, one.authReady, one.user?.id]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && isSpeechPhase(state.phase)) invalidate();
    };
    const onPageHide = () => invalidate();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) invalidate();
    };
    const onOffline = () => {
      if (!isSpeechPhase(state.phase)) return;
      abortSpeech();
      dispatch({
        type: "VOICE_FAILURE",
        notice: "Voice input stopped because this device went offline. Your typed goal is unchanged; continue with text.",
      });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("offline", onOffline);
    };
  }, [abortSpeech, invalidate, state.phase]);

  useEffect(() => () => abortSpeech(), [abortSpeech]);

  const resolveGoal = useCallback((input: string) => {
    const resolution = resolveOneConciergeGoal(input, {
      registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
      online: navigator.onLine,
    });
    dispatch({ type: "RESOLVED", input, resolution });
  }, []);

  const chooseDestination = useCallback((destinationId: OneConciergeDestinationId) => {
    const destination = getOneConciergeDestination(destinationId);
    if (!destination || (navigator.onLine === false && !destination.offlineShellAvailable)) {
      const unavailable = resolveOneConciergeGoal(state.input, {
        registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
        online: navigator.onLine,
        unavailableDestinationIds: destination ? [destination.id] : undefined,
      });
      dispatch({ type: "RESOLVED", input: state.input, resolution: unavailable });
      return;
    }
    closeConcierge();
    router.push(destination.href);
  }, [closeConcierge, router, state.input]);

  const startVoice = useCallback(async () => {
    if (!navigator.onLine) {
      dispatch({
        type: "VOICE_FAILURE",
        notice: "Voice input is unavailable while offline. Your typed goal is unchanged; continue with text.",
      });
      return;
    }
    abortSpeech();
    dispatch({ type: "VOICE_PREPARING" });
    const generation = ++speechGenerationRef.current;
    speechLeaseRef.current = claimBrowserSpeechCapture(() => {
      if (generation !== speechGenerationRef.current) return;
      speechGenerationRef.current += 1;
      speechLeaseRef.current = null;
      const speech = speechRef.current;
      speechRef.current = null;
      speech?.cancel();
      dispatch({
        type: "VOICE_FAILURE",
        notice: "Voice input stopped because another speech control started. Your typed goal is unchanged; continue with text.",
      });
    });
    try {
      const speechModule = await import("@/lib/concierge/browser-speech");
      if (generation !== speechGenerationRef.current) return;
      if (!speechModule.isOneConciergeSpeechSupported()) {
        speechLeaseRef.current?.release();
        speechLeaseRef.current = null;
        dispatch({
          type: "VOICE_FAILURE",
          notice: "Speech recognition is not available in this browser. Your typed goal is unchanged; continue with text.",
        });
        return;
      }
      speechRef.current = speechModule.startOneConciergeSpeechCapture({
        onListening: () => {
          if (generation === speechGenerationRef.current) dispatch({ type: "VOICE_LISTENING" });
        },
        onProcessing: () => {
          if (generation === speechGenerationRef.current) dispatch({ type: "VOICE_PROCESSING" });
        },
        onPartial: (value) => {
          if (generation === speechGenerationRef.current) dispatch({ type: "VOICE_PARTIAL", value });
        },
        onFinal: (value) => {
          if (generation !== speechGenerationRef.current) return;
          speechLeaseRef.current?.release();
          speechLeaseRef.current = null;
          speechRef.current = null;
          dispatch({ type: "VOICE_FINAL", value });
        },
        onError: (error) => {
          if (generation !== speechGenerationRef.current) return;
          speechLeaseRef.current?.release();
          speechLeaseRef.current = null;
          speechRef.current = null;
          if (error === "cancelled") {
            dispatch({ type: "VOICE_CANCELLED" });
          } else {
            dispatch({ type: "VOICE_FAILURE", notice: speechErrorMessage(error) });
          }
        },
      });
    } catch {
      if (generation === speechGenerationRef.current) {
        speechLeaseRef.current?.release();
        speechLeaseRef.current = null;
        speechRef.current = null;
        dispatch({
          type: "VOICE_FAILURE",
          notice: "Voice input could not start. Your typed goal is unchanged; continue with text.",
        });
      }
    }
  }, [abortSpeech]);

  const stopVoice = useCallback(() => {
    speechRef.current?.stop();
  }, []);

  const cancelVoice = useCallback(() => {
    abortSpeech();
    dispatch({ type: "VOICE_CANCELLED" });
  }, [abortSpeech]);

  const contextValue = useMemo<OneConciergeContextValue>(() => ({
    isOpen: state.open,
    openConcierge,
    closeConcierge,
  }), [closeConcierge, openConcierge, state.open]);

  const contextualIntents = useMemo(() => getContextualConciergeIntents(pathname), [pathname]);
  const currentDepthDescription = INTERFACE_DEPTHS.find((depth) => depth.id === one.interfaceDepth)?.description ?? "";

  return (
    <OneConciergeContext.Provider value={contextValue}>
      <Suspense fallback={null}><OneConciergeSearchObserver onTransition={invalidate} /></Suspense>
      {children}
      <dialog
        aria-describedby="one-concierge-description"
        aria-labelledby="one-concierge-title"
        className="one-concierge"
        data-phase={state.phase}
        onCancel={(event) => {
          event.preventDefault();
          closeConcierge();
        }}
        onClose={() => {
          if (state.open) closeConcierge();
        }}
        ref={dialogRef}
      >
        <div className="one-concierge__surface">
          <header className="one-concierge__header">
            <div>
              <p>ONE Voice Concierge</p>
              <h2 id="one-concierge-title">What would you like to accomplish?</h2>
              <span id="one-concierge-description">Describe an outcome. ONE will explain up to three existing journeys, then wait for your choice.</span>
            </div>
            <button aria-label="Close ONE Voice Concierge" className="one-concierge__close" type="button" onClick={closeConcierge}>Close</button>
          </header>

          <div className="one-concierge__body">
            {isInputPhase(state.phase) ? (
              <GoalInput
                ready={one.authReady}
                input={state.input}
                inputRef={inputRef}
                intents={contextualIntents}
                notice={state.notice}
                onChange={(value) => dispatch({ type: "SET_INPUT", value })}
                onChooseSuggestion={(value) => dispatch({ type: "SET_INPUT", value })}
                onResolve={() => resolveGoal(state.input)}
                onStartVoice={() => void startVoice()}
              />
            ) : null}

            {state.phase === "voice-preparing" || state.phase === "listening" || state.phase === "voice-processing" ? (
              <VoiceCapture
                focusRef={phaseHeadingRef}
                notice={state.notice}
                partialTranscript={state.partialTranscript}
                phase={state.phase}
                onCancel={cancelVoice}
                onStop={stopVoice}
              />
            ) : null}

            {state.phase === "voice-review" ? (
              <VoiceReview
                focusRef={phaseHeadingRef}
                transcript={state.voiceDraft}
                onCancel={() => {
                  abortSpeech();
                  dispatch({ type: "VOICE_CANCELLED", notice: "Voice input discarded. Your typed goal is unchanged." });
                }}
                onChange={(value) => dispatch({ type: "VOICE_EDIT", value })}
                onConfirm={() => resolveGoal(state.voiceDraft)}
              />
            ) : null}

            {state.phase === "clarification" && state.resolution?.status === "ambiguous" ? (
              <Clarification
                depth={one.interfaceDepth}
                focusRef={phaseHeadingRef}
                resolution={state.resolution}
                onChoose={(intentId) => {
                  const intent = getOneConciergeIntent(intentId);
                  if (intent) resolveGoal(intent.synonyms[0]);
                }}
              />
            ) : null}

            {state.phase === "recommendations" && state.resolution?.status === "matched" ? (
              <Recommendations
                depth={one.interfaceDepth}
                focusRef={phaseHeadingRef}
                resolution={state.resolution}
                onChoose={chooseDestination}
              />
            ) : null}

            {state.phase === "unsupported" || state.phase === "unavailable" || state.phase === "voice-error" ? (
              <Recovery
                focusRef={phaseHeadingRef}
                phase={state.phase}
                notice={state.notice}
                onEdit={editGoal}
                onReset={resetConcierge}
              />
            ) : null}

            <section aria-label="Presentation depth" className="one-concierge__depth">
              <HumanDepthControl compact heading="Choose the detail for this guidance" />
              <details>
                <summary>Why this view?</summary>
                <p>{currentDepthDescription} The destination IDs, permissions, costs, and outcome semantics never change with this setting.</p>
              </details>
            </section>
          </div>

          <footer className="one-concierge__footer">
            <p>Guide only: no action, provider, upload, content save, spending, or scenario run can happen here. Your existing presentation-depth preference may persist.</p>
            <div>
              {state.phase === "clarification" || state.phase === "recommendations" ? <button type="button" onClick={editGoal}>Edit goal</button> : null}
              {state.phase !== "input" && state.phase !== "closed" ? <button type="button" onClick={resetConcierge}>Start over</button> : null}
              <button type="button" onClick={closeConcierge}>Use direct navigation</button>
            </div>
          </footer>
          <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">{state.notice}</p>
        </div>
      </dialog>
    </OneConciergeContext.Provider>
  );
}

function OneConciergeSearchObserver({ onTransition }: { onTransition: () => void }) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const priorSearchRef = useRef(search);
  useEffect(() => {
    if (priorSearchRef.current === search) return;
    priorSearchRef.current = search;
    onTransition();
  }, [onTransition, search]);
  return null;
}

export function useOneConcierge() {
  const value = useContext(OneConciergeContext);
  if (!value) throw new Error("useOneConcierge must be used within OneConciergeProvider");
  return value;
}

function GoalInput({
  input,
  inputRef,
  intents,
  notice,
  ready,
  onChange,
  onChooseSuggestion,
  onResolve,
  onStartVoice,
}: {
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  intents: ReturnType<typeof getContextualConciergeIntents>;
  notice: string;
  ready: boolean;
  onChange: (value: string) => void;
  onChooseSuggestion: (value: string) => void;
  onResolve: () => void;
  onStartVoice: () => void;
}) {
  return (
    <section aria-labelledby="one-concierge-goal-title" className="one-concierge__goal">
      <div className="one-concierge__section-heading">
        <div><small>Start with your goal</small><h3 id="one-concierge-goal-title">Tell ONE the outcome you want</h3></div>
        <span>{input.length}/{ONE_CONCIERGE_MAX_INPUT_LENGTH}</span>
      </div>
      <label htmlFor="one-concierge-input">Your goal</label>
      <textarea
        id="one-concierge-input"
        maxLength={ONE_CONCIERGE_MAX_INPUT_LENGTH}
        placeholder="For example: I want to turn speech into text."
        ref={inputRef}
        rows={3}
        value={input}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="one-concierge__input-actions">
        <button className="one-concierge__primary" disabled={!ready || !input.trim()} type="button" onClick={onResolve}>Find a path</button>
        <button disabled={!ready} type="button" onClick={onStartVoice}>Use microphone</button>
      </div>
      <p className="one-concierge__voice-disclosure">Optional voice input is handled by your browser or operating system and may use its own speech service. ONE does not retain the audio or transcript. You will review the text before it is interpreted.</p>
      <div aria-label="Suggested goals" className="one-concierge__suggestions" role="group">
        {intents.map((intent) => (
          <button key={intent.id} type="button" onClick={() => onChooseSuggestion(intent.synonyms[0])}>{intent.label}</button>
        ))}
      </div>
      {!ready ? <p className="one-concierge__visible-status">ONE is verifying the current identity before showing a journey.</p> : null}
      {notice ? <p className="one-concierge__visible-status">{notice}</p> : null}
    </section>
  );
}

function VoiceCapture({
  focusRef,
  phase,
  notice,
  partialTranscript,
  onStop,
  onCancel,
}: {
  focusRef: RefObject<HTMLHeadingElement | null>;
  phase: "voice-preparing" | "listening" | "voice-processing";
  notice: string;
  partialTranscript: string;
  onStop: () => void;
  onCancel: () => void;
}) {
  const label = phase === "voice-preparing" ? "Ready" : phase === "listening" ? "Listening" : "Processing";
  return (
    <section aria-labelledby="one-concierge-listening-title" className="one-concierge__voice-state" data-state={phase}>
      <span aria-hidden="true" className="one-concierge__listening-indicator" />
      <p>{label}</p>
      <h3 id="one-concierge-listening-title" ref={focusRef} tabIndex={-1}>Say one short goal</h3>
      <span>{notice}</span>
      <div aria-label="Unconfirmed speech preview" className="one-concierge__speech-preview">{partialTranscript || "Waiting for speech…"}</div>
      <div>
        <button className="one-concierge__primary" disabled={phase !== "listening"} type="button" onClick={onStop}>Stop and review</button>
        <button type="button" onClick={onCancel}>Cancel voice input</button>
      </div>
    </section>
  );
}

function VoiceReview({
  focusRef,
  transcript,
  onChange,
  onConfirm,
  onCancel,
}: {
  focusRef: RefObject<HTMLHeadingElement | null>;
  transcript: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section aria-labelledby="one-concierge-review-title" className="one-concierge__goal">
      <div className="one-concierge__section-heading"><div><small>Review before interpreting</small><h3 id="one-concierge-review-title" ref={focusRef} tabIndex={-1}>Is this the goal you meant?</h3></div><span>{transcript.length}/{ONE_CONCIERGE_MAX_INPUT_LENGTH}</span></div>
      <label htmlFor="one-concierge-transcript">Speech transcript</label>
      <textarea id="one-concierge-transcript" maxLength={ONE_CONCIERGE_MAX_INPUT_LENGTH} rows={3} value={transcript} onChange={(event) => onChange(event.currentTarget.value)} />
      <div className="one-concierge__input-actions">
        <button className="one-concierge__primary" disabled={!transcript.trim()} type="button" onClick={onConfirm}>Use this goal</button>
        <button type="button" onClick={onCancel}>Discard voice input</button>
      </div>
      <p className="one-concierge__voice-disclosure">Partial speech never navigates. This confirmed text uses the same deterministic resolver as typed input.</p>
    </section>
  );
}

function Clarification({
  depth,
  focusRef,
  resolution,
  onChoose,
}: {
  depth: InterfaceDepth;
  focusRef: RefObject<HTMLHeadingElement | null>;
  resolution: Extract<OneConciergeResolution, { status: "ambiguous" }>;
  onChoose: (intentId: (typeof resolution.intentIds)[number]) => void;
}) {
  return (
    <section aria-labelledby="one-concierge-clarification-title" className="one-concierge__clarification">
      <small>One clarification</small>
      <h3 id="one-concierge-clarification-title" ref={focusRef} tabIndex={-1}>{resolution.prompt}</h3>
      <div>
        {resolution.intentIds.map((intentId) => {
          const intent = getOneConciergeIntent(intentId);
          if (!intent) return null;
          return <button key={intent.id} type="button" onClick={() => onChoose(intent.id)}><strong>{intent.label}</strong><span>{intent.reflection[depth]}</span></button>;
        })}
      </div>
      <p>No route opened and no action ran. Choose one interpretation or edit your goal.</p>
    </section>
  );
}

function Recommendations({
  depth,
  focusRef,
  resolution,
  onChoose,
}: {
  depth: InterfaceDepth;
  focusRef: RefObject<HTMLHeadingElement | null>;
  resolution: Extract<OneConciergeResolution, { status: "matched" }>;
  onChoose: (destinationId: OneConciergeDestinationId) => void;
}) {
  const intent = getOneConciergeIntent(resolution.intentId);
  return (
    <section aria-labelledby="one-concierge-recommendations-title" className="one-concierge__recommendations">
      <div className="one-concierge__section-heading"><div><small>ONE understood</small><h3 id="one-concierge-recommendations-title" ref={focusRef} tabIndex={-1}>{intent?.reflection[depth] ?? "Choose a registered journey."}</h3></div><span>{resolution.destinationIds.length} path{resolution.destinationIds.length === 1 ? "" : "s"}</span></div>
      <div className="one-concierge__destination-list">
        {resolution.destinationIds.map((destinationId) => {
          const destination = getOneConciergeDestination(destinationId);
          if (!destination) return null;
          const headingId = `one-concierge-destination-${destination.id}`;
          return (
            <article aria-labelledby={headingId} data-destination-id={destination.id} key={destination.id}>
              <header><div><small>{destination.accessDisclosure}</small><h4 id={headingId}>{destination.label}</h4></div><span>{destination.offlineShellAvailable ? "Shell available offline" : "Connection may be needed"}</span></header>
              <p className="one-concierge__why">{destination.why[depth]}</p>
              <p className="one-concierge__outcome"><strong>What you will accomplish</strong>{destination.outcome}</p>
              <dl>
                <div><dt>Input</dt><dd>{destination.inputDisclosure}</dd></div>
                <div><dt>Provider</dt><dd>{destination.providerDisclosure}</dd></div>
                <div><dt>Cost</dt><dd>{destination.costDisclosure}</dd></div>
                <div><dt>Persistence</dt><dd>{destination.persistenceDisclosure}</dd></div>
                <div><dt>Confirmation</dt><dd>{destination.confirmationDisclosure}</dd></div>
              </dl>
              {depth === "technical" ? <p className="one-concierge__technical">Destination ID: {destination.id} · Registry: {ONE_CONCIERGE_REGISTRY_VERSION}</p> : null}
              <button aria-label={`Choose ${destination.label} journey`} className="one-concierge__primary" type="button" onClick={() => onChoose(destination.id)}>Choose this journey</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Recovery({
  focusRef,
  phase,
  notice,
  onEdit,
  onReset,
}: {
  focusRef: RefObject<HTMLHeadingElement | null>;
  phase: "unsupported" | "unavailable" | "voice-error";
  notice: string;
  onEdit: () => void;
  onReset: () => void;
}) {
  const title = phase === "unavailable" ? "That journey is not available right now" : phase === "voice-error" ? "Continue with text" : "Try one clear outcome";
  return (
    <section aria-labelledby="one-concierge-recovery-title" className="one-concierge__recovery">
      <small>Nothing opened or executed</small>
      <h3 id="one-concierge-recovery-title" ref={focusRef} tabIndex={-1}>{title}</h3>
      <p>{notice}</p>
      <div><button className="one-concierge__primary" type="button" onClick={onEdit}>Edit typed goal</button><button type="button" onClick={onReset}>Choose a suggested goal</button></div>
    </section>
  );
}

function principalKey(authReady: boolean, userId: string | null) {
  if (!authReady) return "checking";
  return userId ? `human:${userId}` : "guest";
}

function isSpeechPhase(phase: string) {
  return phase === "voice-preparing" || phase === "listening" || phase === "voice-processing";
}

function isInputPhase(phase: string) {
  return phase === "input";
}

function getFocusStep(phase: string) {
  if (phase === "closed" || phase === "input") return phase;
  if (isSpeechPhase(phase)) return "voice-capture";
  return phase;
}

function speechErrorMessage(error: OneConciergeSpeechError) {
  switch (error) {
    case "permission-denied":
      return "Microphone permission was denied or revoked. Your typed goal is unchanged; continue with text.";
    case "microphone-unavailable":
      return "No available microphone could be used. Your typed goal is unchanged; continue with text.";
    case "no-speech":
      return "No final speech was captured. Your typed goal is unchanged; continue with text or try again.";
    case "timeout":
      return "Voice input reached its short time limit. Your typed goal is unchanged; continue with text.";
    case "unsupported":
      return "Speech recognition is not available in this browser. Your typed goal is unchanged; continue with text.";
    case "cancelled":
      return "Voice input stopped. Your typed goal is unchanged.";
    case "processing-failed":
      return "The browser could not finish speech recognition. Your typed goal is unchanged; continue with text.";
  }
}

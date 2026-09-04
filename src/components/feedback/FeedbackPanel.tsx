"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  claimBrowserSpeechCapture,
  type BrowserSpeechCaptureLease,
} from "@/lib/speech/browser-speech-coordinator";

type Sentiment = "yay" | "nay";
type InputMethod = "tap" | "typed" | "dictated";
type RecognitionEventLike = { results: ArrayLike<{ 0: { transcript: string } }> };
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => RecognitionLike;

const subscribeToBrowserCapability = () => () => undefined;
const getServerSpeechCapability = () => false;
const getBrowserSpeechCapability = () => {
  const browser = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition);
};

export function FeedbackPanel() {
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [message, setMessage] = useState("");
  const [inputMethod, setInputMethod] = useState<InputMethod>("tap");
  const [surface, setSurface] = useState("other");
  const [providerId, setProviderId] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const speechLeaseRef = useRef<BrowserSpeechCaptureLease | null>(null);
  const speechGenerationRef = useRef(0);
  const speechAvailable = useSyncExternalStore(subscribeToBrowserCapability, getBrowserSpeechCapability, getServerSpeechCapability);

  const stopDictation = useCallback((reason?: "superseded") => {
    speechGenerationRef.current += 1;
    speechLeaseRef.current?.release();
    speechLeaseRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      // The local state still settles when a browser rejects a redundant stop.
    }
    setListening(false);
    if (reason === "superseded") setNotice("Feedback dictation stopped because another speech control started. Your typed note is unchanged.");
  }, []);

  useEffect(() => () => stopDictation(), [stopDictation]);

  function chooseSentiment(value: Sentiment) {
    setSentiment(value);
    if (!message.trim()) setInputMethod("tap");
  }

  function toggleDictation() {
    if (listening) {
      stopDictation();
      return;
    }
    const browser = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice("Speech dictation is not available in this browser. You can still type feedback.");
      return;
    }
    const recognition = new Recognition();
    const generation = ++speechGenerationRef.current;
    speechLeaseRef.current = claimBrowserSpeechCapture(() => stopDictation("superseded"));
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      if (generation !== speechGenerationRef.current) return;
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) {
        setMessage((current) => `${current}${current.trim() ? " " : ""}${transcript}`.slice(0, 2_000));
        setInputMethod("dictated");
      }
    };
    recognition.onerror = () => {
      if (generation !== speechGenerationRef.current) return;
      speechLeaseRef.current?.release();
      speechLeaseRef.current = null;
      recognitionRef.current = null;
      setListening(false);
      setNotice("Dictation stopped before text was captured. You can try again or type instead.");
    };
    recognition.onend = () => {
      if (generation !== speechGenerationRef.current) return;
      speechLeaseRef.current?.release();
      speechLeaseRef.current = null;
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    setNotice("Listening for one short feedback note…");
    try {
      recognition.start();
    } catch {
      stopDictation();
      setNotice("Dictation could not start. You can still type feedback.");
    }
  }

  async function submit() {
    if (!sentiment) {
      setNotice("Tap yay or nay first.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment, message, inputMethod: message.trim() ? inputMethod : "tap", surface, providerId: providerId || null }),
      });
      const body = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error?.message || "Feedback could not be saved.");
      setMessage("");
      setNotice("Thank you. Your feedback is now part of the ONE Voice Lab learning loop.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Feedback could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-black/25 p-5 shadow-2xl shadow-purple-950/20 sm:p-8" aria-labelledby="feedback-title">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-300">Fast signal, optional context</p>
        <h2 className="text-2xl font-semibold text-white" id="feedback-title">Did this help you understand voice AI?</h2>
        <p className="text-sm leading-6 text-slate-300">A tap is enough. Add a typed or dictated note only when you want to.</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3" role="group" aria-label="Feedback rating">
        <button className="min-h-14 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 font-semibold text-emerald-100 data-[selected=true]:ring-2 data-[selected=true]:ring-emerald-300" data-selected={sentiment === "yay"} type="button" onClick={() => chooseSentiment("yay")}>Yay — helpful</button>
        <button className="min-h-14 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 font-semibold text-amber-100 data-[selected=true]:ring-2 data-[selected=true]:ring-amber-300" data-selected={sentiment === "nay"} type="button" onClick={() => chooseSentiment("nay")}>Nay — needs work</button>
      </div>
      <label className="mt-5 block text-sm font-medium text-slate-200">
        Optional note
        <textarea className="mt-2 min-h-32 w-full rounded-2xl border border-white/15 bg-slate-950/80 p-4 text-base text-white outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-300/30" maxLength={2_000} placeholder="What clicked—or what felt confusing?" value={message} onChange={(event) => { setMessage(event.target.value); setInputMethod("typed"); }} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="min-h-11 rounded-xl border border-purple-300/30 bg-purple-300/10 px-4 text-sm font-semibold text-purple-100 disabled:opacity-45" disabled={!speechAvailable} type="button" onClick={toggleDictation}>{listening ? "Stop listening" : "Speak feedback"}</button>
        <span className="text-xs leading-5 text-slate-400">The browser handles speech recognition. ONE stores only the final text you submit—never raw microphone audio.</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-200">Where were you?<select className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-white" value={surface} onChange={(event) => setSurface(event.target.value)}><option value="other">General experience</option><option value="home">Home / Try</option><option value="providers">Provider comparison</option><option value="provider">Provider profile</option><option value="simulate">Simulation Lab</option><option value="build">Build</option><option value="learn">Learn</option><option value="studio">Solution Studio</option><option value="bench">Bench</option><option value="settings">Preference Center</option></select></label>
        <label className="text-sm font-medium text-slate-200">Provider context<select className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-white" value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Not provider-specific</option><option value="deepgram">Deepgram</option><option value="fish-audio">Fish Audio</option><option value="elevenlabs">ElevenLabs</option><option value="multi-provider">Multiple providers</option></select></label>
      </div>
      <button className="mt-6 min-h-12 w-full rounded-2xl bg-purple-400 px-5 font-semibold text-slate-950 transition hover:bg-purple-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !sentiment} type="button" onClick={() => void submit()}>{busy ? "Saving…" : "Send feedback"}</button>
      <p className="mt-3 min-h-6 text-sm text-slate-300" role="status" aria-live="polite">{notice}</p>
    </section>
  );
}

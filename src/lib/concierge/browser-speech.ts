import "client-only";

export const ONE_CONCIERGE_VOICE_MAX_DURATION_MS = 12_000;
export const ONE_CONCIERGE_VOICE_SILENCE_MS = 4_000;
export const ONE_CONCIERGE_VOICE_MAX_FINAL_RESULTS = 3;
export const ONE_CONCIERGE_VOICE_MAX_TRANSCRIPT_LENGTH = 240;
export const ONE_CONCIERGE_VOICE_MAX_EVENT_RESULTS = 6;
export const ONE_CONCIERGE_VOICE_MAX_RAW_TRANSCRIPT_LENGTH = ONE_CONCIERGE_VOICE_MAX_TRANSCRIPT_LENGTH * 4;

export type OneConciergeSpeechError =
  | "unsupported"
  | "permission-denied"
  | "microphone-unavailable"
  | "no-speech"
  | "timeout"
  | "cancelled"
  | "processing-failed";

type SpeechAlternativeLike = Readonly<{
  transcript?: string;
  confidence?: number;
}>;

type SpeechResultLike = Readonly<{
  0?: SpeechAlternativeLike;
  length: number;
  isFinal?: boolean;
}>;

type SpeechEventLike = Readonly<{
  resultIndex?: number;
  results: ArrayLike<SpeechResultLike>;
}>;

type SpeechErrorEventLike = Readonly<{
  error?: string;
}>;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export type OneConciergeSpeechCallbacks = Readonly<{
  onListening: () => void;
  onProcessing: () => void;
  onPartial: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError: (error: OneConciergeSpeechError) => void;
}>;

export type OneConciergeSpeechCapture = Readonly<{
  stop: () => void;
  cancel: () => void;
}>;

export function isOneConciergeSpeechSupported() {
  const browser = window as SpeechWindow;
  return Boolean(browser.SpeechRecognition ?? browser.webkitSpeechRecognition);
}

export function startOneConciergeSpeechCapture(
  callbacks: OneConciergeSpeechCallbacks,
): OneConciergeSpeechCapture | null {
  const browser = window as SpeechWindow;
  const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  if (!Recognition) {
    callbacks.onError("unsupported");
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let active = true;
  let settled = false;
  let timedOut = false;
  let stopRequested = false;
  const finalSegments: string[] = [];
  const seenFinalSegments = new Set<string>();
  let hardTimer = 0;
  let silenceTimer = 0;

  const clearTimers = () => {
    window.clearTimeout(hardTimer);
    window.clearTimeout(silenceTimer);
  };

  const terminateRecognition = () => {
    if (typeof recognition.abort === "function") {
      try {
        recognition.abort();
        return;
      } catch {
        // Fall back to stop() when abort is unavailable for the current state.
      }
    }
    try {
      recognition.stop();
    } catch {
      // Local settlement and generation invalidation still discard late results.
    }
  };

  const finishWithError = (error: OneConciergeSpeechError) => {
    if (!active || settled) return;
    settled = true;
    active = false;
    clearTimers();
    terminateRecognition();
    callbacks.onPartial("");
    callbacks.onError(error);
  };

  const finishWithTranscript = () => {
    if (!active || settled) return;
    const transcript = finalSegments.join(" ").replace(/\s+/gu, " ").trim().slice(0, ONE_CONCIERGE_VOICE_MAX_TRANSCRIPT_LENGTH);
    if (!transcript) {
      finishWithError(timedOut ? "timeout" : "no-speech");
      return;
    }
    settled = true;
    active = false;
    clearTimers();
    callbacks.onPartial("");
    callbacks.onFinal(transcript);
  };

  const requestStop = () => {
    try {
      recognition.stop();
    } catch {
      finishWithError("processing-failed");
    }
  };

  const scheduleSilenceStop = () => {
    window.clearTimeout(silenceTimer);
    silenceTimer = window.setTimeout(() => {
      if (!active || settled) return;
      stopRequested = true;
      callbacks.onProcessing();
      requestStop();
    }, ONE_CONCIERGE_VOICE_SILENCE_MS);
  };

  recognition.onstart = () => {
    if (!active || settled) return;
    callbacks.onListening();
    scheduleSilenceStop();
  };

  recognition.onresult = (event) => {
    if (!active || settled) return;
    scheduleSilenceStop();
    try {
      const reportedLength = event.results?.length;
      if (typeof reportedLength !== "number" || !Number.isSafeInteger(reportedLength) || reportedLength < 0) throw new Error("Malformed speech result length");
      const reportedStart = event.resultIndex ?? 0;
      if (typeof reportedStart !== "number" || !Number.isSafeInteger(reportedStart) || reportedStart < 0) throw new Error("Malformed speech result index");
      const startIndex = Math.min(reportedStart, reportedLength);
      const endIndex = Math.min(reportedLength, startIndex + ONE_CONCIERGE_VOICE_MAX_EVENT_RESULTS);
      let partial = "";
      for (let index = startIndex; index < endIndex; index += 1) {
        const result = event.results[index];
        if (!result || typeof result.isFinal !== "boolean") throw new Error("Malformed speech result");
        const transcriptValue = result[0]?.transcript;
        if (typeof transcriptValue !== "string") throw new Error("Malformed speech transcript");
        if (transcriptValue.length > ONE_CONCIERGE_VOICE_MAX_RAW_TRANSCRIPT_LENGTH) throw new Error("Oversized speech transcript");
        const normalizedTranscript = transcriptValue.normalize("NFKC");
        if (/[\p{Cc}\p{Cf}]/u.test(normalizedTranscript)) throw new Error("Unsafe speech transcript controls");
        const transcript = normalizedTranscript.replace(/\s+/gu, " ").trim();
        if (!transcript) continue;
        if (result.isFinal) {
          const bounded = transcript.slice(0, ONE_CONCIERGE_VOICE_MAX_TRANSCRIPT_LENGTH);
          const dedupeKey = bounded.toLocaleLowerCase("en-US");
          if (!seenFinalSegments.has(dedupeKey) && finalSegments.length < ONE_CONCIERGE_VOICE_MAX_FINAL_RESULTS) {
            seenFinalSegments.add(dedupeKey);
            finalSegments.push(bounded);
          }
        } else {
          partial = transcript.slice(0, ONE_CONCIERGE_VOICE_MAX_TRANSCRIPT_LENGTH);
        }
      }
      callbacks.onPartial(partial);
    } catch {
      finishWithError("processing-failed");
      return;
    }
    const combinedLength = finalSegments.join(" ").length;
    if (finalSegments.length >= ONE_CONCIERGE_VOICE_MAX_FINAL_RESULTS || combinedLength >= ONE_CONCIERGE_VOICE_MAX_TRANSCRIPT_LENGTH) {
      stopRequested = true;
      callbacks.onProcessing();
      requestStop();
    }
  };

  recognition.onerror = (event) => {
    if (!active || settled) return;
    finishWithError(normalizeSpeechError(event.error));
  };

  recognition.onend = () => {
    if (!active || settled) return;
    if (finalSegments.length > 0) finishWithTranscript();
    else finishWithError(timedOut ? "timeout" : stopRequested ? "no-speech" : "processing-failed");
  };

  hardTimer = window.setTimeout(() => {
    if (!active || settled) return;
    timedOut = true;
    stopRequested = true;
    callbacks.onProcessing();
    requestStop();
  }, ONE_CONCIERGE_VOICE_MAX_DURATION_MS);

  try {
    recognition.start();
  } catch {
    finishWithError("processing-failed");
  }

  return {
    stop: () => {
      if (!active || settled) return;
      stopRequested = true;
      callbacks.onProcessing();
      requestStop();
    },
    cancel: () => {
      if (!active || settled) return;
      settled = true;
      active = false;
      clearTimers();
      callbacks.onPartial("");
      terminateRecognition();
      callbacks.onError("cancelled");
    },
  };
}

function normalizeSpeechError(error: string | undefined): OneConciergeSpeechError {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission-denied";
    case "audio-capture":
      return "microphone-unavailable";
    case "no-speech":
      return "no-speech";
    case "aborted":
      return "cancelled";
    default:
      return "processing-failed";
  }
}

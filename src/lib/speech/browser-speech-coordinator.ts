import "client-only";

export type BrowserSpeechCaptureLease = Readonly<{
  release: () => void;
}>;

type ActiveCapture = {
  token: symbol;
  cancel: () => void;
};

let activeCapture: ActiveCapture | null = null;

export function cancelActiveBrowserSpeechCapture() {
  const capture = activeCapture;
  activeCapture = null;
  capture?.cancel();
}

/** Keeps browser speech recognition single-flight within the current tab. */
export function claimBrowserSpeechCapture(cancel: () => void): BrowserSpeechCaptureLease {
  cancelActiveBrowserSpeechCapture();
  const token = Symbol("one-browser-speech-capture");
  activeCapture = { token, cancel };
  return {
    release: () => {
      if (activeCapture?.token === token) activeCapture = null;
    },
  };
}

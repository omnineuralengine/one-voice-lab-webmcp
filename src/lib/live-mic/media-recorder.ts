export const MEDIA_RECORDER_MIME_TYPE_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

export type PreferredMediaRecorderMimeType = (typeof MEDIA_RECORDER_MIME_TYPE_PREFERENCES)[number];

export type MediaRecorderMimeCandidate = {
  mimeType: PreferredMediaRecorderMimeType;
  supported: boolean;
};

export type MediaRecorderMimeSelection = {
  mimeType: PreferredMediaRecorderMimeType | "";
  displayMimeType: string;
  mediaRecorderSupported: boolean;
  usesBrowserDefault: boolean;
  candidates: MediaRecorderMimeCandidate[];
};

export type CreatedMediaRecorder = {
  recorder: MediaRecorder;
  mimeType: string;
  selection: MediaRecorderMimeSelection;
};

function resolveMediaRecorderClass(override?: typeof MediaRecorder): typeof MediaRecorder | null {
  if (override) {
    return override;
  }

  return typeof MediaRecorder === "undefined" ? null : MediaRecorder;
}

function safelySupportsMimeType(recorderClass: typeof MediaRecorder, mimeType: string) {
  try {
    return recorderClass.isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

export function selectMediaRecorderMimeType(recorderClassOverride?: typeof MediaRecorder): MediaRecorderMimeSelection {
  const recorderClass = resolveMediaRecorderClass(recorderClassOverride);
  const candidates = MEDIA_RECORDER_MIME_TYPE_PREFERENCES.map((mimeType) => ({
    mimeType,
    supported: recorderClass ? safelySupportsMimeType(recorderClass, mimeType) : false,
  }));
  const selected = candidates.find((candidate) => candidate.supported)?.mimeType ?? "";

  return {
    mimeType: selected,
    displayMimeType: selected || "browser default",
    mediaRecorderSupported: Boolean(recorderClass),
    usesBrowserDefault: selected === "",
    candidates,
  };
}

export function createMediaRecorder(
  stream: MediaStream,
  selection = selectMediaRecorderMimeType(),
  recorderClassOverride?: typeof MediaRecorder,
): CreatedMediaRecorder {
  const recorderClass = resolveMediaRecorderClass(recorderClassOverride);

  if (!recorderClass) {
    throw new Error("MediaRecorder is not supported in this browser. Try a current version of Chrome, Edge, Firefox, or Safari.");
  }

  if (selection.mimeType && !safelySupportsMimeType(recorderClass, selection.mimeType)) {
    throw new Error(`MediaRecorder does not support the selected MIME type: ${selection.mimeType}.`);
  }

  const recorder = selection.mimeType
    ? new recorderClass(stream, { mimeType: selection.mimeType })
    : new recorderClass(stream);
  const mimeType = recorder.mimeType || selection.mimeType;

  return {
    recorder,
    mimeType: mimeType || "browser default",
    selection,
  };
}

export function normalizeMediaRecorderMimeType(mimeType: string) {
  return mimeType
    .trim()
    .toLowerCase()
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(";");
}

export function isContainerizedMediaRecorderMimeType(mimeType: string) {
  const normalized = normalizeMediaRecorderMimeType(mimeType);
  const mediaType = normalized.split(";", 1)[0];

  return mediaType === "audio/webm" || mediaType === "audio/ogg" || mediaType === "audio/mp4";
}

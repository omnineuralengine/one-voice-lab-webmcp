export const AUDIO_UPLOAD_LIMITS = {
  local: 100 * 1024 * 1024,
  hosted: 10 * 1024 * 1024,
} as const;

export const SUPPORTED_AUDIO_EXTENSIONS = [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm", ".aac"] as const;

export const SUPPORTED_AUDIO_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "application/ogg",
  "audio/webm",
  "audio/aac",
  "audio/x-aac",
] as const;

export const AUDIO_FILE_ACCEPT = SUPPORTED_AUDIO_EXTENSIONS.join(",");

export type AudioUploadMode = "local" | "hosted";

export type AudioValidationErrorCode =
  | "duplicate"
  | "empty"
  | "too-large"
  | "unsupported"
  | "unreadable";

export type AudioValidationResult =
  | {
      ok: true;
      extension: string;
      mimeType: string;
      format: string;
      validationSource: "mime-and-signature" | "extension-and-signature";
      warning?: string;
    }
  | {
      ok: false;
      code: AudioValidationErrorCode;
      message: string;
    };

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const SUPPORTED_MIME_SET = new Set<string>(SUPPORTED_AUDIO_MIME_TYPES);
const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_AUDIO_EXTENSIONS);

export function audioUploadLimit(mode: AudioUploadMode) {
  return AUDIO_UPLOAD_LIMITS[mode];
}

export function audioUploadLimitLabel(mode: AudioUploadMode) {
  return `${Math.round(audioUploadLimit(mode) / 1024 / 1024)} MB`;
}

export async function validateAudioFile(
  file: File,
  options: { mode: AudioUploadMode; currentFile?: File | null },
): Promise<AudioValidationResult> {
  if (options.currentFile && isSameFile(file, options.currentFile)) {
    return { ok: false, code: "duplicate", message: "This audio file is already selected." };
  }

  if (file.size === 0) {
    return { ok: false, code: "empty", message: "File is empty" };
  }

  if (file.size > audioUploadLimit(options.mode)) {
    return {
      ok: false,
      code: "too-large",
      message: options.mode === "hosted" ? "File exceeds the hosted upload limit" : `File exceeds the ${audioUploadLimitLabel("local")} local upload limit`,
    };
  }

  const extension = fileExtension(file.name);
  const mimeType = file.type.trim().toLowerCase().split(";", 1)[0].trim();
  const genericMime = GENERIC_MIME_TYPES.has(mimeType);
  const supportedExtension = SUPPORTED_EXTENSION_SET.has(extension);
  const supportedMime = SUPPORTED_MIME_SET.has(mimeType);

  if ((!genericMime && !supportedMime) || (genericMime && !supportedExtension)) {
    return { ok: false, code: "unsupported", message: "Unsupported audio format" };
  }

  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    return { ok: false, code: "unreadable", message: "File could not be read" };
  }

  const detectedExtension = extensionForSignature(header);
  if (!detectedExtension || (supportedExtension && !signatureMatchesExtension(detectedExtension, extension))) {
    return { ok: false, code: "unsupported", message: "Unsupported audio format" };
  }

  if (!genericMime && !mimeMatchesSignature(mimeType, detectedExtension)) {
    return { ok: false, code: "unsupported", message: "Unsupported audio format" };
  }

  const inferred = genericMime;
  return {
    ok: true,
    extension: detectedExtension,
    mimeType: inferred ? mimeForExtension(detectedExtension) : mimeType,
    format: detectedExtension.slice(1).toUpperCase(),
    validationSource: inferred ? "extension-and-signature" : "mime-and-signature",
    warning: inferred ? "MIME type was unavailable; format validation was inferred from the extension and file signature." : undefined,
  };
}

export function isSameFile(a: File, b: File) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function extensionForSignature(bytes: Uint8Array) {
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return ".wav";
  if (ascii(bytes, 0, 4) === "fLaC") return ".flac";
  if (ascii(bytes, 0, 4) === "OggS") return ".ogg";
  if (ascii(bytes, 4, 8) === "ftyp") return ".m4a";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return ".webm";
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return ".aac";
    return ".mp3";
  }
  return "";
}

function signatureMatchesExtension(detected: string, declared: string) {
  return detected === declared;
}

function mimeMatchesSignature(mimeType: string, extension: string) {
  const allowedByExtension: Record<string, readonly string[]> = {
    ".wav": ["audio/wav", "audio/x-wav", "audio/wave"],
    ".mp3": ["audio/mpeg", "audio/mp3"],
    ".m4a": ["audio/mp4", "audio/x-m4a"],
    ".flac": ["audio/flac", "audio/x-flac"],
    ".ogg": ["audio/ogg", "application/ogg"],
    ".webm": ["audio/webm"],
    ".aac": ["audio/aac", "audio/x-aac"],
  };
  return allowedByExtension[extension]?.includes(mimeType) ?? false;
}

function mimeForExtension(extension: string) {
  return ({
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".aac": "audio/aac",
  } as Record<string, string>)[extension] || "application/octet-stream";
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

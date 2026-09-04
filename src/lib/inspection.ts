export type SanitizedHeaders = Record<string, string>;

export type InspectorRequest = {
  method: string;
  endpoint: string;
  query?: Record<string, string>;
  headers?: SanitizedHeaders;
  bodyPreview?: unknown;
};

export type InspectorResponse = {
  status: number;
  headers?: SanitizedHeaders;
  bodyPreview?: unknown;
};

export type InspectorTimelineEvent = {
  at: string;
  type: string;
  label: string;
  detail?: string;
  data?: unknown;
};

export type InspectorRecord = {
  id: string;
  module: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  request: InspectorRequest;
  response: InspectorResponse;
  timeline: InspectorTimelineEvent[];
  notes: string[];
};

export type ApiDebugEnvelope<TData = unknown> = {
  ok: boolean;
  data?: TData;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
  inspector: InspectorRecord;
};

const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|access[_-]?token|token|secret|password|cookie|set-cookie)/i;

export function nowIso() {
  return new Date().toISOString();
}

export function createTimelineEvent({
  type,
  label,
  detail,
  data,
  at = nowIso(),
}: {
  type: string;
  label: string;
  detail?: string;
  data?: unknown;
  at?: string;
}): InspectorTimelineEvent {
  return {
    at,
    type,
    label,
    detail,
    data: redactSecrets(data),
  };
}

export function sanitizeHeaders(headers?: Headers | Record<string, string | number | undefined | null>): SanitizedHeaders {
  if (!headers) {
    return {};
  }

  const entries =
    headers instanceof Headers
      ? Array.from(headers.entries())
      : Object.entries(headers).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== null);

  return entries.reduce<SanitizedHeaders>((accumulator, [key, value]) => {
    accumulator[key] = SENSITIVE_KEY_PATTERN.test(key) ? redactHeaderValue(key) : String(value);
    return accumulator;
  }, {});
}

export function sanitizeUrl(input: string | URL) {
  const url = new URL(input.toString());

  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      url.searchParams.set(key, "***redacted***");
    }
  }

  return url.toString();
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return redactString(value) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((accumulator, [key, item]) => {
    accumulator[key] = SENSITIVE_KEY_PATTERN.test(key) ? "***redacted***" : redactSecrets(item);
    return accumulator;
  }, {}) as T;
}

export function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function calculateDurationMs(startedAt: string, completedAt: string) {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildInspectorRecord({
  id = cryptoRandomId(),
  module,
  startedAt,
  completedAt,
  request,
  response,
  timeline,
  notes,
}: {
  id?: string;
  module: string;
  startedAt: string;
  completedAt: string;
  request: InspectorRequest;
  response: InspectorResponse;
  timeline: InspectorTimelineEvent[];
  notes: string[];
}): InspectorRecord {
  return {
    id,
    module,
    startedAt,
    completedAt,
    durationMs: calculateDurationMs(startedAt, completedAt),
    request: {
      ...request,
      endpoint: sanitizeUrl(request.endpoint),
      headers: sanitizeHeaders(request.headers),
      bodyPreview: redactSecrets(request.bodyPreview),
    },
    response: {
      ...response,
      headers: sanitizeHeaders(response.headers),
      bodyPreview: redactSecrets(response.bodyPreview),
    },
    timeline: timeline.map((event) => ({
      ...event,
      data: redactSecrets(event.data),
    })),
    notes,
  };
}

export function buildApiDebugEnvelope<TData>({
  ok,
  data,
  error,
  inspector,
}: {
  ok: boolean;
  data?: TData;
  error?: ApiDebugEnvelope<TData>["error"];
  inspector: InspectorRecord;
}): ApiDebugEnvelope<TData> {
  return {
    ok,
    data,
    error: error ? redactSecrets(error) : undefined,
    inspector,
  };
}

export function queryFromUrl(input: string | URL) {
  const url = new URL(input.toString());
  return Object.fromEntries(url.searchParams.entries());
}

function redactHeaderValue(key: string) {
  return key.toLowerCase() === "authorization" ? "Token ***redacted***" : "***redacted***";
}

function redactString(value: string) {
  return value.replace(/(Token|Bearer)\s+[A-Za-z0-9._~-]+/gi, (_match, scheme: string) => `${scheme} ***redacted***`);
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `insp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

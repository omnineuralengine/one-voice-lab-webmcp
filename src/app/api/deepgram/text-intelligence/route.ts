import { checkLabAccess, labAccessResponse, runWithLabConcurrency } from "@/lib/access/lab-access";
import {
  analyzeText,
  DeepgramValidationError,
  formatRouteError,
  type NormalizedTextIntelligenceOptions,
  type TextIntelligenceRequest,
} from "@/lib/deepgram";
import {
  buildApiDebugEnvelope,
  buildInspectorRecord,
  createTimelineEvent,
  nowIso,
  queryFromUrl,
} from "@/lib/inspection";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const MAX_REQUEST_BYTES = 16 * 1_024;
const MAX_LAB_TEXT_CHARS = 10_000;
const DEFAULT_OPTIONS: NormalizedTextIntelligenceOptions = {
  summarize: true,
  topics: true,
  intents: true,
  sentiment: true,
};

export async function POST(request: Request) {
  const startedAt = nowIso();
  let payload = {} as Partial<TextIntelligenceRequest>;
  let endpoint = buildReadEndpointPreview(DEFAULT_OPTIONS);
  let options = DEFAULT_OPTIONS;
  const timeline = [
    createTimelineEvent({
      type: "route.received",
      label: "Text Intelligence analysis requested",
      detail: "The browser sent text and feature toggles to the local server route.",
      at: startedAt,
    }),
  ];

  try {
    payload = await readRequestPayload(request);
    options = featurePreview(payload);
    endpoint = buildReadEndpointPreview(options, typeof payload.language === "string" ? payload.language : "en");
    const textLength = typeof payload.text === "string" ? payload.text.trim().length : 0;
    if (!textLength) throw new DeepgramValidationError("Enter text before running Text Intelligence.");
    if (textLength > MAX_LAB_TEXT_CHARS) {
      throw new DeepgramValidationError(`Text Intelligence requests are limited to ${MAX_LAB_TEXT_CHARS.toLocaleString()} characters in this Lab.`, 413);
    }
    const access = await checkLabAccess(request, "ai_reasoning", {
      providerId: "deepgram",
      endpointId: "deepgram:text-intelligence",
      units: Math.max(1, textLength),
      actorIntent: "human",
    });
    if (!access.allowed) return labAccessResponse(access);
    timeline.push(
      createTimelineEvent({
        type: "deepgram.request",
        label: "Sending text to Deepgram Read",
        data: {
          endpoint,
          textLength,
          requestedFeatures: featurePreview(payload),
        },
      }),
    );

    const run = await runWithLabConcurrency(request, "ai_reasoning", {
      providerId: "deepgram",
      endpointId: "deepgram:text-intelligence",
      actorIntent: "human",
    }, () => analyzeText(payload as TextIntelligenceRequest));
    if (!run.ok) return labAccessResponse(run.decision);
    const result = run.value;
    endpoint = result.endpoint;
    options = result.options;
    const completedAt = nowIso();
    const metadata = extractMetadata(result.raw);
    const inspector = buildInspectorRecord({
      module: "Text Intelligence",
      startedAt,
      completedAt,
      request: {
        method: "POST",
        endpoint,
        query: queryFromUrl(endpoint),
        headers: {
          Authorization: "Token server-side-key",
          "Content-Type": "application/json",
        },
        bodyPreview: buildTextPreview(payload.text, options, result.language),
      },
      response: {
        status: 200,
        headers: { "Content-Type": "application/json" },
        bodyPreview: result.raw,
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "deepgram.response",
          label: "Text Intelligence response received",
          data: metadata,
        }),
      ],
      notes: [
        "Text Intelligence accepts text that already exists; use Speech to Text first when the source is audio.",
        "Feature switches are sent as query parameters while the JSON body contains only the text field.",
        "The browser calls this local route. DEEPGRAM_API_KEY remains server-side and Authorization is redacted.",
        "Automated summaries, topics, intents, and sentiment should support human judgment, not replace it in high-stakes workflows.",
      ],
    });

    return Response.json(buildApiDebugEnvelope({ ok: true, data: result.raw, inspector }), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const { status, body } = formatRouteError(error);
    const completedAt = nowIso();
    const inspector = buildInspectorRecord({
      module: "Text Intelligence",
      startedAt,
      completedAt,
      request: {
        method: "POST",
        endpoint,
        query: queryFromUrl(endpoint),
        headers: {
          Authorization: "Token server-side-key",
          "Content-Type": "application/json",
        },
        bodyPreview: buildTextPreview(payload.text, featurePreview(payload), typeof payload.language === "string" ? payload.language : "en"),
      },
      response: {
        status,
        bodyPreview: body,
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "text-intelligence.error",
          label: body.message,
          data: body,
        }),
      ],
      notes: [
        "Send a non-empty text field and boolean feature toggles.",
        "If Deepgram rejects a feature option, verify the current Text Intelligence API reference before production use.",
        "DEEPGRAM_API_KEY is read only inside the server helper and is never included in this response.",
      ],
    });

    return Response.json(
      buildApiDebugEnvelope({
        ok: false,
        error: { message: body.message, code: String(status), details: body.details },
        inspector,
      }),
      { status, headers: NO_STORE_HEADERS },
    );
  }
}

async function readRequestPayload(request: Request): Promise<Partial<TextIntelligenceRequest>> {
  let value: unknown;

  try {
    value = JSON.parse(await readBoundedRequestText(request, MAX_REQUEST_BYTES)) as unknown;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new DeepgramValidationError("Text Intelligence requests are limited to 16 KB.", 413);
    }
    throw new DeepgramValidationError("Send a valid JSON request body.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeepgramValidationError("Send a JSON object containing text and feature options.");
  }

  return value as Partial<TextIntelligenceRequest>;
}

function buildReadEndpointPreview(options: Partial<NormalizedTextIntelligenceOptions>, language = "en") {
  const endpoint = new URL("https://api.deepgram.com/v1/read");
  endpoint.searchParams.set("language", language);

  if (options.summarize !== false) {
    endpoint.searchParams.set("summarize", "true");
  }

  if (options.topics !== false) {
    endpoint.searchParams.set("topics", "true");
  }

  if (options.intents !== false) {
    endpoint.searchParams.set("intents", "true");
  }

  if (options.sentiment !== false) {
    endpoint.searchParams.set("sentiment", "true");
  }

  return endpoint.toString();
}

function featurePreview(payload: Partial<TextIntelligenceRequest>): NormalizedTextIntelligenceOptions {
  const features = isRecord(payload.features) ? payload.features : {};
  const requestOptions = isRecord(payload.options) ? payload.options : {};

  return {
    summarize: readPreviewBoolean(requestOptions.summarize ?? features.summarize ?? payload.summarize),
    topics: readPreviewBoolean(requestOptions.topics ?? features.topics ?? payload.topics),
    intents: readPreviewBoolean(requestOptions.intents ?? features.intents ?? payload.intents),
    sentiment: readPreviewBoolean(requestOptions.sentiment ?? features.sentiment ?? payload.sentiment),
  };
}

function readPreviewBoolean(value: unknown) {
  return value === undefined ? true : value === true;
}

function buildTextPreview(text: unknown, options: Partial<NormalizedTextIntelligenceOptions>, language: string) {
  const value = typeof text === "string" ? text.trim() : "";
  return {
    textLength: value.length,
    textPreview: value.slice(0, 500),
    truncated: value.length > 500,
    featureOptions: options,
    language,
  };
}

function extractMetadata(raw: unknown) {
  if (!isRecord(raw) || !isRecord(raw.metadata)) {
    return { request_id: undefined };
  }

  return { request_id: raw.metadata.request_id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

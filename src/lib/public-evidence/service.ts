import { z } from "zod";

import type { ActionError } from "@/lib/actions/contracts";
import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import {
  createPublicEnvelopeSchema,
  PUBLIC_REGISTRY_LAST_VERIFIED_AT,
  PUBLIC_SCHEMA_VERSION,
  publicErrorSchema,
  type PublicEvidenceType,
} from "@/lib/public-evidence/schemas";

const PUBLIC_GET_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

export function createPublicEnvelope<TSchema extends z.ZodType>({
  dataSchema,
  data,
  path,
  evidenceType,
  lastVerifiedAt = PUBLIC_REGISTRY_LAST_VERIFIED_AT,
  environment = process.env,
}: {
  dataSchema: TSchema;
  data: z.input<TSchema>;
  path: string;
  evidenceType: PublicEvidenceType;
  lastVerifiedAt?: string;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  return createPublicEnvelopeSchema(dataSchema).parse({
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    canonicalUrl: getCanonicalUrl(path, environment),
    evidenceType,
    lastVerifiedAt,
    data,
  });
}
export function publicJsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", PUBLIC_GET_CACHE_CONTROL);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(value, { ...init, headers });
}

export function publicNoStoreJsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(value, { ...init, headers });
}

export function publicNotFound(message: string): Response {
  return publicNoStoreJsonResponse(publicErrorSchema.parse({
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    error: { code: "not_found", message },
  }), { status: 404 });
}

export function publicActionErrorResponse(error: ActionError, status?: number): Response {
  const resolvedStatus = status ?? statusForActionError(error);
  return publicNoStoreJsonResponse({
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    error: {
      code: error.code,
      category: error.category,
      message: error.message,
      retryable: error.retryable,
      ...(error.issues ? { issues: error.issues } : {}),
    },
  }, { status: resolvedStatus });
}

function statusForActionError(error: ActionError): number {
  if (error.category === "validation") return 400;
  if (error.category === "authentication") return 401;
  if (error.category === "permission") return 403;
  if (error.category === "rate-limit") return 429;
  if (error.category === "provider") return 502;
  if (error.category === "cancelled") return 409;
  if (error.category === "timeout") return 504;
  if (error.category === "unavailable") return 503;
  return 500;
}

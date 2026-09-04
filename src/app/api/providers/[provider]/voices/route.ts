import { z } from "zod";

import { enforceProviderLabAccess, minimumTierInProduction } from "@/lib/access/lab-access";
import { getProviderAdapterRegistration, resolveCatalogAdapter } from "@/lib/providers/adapters";
import { ProviderOperationError } from "@/lib/providers/errors";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { providerErrorResponse, providerOperationMeta } from "@/lib/providers/operations";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

const querySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(80).optional(),
  nextPageToken: z.string().trim().max(1_024).optional(),
}).strict();

type ProviderRouteContext = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: ProviderRouteContext) {
  const { provider } = await context.params;
  const startedAt = Date.now();
  try {
    if (provider === "cartesia") {
      throw new ProviderOperationError({
        code: "provider_demo_only",
        message: "Cartesia voice discovery is available only through ONE's protected Evaluate workspace in this phase.",
        status: 503,
        providerId: provider,
        operation: "voices",
      });
    }
    const discovery = getProviderAdapterRegistration(provider)?.normalizedDiscovery;
    await enforceProviderLabAccess(request, provider, "voices", {
      // Account-scoped discovery never exposes an operator account's catalog
      // to anonymous hosted callers, regardless of the provider implementation.
      ...(discovery?.voiceVisibility === "account-scoped"
        ? { minimumTier: minimumTierInProduction("verified") }
        : {}),
    });
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw new ProviderOperationError({
        code: "invalid_request",
        message: "Use bounded voice search and pagination parameters only.",
        status: 400,
        providerId: provider,
        operation: "voices",
      });
    }
    const adapter = resolveCatalogAdapter(provider, "voices");
    const authorization = adapter.voicesRequireExecutionAuthorization
      ? await authorizeProviderExecution(provider, "voices")
      : undefined;
    const data = await withProviderRequestGuard(request, provider, "voices", () => (
      adapter.listVoices(parsed.data, { signal: request.signal, authorization })
    ));
    return Response.json({
      ok: true,
      data,
      meta: providerOperationMeta({
        provider,
        operation: "voices",
        startedAt,
        success: true,
        status: 200,
        requestMode: data.discoveryState ?? "live",
        executionDecision: authorization ? "allowed" : "not-evaluated",
        providerRequestSent: data.discoveryState
          ? data.discoveryState === "live"
          : adapter.voicesRequireExecutionAuthorization === true,
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return providerErrorResponse(error, { provider, operation: "voices", startedAt });
  }
}

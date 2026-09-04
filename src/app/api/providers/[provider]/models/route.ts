import { enforceProviderLabAccess, minimumTierInProduction } from "@/lib/access/lab-access";
import { getProviderAdapterRegistration, resolveCatalogAdapter } from "@/lib/providers/adapters";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { providerErrorResponse, providerOperationMeta } from "@/lib/providers/operations";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

type ProviderRouteContext = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: ProviderRouteContext) {
  const { provider } = await context.params;
  const startedAt = Date.now();
  try {
    const discovery = getProviderAdapterRegistration(provider)?.normalizedDiscovery;
    await enforceProviderLabAccess(request, provider, "models", {
      ...(discovery?.modelVisibility === "account-scoped"
        ? { minimumTier: minimumTierInProduction("verified") }
        : {}),
    });
    const adapter = resolveCatalogAdapter(provider, "models");
    const authorization = adapter.modelsRequireExecutionAuthorization
      ? await authorizeProviderExecution(provider, "models")
      : undefined;
    const data = await withProviderRequestGuard(request, provider, "models", () => (
      adapter.listModels({ signal: request.signal, authorization })
    ));
    return Response.json({
      ok: true,
      data,
      meta: providerOperationMeta({
        provider,
        operation: "models",
        startedAt,
        success: true,
        status: 200,
        requestMode: data.discoveryState ?? (adapter.modelsRequireExecutionAuthorization ? "live" : "static"),
        executionDecision: authorization ? "allowed" : "not-evaluated",
        providerRequestSent: data.discoveryState
          ? data.discoveryState === "live"
          : adapter.modelsRequireExecutionAuthorization === true,
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return providerErrorResponse(error, { provider, operation: "models", startedAt });
  }
}

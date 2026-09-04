import {
  handleProviderTtsDelete,
  handleProviderTtsGet,
  handleProviderTtsPost,
} from "@/lib/providers/tts-route-handler";
import { handleProviderTtsAudioPost } from "@/lib/providers/tts-audio-route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProviderRouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: ProviderRouteContext) {
  const { provider } = await context.params;
  if (provider === "cartesia") return cartesiaEvaluateOnly();
  if (isDirectAudioProvider(provider)) return handleProviderTtsAudioPost(request, provider);
  return handleProviderTtsPost(request, provider, `/api/providers/${encodeURIComponent(provider)}/tts`);
}

export async function GET(request: Request, context: ProviderRouteContext) {
  const { provider } = await context.params;
  if (isDirectAudioProvider(provider)) return methodNotAllowed(provider);
  return handleProviderTtsGet(request, provider);
}

export async function DELETE(request: Request, context: ProviderRouteContext) {
  const { provider } = await context.params;
  if (isDirectAudioProvider(provider)) return methodNotAllowed(provider);
  return handleProviderTtsDelete(request, provider);
}

function methodNotAllowed(provider: string) {
  const displayName = provider === "fish-audio"
    ? "Fish Audio"
    : provider === "cartesia"
      ? "Cartesia"
      : "ElevenLabs";
  return Response.json(
    { ok: false, error: { code: "method_not_allowed", message: `Generated ${displayName} audio is returned directly and is not persisted by this route.` } },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}

function isDirectAudioProvider(provider: string): boolean {
  return provider === "elevenlabs" || provider === "fish-audio" || provider === "cartesia";
}

function cartesiaEvaluateOnly() {
  return Response.json(
    {
      ok: false,
      error: {
        code: "provider_demo_only",
        message: "Cartesia synthesis is available only through ONE's protected Evaluate workspace in this phase.",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

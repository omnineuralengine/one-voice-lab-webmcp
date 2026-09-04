import {
  handleProviderTtsDelete,
  handleProviderTtsGet,
  handleProviderTtsPost,
} from "@/lib/providers/tts-route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return handleProviderTtsPost(request, "deepgram", "/api/deepgram/tts");
}

export function GET(request: Request) {
  return handleProviderTtsGet(request, "deepgram");
}

export function DELETE(request: Request) {
  return handleProviderTtsDelete(request, "deepgram");
}

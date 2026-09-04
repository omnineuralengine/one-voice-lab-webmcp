export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

export async function POST(_request: Request) {
  void _request;
  return Response.json({
    ok: false,
    error: {
      code: "url_transcription_disabled",
      message: "URL-based transcription is disabled until ONE can verify media duration before provider dispatch.",
    },
  }, { status: 503, headers: NO_STORE });
}

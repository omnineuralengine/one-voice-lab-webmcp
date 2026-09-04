import "server-only";

export { humanAuthMessage, normalizedAuthErrorCode } from "@/lib/auth/errors";

export function privateAuthJson(body: unknown, status = 200, additionalHeaders?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      ...Object.fromEntries(new Headers(additionalHeaders).entries()),
    },
  });
}

export function authErrorResponse(status: number, code: string, message: string) {
  return privateAuthJson({ ok: false, error: { code, message } }, status);
}

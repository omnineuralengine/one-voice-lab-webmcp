export function isSameSiteRequest(
  request: Request,
  options: { requireBrowserSignal?: boolean; allowHostHeaderFallback?: boolean } = {},
): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      if (originUrl.origin === requestUrl.origin) return true;

      // Next's development/reverse-proxy boundary can expose an internal
      // request URL while retaining the browser-visible Host. Keep this
      // fallback opt-in and require the browser's stronger same-origin signal.
      if (!options.allowHostHeaderFallback || fetchSite !== "same-origin") return false;
      const host = request.headers.get("host")?.trim().toLowerCase();
      const forwardedProtocol = request.headers.get("x-forwarded-proto")
        ?.split(",", 1)[0]
        ?.trim()
        .toLowerCase();
      const protocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
      return Boolean(host)
        && originUrl.host.toLowerCase() === host
        && originUrl.protocol === protocol;
    } catch {
      return false;
    }
  }

  if (options.requireBrowserSignal) return fetchSite === "same-origin" || fetchSite === "same-site";
  return true;
}

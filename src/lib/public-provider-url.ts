const MAX_PROVIDER_URL_LENGTH = 2_048;
const PRIVATE_HOST_SUFFIXES = [".internal", ".lan", ".local", ".localhost", ".home", ".arpa"];

export class PublicProviderUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicProviderUrlError";
  }
}

export function normalizePublicProviderFetchUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_PROVIDER_URL_LENGTH) {
    throw new PublicProviderUrlError("Provide a public HTTP or HTTPS URL under 2,048 characters.");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new PublicProviderUrlError("Provide a valid public HTTP or HTTPS URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicProviderUrlError("Only public HTTP and HTTPS URLs are supported.");
  }
  if (url.username || url.password) {
    throw new PublicProviderUrlError("Credential-bearing media URLs are not accepted.");
  }
  if (url.hash) {
    throw new PublicProviderUrlError("Remove URL fragments before submitting media.");
  }
  if ((url.protocol === "http:" && url.port && url.port !== "80")
    || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new PublicProviderUrlError("Only standard HTTP and HTTPS ports are supported.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isPrivateOrReservedHostname(hostname)) {
    throw new PublicProviderUrlError("Private, local, and reserved network destinations are not accepted.");
  }

  return url.toString();
}

function isPrivateOrReservedHostname(hostname: string): boolean {
  if (!hostname || hostname === "localhost" || PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  if (hostname === "metadata.google.internal" || hostname === "metadata.aws.internal") return true;

  // URL parsers canonicalize unusual IPv4 spellings before this point, so the
  // ordinary octet checks also cover aliases such as 2130706433.
  if (/^\d+(?:\.\d+){3}$/.test(hostname)) return isPrivateOrReservedIpv4(hostname);
  if (hostname.includes(":")) return true;

  // Single-label names are normally local resolver targets, not public hosts.
  return !hostname.includes(".");
}

function isPrivateOrReservedIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second, third] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

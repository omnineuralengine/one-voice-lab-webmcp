export type NormalizedAuthErrorCode =
  | "rate_limited"
  | "invalid_credentials"
  | "expired_or_reused"
  | "provider_unavailable"
  | "auth_unavailable";

export function normalizedAuthErrorCode(error: unknown): NormalizedAuthErrorCode {
  if (!error || typeof error !== "object") return "auth_unavailable";
  const candidate = error as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const status = typeof candidate.status === "number" ? candidate.status : 0;
  if (status === 429 || code.includes("rate")) return "rate_limited";
  if (code.includes("expired") || code.includes("otp_expired") || code.includes("same_password")) return "expired_or_reused";
  if (status === 400 || status === 401 || code.includes("invalid") || code.includes("credentials")) return "invalid_credentials";
  if (status >= 500) return "provider_unavailable";
  return "auth_unavailable";
}

export function humanAuthMessage(code: NormalizedAuthErrorCode) {
  switch (code) {
    case "rate_limited":
      return "Too many sign-in attempts. Wait a moment before trying again.";
    case "invalid_credentials":
      return "Sign-in could not be completed with those details.";
    case "expired_or_reused":
      return "That sign-in link or code is no longer valid. Request a new one.";
    case "provider_unavailable":
    case "auth_unavailable":
      return "Sign-in is temporarily unavailable. Guest Mode still works on this device.";
  }
}

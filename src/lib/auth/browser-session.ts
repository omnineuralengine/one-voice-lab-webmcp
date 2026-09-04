export type BrowserSignOut = (
  options?: { scope?: "global" | "local" | "others" },
) => Promise<{ error: unknown }>;

/**
 * End browser access without claiming success when Supabase cannot confirm that
 * session material was removed. A local-only fallback is sufficient to remove
 * this device's authority when remote revocation is temporarily unavailable.
 */
export async function endBrowserAuthSession(
  signOut: BrowserSignOut,
): Promise<"signed-out" | "unavailable"> {
  try {
    const globalResult = await signOut();
    if (!globalResult.error) return "signed-out";
  } catch {
    // Continue to the local session-removal fallback.
  }

  try {
    const localResult = await signOut({ scope: "local" });
    return localResult.error ? "unavailable" : "signed-out";
  } catch {
    return "unavailable";
  }
}

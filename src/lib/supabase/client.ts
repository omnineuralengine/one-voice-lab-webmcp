import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null | undefined;

export function getOneSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;
  const config = getPublicSupabaseConfig();
  browserClient = config ? createBrowserClient(config.url, config.publishableKey) : null;
  return browserClient;
}

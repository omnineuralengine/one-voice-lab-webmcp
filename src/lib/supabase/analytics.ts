import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { classifyViewerEvent, type ViewerEventInput } from "@/lib/analytics/viewer-events";
import { getViewerAnalyticsSupabaseConfig } from "@/lib/supabase/config";

let analyticsClient: SupabaseClient | null | undefined;

function getViewerAnalyticsClient() {
  if (analyticsClient !== undefined) return analyticsClient;
  const config = getViewerAnalyticsSupabaseConfig();
  analyticsClient = config
    ? createClient(config.url, config.publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    })
    : null;
  return analyticsClient;
}

export async function insertViewerEvent(input: ViewerEventInput): Promise<
  { status: "recorded" } | { status: "not_configured" } | { status: "failed"; code: string }
> {
  const client = getViewerAnalyticsClient();
  const guardToken = process.env.LAB_USAGE_GUARD_TOKEN?.trim();
  if (!client || !guardToken) return { status: "not_configured" };

  const row = classifyViewerEvent(input);
  const { error } = await client.rpc("record_viewer_event", {
    p_event_name: row.event_name,
    p_surface: row.surface,
    p_provider_id: row.provider_id,
    p_guard_token: guardToken,
  });
  if (error) return { status: "failed", code: error.code || "viewer_event_insert_failed" };
  return { status: "recorded" };
}

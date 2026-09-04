import { authErrorResponse, privateAuthJson } from "@/lib/auth/http";
import { resolveHumanIdentity } from "@/lib/auth/human-identity";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import { recordAuthEvent } from "@/lib/auth/observability";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return authErrorResponse(403, "cross_origin", "Account export accepts same-site requests only.");
  }
  const client = await getOneSupabaseServerClient();
  const identity = await resolveHumanIdentity(client);
  if (identity.kind !== "human" || !client) {
    return authErrorResponse(
      identity.kind === "unavailable" ? 503 : 401,
      identity.kind === "unavailable" ? "auth_unavailable" : "authentication_required",
      identity.kind === "unavailable" ? "Account verification is temporarily unavailable." : "Sign in to export account-owned data.",
    );
  }

  const humanId = identity.humanId;
  const [profile, preferences, notifications, readState, experiments] = await Promise.all([
    client.from("profiles").select("display_name,avatar_url,created_at,updated_at").eq("id", humanId).maybeSingle(),
    client.from("user_preferences").select("primary_hex,secondary_hex,appearance,reduced_motion,interface_depth,default_module,favorite_provider_ids,hidden_provider_ids,preferred_provider_order,default_stt_provider_id,default_tts_provider_id,preferred_comparison_provider_ids,preferred_deployment_class,created_at,updated_at").eq("user_id", humanId).maybeSingle(),
    client.from("notification_preferences").select("in_app_enabled,email_enabled,new_labs,provider_updates,simulation_updates,security_updates,created_at,updated_at").eq("user_id", humanId).maybeSingle(),
    client.from("user_notification_state").select("update_id,read_at").eq("user_id", humanId).order("read_at", { ascending: true }).limit(100),
    client.from("saved_experiments").select("id,name,experiment_type,schema_version,configuration,result,created_at,updated_at").eq("user_id", humanId).order("updated_at", { ascending: false }).limit(25),
  ]);
  if ([profile, preferences, notifications, readState, experiments].some((result) => result.error)) {
    return authErrorResponse(503, "export_unavailable", "Account data could not be exported safely right now.");
  }

  recordAuthEvent("account_export_completed", { outcome: "succeeded" });
  return privateAuthJson({
    schemaVersion: "one-human-account-export/1.0.0",
    generatedAt: new Date().toISOString(),
    human: {
      humanId,
      authenticationProvider: "supabase",
      assuranceLevel: identity.assuranceLevel,
    },
    data: {
      profile: profile.data,
      preferences: preferences.data,
      notificationPreferences: notifications.data,
      notificationReadState: readState.data ?? [],
      savedExperiments: experiments.data ?? [],
    },
    coverage: {
      included: ["profile", "preferences", "notification-preferences", "notification-read-state", "saved-simulation-experiments"],
      notIncluded: ["provider-credentials", "auth-tokens", "security-logs", "system-data", "private-benchmark-artifacts"],
    },
  }, 200, {
    "Content-Disposition": 'attachment; filename="one-account-export.json"',
    "Content-Type": "application/json; charset=utf-8",
  });
}

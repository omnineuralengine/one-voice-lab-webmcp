import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_PROVIDER_PREFERENCES,
  parseCanonicalProviderPreferences,
  type ProviderPreferences,
  type ProviderPreferenceWrite,
} from "@/lib/providers/preference-schema";

const providerPreferenceRowSchema = z.object({
  favorite_provider_ids: z.array(z.string()),
  hidden_provider_ids: z.array(z.string()),
  preferred_provider_order: z.array(z.string()),
  default_stt_provider_id: z.string().nullable(),
  default_tts_provider_id: z.string().nullable(),
  preferred_comparison_provider_ids: z.array(z.string()),
  preferred_deployment_class: z.string().nullable(),
  provider_preferences_revision: z.number().int().min(1),
}).strict();

const SELECT_COLUMNS = [
  "favorite_provider_ids",
  "hidden_provider_ids",
  "preferred_provider_order",
  "default_stt_provider_id",
  "default_tts_provider_id",
  "preferred_comparison_provider_ids",
  "preferred_deployment_class",
  "provider_preferences_revision",
].join(",");

export type ProviderPreferenceResult =
  | Readonly<{ ok: true; value: ProviderPreferences }>
  | Readonly<{ ok: false; code: "unavailable" | "conflict" | "invalid" }>;

export async function readProviderPreferences(
  client: SupabaseClient,
  userId: string,
): Promise<ProviderPreferenceResult> {
  try {
    const { data, error } = await client
      .from("user_preferences")
      .select(SELECT_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    if (!data) return { ok: true, value: DEFAULT_PROVIDER_PREFERENCES };
    const value = preferencesFromRow(data);
    return value ? { ok: true, value } : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function writeProviderPreferences(
  client: SupabaseClient,
  userId: string,
  input: ProviderPreferenceWrite,
): Promise<ProviderPreferenceResult> {
  const values = {
    favorite_provider_ids: input.favoriteProviderIds,
    hidden_provider_ids: input.hiddenProviderIds,
    preferred_provider_order: input.preferredProviderOrder,
    default_stt_provider_id: input.defaultSttProviderId,
    default_tts_provider_id: input.defaultTtsProviderId,
    preferred_comparison_provider_ids: input.preferredComparisonProviderIds,
    preferred_deployment_class: input.preferredDeploymentClass,
    updated_at: new Date().toISOString(),
  };

  try {
    const response = input.expectedRevision === 0
      ? await client
        .from("user_preferences")
        .insert({ user_id: userId, ...values })
        .select(SELECT_COLUMNS)
        .single()
      : await client
        .from("user_preferences")
        .update(values)
        .eq("user_id", userId)
        .eq("provider_preferences_revision", input.expectedRevision)
        .select(SELECT_COLUMNS)
        .maybeSingle();

    if (response.error) return { ok: false, code: databaseErrorCode(response.error) };
    if (!response.data) return { ok: false, code: "conflict" };
    const value = preferencesFromRow(response.data);
    return value ? { ok: true, value } : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

function preferencesFromRow(value: unknown): ProviderPreferences | null {
  const row = providerPreferenceRowSchema.safeParse(value);
  if (!row.success) return null;
  return parseCanonicalProviderPreferences({
    favoriteProviderIds: row.data.favorite_provider_ids,
    hiddenProviderIds: row.data.hidden_provider_ids,
    preferredProviderOrder: row.data.preferred_provider_order,
    defaultSttProviderId: row.data.default_stt_provider_id,
    defaultTtsProviderId: row.data.default_tts_provider_id,
    preferredComparisonProviderIds: row.data.preferred_comparison_provider_ids,
    preferredDeploymentClass: row.data.preferred_deployment_class,
    revision: row.data.provider_preferences_revision,
  });
}

function databaseErrorCode(error: unknown): "unavailable" | "conflict" | "invalid" {
  if (!error || typeof error !== "object") return "unavailable";
  const candidate = error as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (code === "23505" || code === "40001") return "conflict";
  if (code === "22023" || code === "23514") return "invalid";
  return "unavailable";
}

import { z } from "zod";

import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import { providerCatalogIdSchema } from "@/lib/providers/platform-types";

export const PROVIDER_PREFERENCE_DEPLOYMENT_CLASSES = [
  "hosted",
  "self-hosted",
  "local",
  "private-cloud",
  "regional",
  "on-premises",
] as const;

const providerIdList = (maximum: number) => z.array(providerCatalogIdSchema).max(maximum);

const providerPreferenceValuesSchema = z.object({
  favoriteProviderIds: providerIdList(32),
  hiddenProviderIds: providerIdList(32),
  preferredProviderOrder: providerIdList(64),
  defaultSttProviderId: providerCatalogIdSchema.nullable(),
  defaultTtsProviderId: providerCatalogIdSchema.nullable(),
  preferredComparisonProviderIds: providerIdList(4),
  preferredDeploymentClass: z.enum(PROVIDER_PREFERENCE_DEPLOYMENT_CLASSES).nullable(),
}).strict();

function validateLists(preferences: z.infer<typeof providerPreferenceValuesSchema>, context: z.RefinementCtx) {
  const lists = [
    ["favoriteProviderIds", preferences.favoriteProviderIds],
    ["hiddenProviderIds", preferences.hiddenProviderIds],
    ["preferredProviderOrder", preferences.preferredProviderOrder],
    ["preferredComparisonProviderIds", preferences.preferredComparisonProviderIds],
  ] as const;
  for (const [field, ids] of lists) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Provider preferences cannot contain duplicates.", path: [field] });
    }
  }
  const hidden = new Set(preferences.hiddenProviderIds);
  for (const id of preferences.favoriteProviderIds) {
    if (hidden.has(id)) {
      context.addIssue({ code: "custom", message: "A provider cannot be both favorite and hidden.", path: ["hiddenProviderIds"] });
    }
  }
}

export const providerPreferencesSchema = providerPreferenceValuesSchema.extend({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict().superRefine(validateLists);

export const providerPreferenceWriteSchema = providerPreferenceValuesSchema.extend({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict().superRefine(validateLists);

export type ProviderPreferences = z.infer<typeof providerPreferencesSchema>;
export type ProviderPreferenceWrite = z.infer<typeof providerPreferenceWriteSchema>;

export const DEFAULT_PROVIDER_PREFERENCES: ProviderPreferences = Object.freeze({
  favoriteProviderIds: [],
  hiddenProviderIds: [],
  preferredProviderOrder: [],
  defaultSttProviderId: null,
  defaultTtsProviderId: null,
  preferredComparisonProviderIds: [],
  preferredDeploymentClass: null,
  revision: 0,
});

const CANONICAL_PROVIDER_IDS = new Set<string>(PROVIDER_CATALOG.map((provider) => provider.id));

export function parseCanonicalProviderPreferences(value: unknown): ProviderPreferences | null {
  const parsed = providerPreferencesSchema.safeParse(value);
  if (!parsed.success) return null;
  const ids = [
    ...parsed.data.favoriteProviderIds,
    ...parsed.data.hiddenProviderIds,
    ...parsed.data.preferredProviderOrder,
    ...parsed.data.preferredComparisonProviderIds,
    parsed.data.defaultSttProviderId,
    parsed.data.defaultTtsProviderId,
  ].filter((id): id is string => Boolean(id));
  return ids.every((id) => CANONICAL_PROVIDER_IDS.has(id)) ? parsed.data : null;
}

export function parseCanonicalProviderPreferenceWrite(value: unknown): ProviderPreferenceWrite | null {
  const parsed = providerPreferenceWriteSchema.safeParse(value);
  if (!parsed.success) return null;
  const { expectedRevision, ...preferences } = parsed.data;
  const validated = parseCanonicalProviderPreferences({
    ...preferences,
    revision: expectedRevision,
  });
  return validated ? parsed.data : null;
}

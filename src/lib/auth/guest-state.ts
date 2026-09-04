import { z } from "zod";

import { oneThemePreferencesSchema } from "@/lib/one/theme";
import {
  parseCanonicalProviderPreferences,
  type ProviderPreferences,
} from "@/lib/providers/preference-schema";
import {
  ONE_GUEST_EXPERIMENTS_KEY,
  readGuestExperiments,
  savedSimulationExperimentSchema,
} from "@/lib/simulations/saved-experiments";

export const GUEST_LAB_PREFERENCES_KEY = "one:guest:lab-preferences:v1";
export const GUEST_NOTIFICATION_PREFERENCES_KEY = "one:guest:notification-preferences:v1";
export const GUEST_NOTIFICATION_STATE_KEY = "one:guest:notification-state:v1";
export const GUEST_PROVIDER_PREFERENCES_KEY = "one:guest:provider-preferences:v1";

const guestLabPreferencesSchema = z.object({
  defaultModule: z.enum(["/", "/simulation-lab", "/build", "/learn"]),
}).strict();

export const guestNotificationPreferencesSchema = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  newLabs: z.boolean(),
  providerUpdates: z.boolean(),
  simulationUpdates: z.boolean(),
  securityUpdates: z.boolean(),
}).strict();

export type GuestNotificationPreferences = z.infer<typeof guestNotificationPreferencesSchema>;

const guestProviderPreferencesSchema = z.unknown().transform((value, context): ProviderPreferences => {
  const parsed = parseCanonicalProviderPreferences(value);
  if (parsed) return parsed;
  context.addIssue({ code: "custom", message: "Invalid provider preferences." });
  return z.NEVER;
});

export const guestMigrationSnapshotSchema = z.object({
  schemaVersion: z.literal("one-guest-state/1.0.0"),
  theme: oneThemePreferencesSchema.nullable(),
  labPreferences: guestLabPreferencesSchema.nullable(),
  notificationPreferences: guestNotificationPreferencesSchema.nullable(),
  providerPreferences: guestProviderPreferencesSchema.nullable(),
  readUpdateIds: z.array(z.uuid()).max(100),
  experiments: z.array(savedSimulationExperimentSchema).max(12),
}).strict();

export type GuestMigrationSnapshot = z.infer<typeof guestMigrationSnapshotSchema>;

export const GUEST_MIGRATION_STORAGE_KEYS = [
  GUEST_LAB_PREFERENCES_KEY,
  GUEST_NOTIFICATION_PREFERENCES_KEY,
  GUEST_NOTIFICATION_STATE_KEY,
  GUEST_PROVIDER_PREFERENCES_KEY,
  ONE_GUEST_EXPERIMENTS_KEY,
] as const;

export function collectGuestMigrationSnapshot(
  storage: Pick<Storage, "getItem">,
  themeStorageKey: string,
): GuestMigrationSnapshot {
  return guestMigrationSnapshotSchema.parse({
    schemaVersion: "one-guest-state/1.0.0",
    theme: parseLocalValue(storage, themeStorageKey, oneThemePreferencesSchema),
    labPreferences: parseLocalValue(storage, GUEST_LAB_PREFERENCES_KEY, guestLabPreferencesSchema),
    notificationPreferences: parseLocalValue(
      storage,
      GUEST_NOTIFICATION_PREFERENCES_KEY,
      guestNotificationPreferencesSchema,
    ),
    providerPreferences: readProviderPreferences(storage),
    readUpdateIds: readStringArray(storage, GUEST_NOTIFICATION_STATE_KEY, 100)
      .filter((value) => z.uuid().safeParse(value).success),
    experiments: readGuestExperiments(storage),
  });
}

export function guestSnapshotHasState(snapshot: GuestMigrationSnapshot): boolean {
  return snapshot.theme !== null
    || snapshot.labPreferences !== null
    || snapshot.notificationPreferences !== null
    || snapshot.providerPreferences !== null
    || snapshot.readUpdateIds.length > 0
    || snapshot.experiments.length > 0;
}

export function clearMigratedGuestState(
  storage: Pick<Storage, "removeItem">,
  themeStorageKey: string,
) {
  for (const key of [themeStorageKey, ...GUEST_MIGRATION_STORAGE_KEYS]) storage.removeItem(key);
}

function parseLocalValue<T>(
  storage: Pick<Storage, "getItem">,
  key: string,
  schema: z.ZodType<T>,
): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 131_072) return null;
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function readProviderPreferences(storage: Pick<Storage, "getItem">) {
  try {
    const raw = storage.getItem(GUEST_PROVIDER_PREFERENCES_KEY);
    if (!raw || raw.length > 8_192) return null;
    return parseCanonicalProviderPreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readStringArray(storage: Pick<Storage, "getItem">, key: string, maximum: number) {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 8_192) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string").slice(0, maximum);
  } catch {
    return [];
  }
}

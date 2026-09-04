import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidOneLabSessionId } from "@/lib/access/session-cookie";
import { guestMigrationSnapshotSchema, type GuestMigrationSnapshot } from "@/lib/auth/guest-state";

const migrationResultSchema = z.object({
  status: z.enum(["claimed", "migrated", "already-migrated", "claimed-by-another-account", "migration-limit-reached"]),
  preferencesImported: z.boolean().optional(),
  notificationPreferencesImported: z.boolean().optional(),
  notificationReadsImported: z.number().int().min(0).max(100).optional(),
  experimentsImported: z.number().int().min(0).max(12).optional(),
}).strict();

export type GuestMigrationResult = z.infer<typeof migrationResultSchema>;

export function hashGuestSessionId(sessionId: string): string | null {
  if (!isValidOneLabSessionId(sessionId)) return null;
  return createHash("sha256").update(`one-guest-migration/1:${sessionId}`).digest("hex");
}

export async function claimGuestMigration(
  client: SupabaseClient,
  guestSessionId: string,
): Promise<GuestMigrationResult | null> {
  const guestHash = hashGuestSessionId(guestSessionId);
  if (!guestHash) return null;
  try {
    const { data, error } = await client.rpc("claim_one_guest_migration", {
      p_guest_key_hash: guestHash,
    });
    if (error) return null;
    const result = migrationResultSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function migrateGuestState(
  client: SupabaseClient,
  guestSessionId: string,
  input: GuestMigrationSnapshot,
): Promise<GuestMigrationResult | null> {
  const guestHash = hashGuestSessionId(guestSessionId);
  const payload = guestMigrationSnapshotSchema.safeParse(input);
  if (!guestHash || !payload.success) return null;
  try {
    const { data, error } = await client.rpc("migrate_one_guest_state", {
      p_guest_key_hash: guestHash,
      p_payload: payload.data,
    });
    if (error) return null;
    const result = migrationResultSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

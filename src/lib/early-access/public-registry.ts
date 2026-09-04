import "server-only";

import type { PublicEarlyAccessExperiment } from "@/lib/early-access/types";

// Public entries are deliberately explicit. Confidential experiments are not
// represented here, so their names, metadata, assets, and configuration cannot
// be serialized into the public application bundle by a client-side flag.
const PUBLIC_EARLY_ACCESS_EXPERIMENTS: readonly PublicEarlyAccessExperiment[] = [];

export function getPublicEarlyAccessExperiments(): readonly PublicEarlyAccessExperiment[] {
  return PUBLIC_EARLY_ACCESS_EXPERIMENTS;
}

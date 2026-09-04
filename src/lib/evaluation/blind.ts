import type { ProviderId } from "@/lib/providers/types";

export const BLIND_LABELS = ["Voice A", "Voice B", "Voice C", "Voice D"] as const;
export type BlindLabel = (typeof BLIND_LABELS)[number];

export function createBlindAssignments(
  providerIds: readonly ProviderId[],
  seed: string,
): Readonly<Partial<Record<ProviderId, BlindLabel>>> {
  const unique = [...new Set(providerIds)].sort();
  if (unique.length !== providerIds.length || unique.length < 2 || unique.length > BLIND_LABELS.length) {
    throw new Error("Blind assignments require two to four unique providers.");
  }

  const shuffled = [...unique];
  let state = seedToUint32(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = xorshift32(state);
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return Object.freeze(Object.fromEntries(
    shuffled.map((providerId, index) => [providerId, BLIND_LABELS[index]]),
  ) as Partial<Record<ProviderId, BlindLabel>>);
}

function seedToUint32(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 0x9e3779b9;
}

function xorshift32(value: number): number {
  let next = value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

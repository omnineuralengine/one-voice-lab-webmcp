import {
  normalizedProviderModelSchema,
  normalizedProviderVoiceSchema,
  providerCatalogIdSchema,
  type NormalizedProviderModel,
  type NormalizedProviderVoice,
} from "@/lib/providers/platform-types";

export type ProviderDiscoveryKind = "models" | "voices";
export type ProviderDiscoveryEntry = NormalizedProviderModel | NormalizedProviderVoice;

export type ProviderDiscoveryCacheView<T extends ProviderDiscoveryEntry> = Readonly<{
  providerId: string;
  kind: ProviderDiscoveryKind;
  state: "miss" | "fresh" | "stale";
  entries: readonly T[];
  lastSuccessfulRefresh?: string;
  lastFailedRefresh?: string;
  failure?: Readonly<{
    code: "refresh-failed" | "invalid-response";
  }>;
}>;

type DiscoveryRecord = {
  models?: ProviderDiscoveryCacheView<NormalizedProviderModel>;
  voices?: ProviderDiscoveryCacheView<NormalizedProviderVoice>;
  lastTouchedMs: number;
};

export type ProviderDiscoveryCacheOptions = Readonly<{
  ttlMs: number;
  maxStaleMs: number;
  maxProviders: number;
  maxEntriesPerProvider: number;
}>;

function toTimestamp(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function emptyView<T extends ProviderDiscoveryEntry>(
  providerId: string,
  kind: ProviderDiscoveryKind,
): ProviderDiscoveryCacheView<T> {
  return Object.freeze({ providerId, kind, state: "miss", entries: Object.freeze([]) });
}

/**
 * Process-local metadata cache for curated or provider discovery responses.
 * It stores normalized public metadata only. Failure details are reduced to a
 * bounded code so raw upstream bodies and authentication errors cannot persist.
 */
export class ProviderDiscoveryCache {
  readonly #options: ProviderDiscoveryCacheOptions;
  readonly #records = new Map<string, DiscoveryRecord>();

  constructor(options: ProviderDiscoveryCacheOptions) {
    if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1) throw new Error("ttlMs must be a positive integer.");
    if (!Number.isSafeInteger(options.maxStaleMs) || options.maxStaleMs < options.ttlMs) {
      throw new Error("maxStaleMs must be an integer greater than or equal to ttlMs.");
    }
    if (!Number.isSafeInteger(options.maxProviders) || options.maxProviders < 1 || options.maxProviders > 1_000) {
      throw new Error("maxProviders must be between 1 and 1000.");
    }
    if (
      !Number.isSafeInteger(options.maxEntriesPerProvider)
      || options.maxEntriesPerProvider < 1
      || options.maxEntriesPerProvider > 500
    ) {
      throw new Error("maxEntriesPerProvider must be between 1 and 500.");
    }
    this.#options = Object.freeze({ ...options });
  }

  get size(): number {
    return this.#records.size;
  }

  readModels(providerId: string, nowMs = Date.now()): ProviderDiscoveryCacheView<NormalizedProviderModel> {
    return this.#read(providerId, "models", nowMs) as ProviderDiscoveryCacheView<NormalizedProviderModel>;
  }

  readVoices(providerId: string, nowMs = Date.now()): ProviderDiscoveryCacheView<NormalizedProviderVoice> {
    return this.#read(providerId, "voices", nowMs) as ProviderDiscoveryCacheView<NormalizedProviderVoice>;
  }

  putModels(providerId: string, entries: readonly NormalizedProviderModel[], nowMs = Date.now()): void {
    this.#put(providerId, "models", entries, nowMs);
  }

  putVoices(providerId: string, entries: readonly NormalizedProviderVoice[], nowMs = Date.now()): void {
    this.#put(providerId, "voices", entries, nowMs);
  }

  recordFailure(
    providerId: string,
    kind: ProviderDiscoveryKind,
    failure: "refresh-failed" | "invalid-response" = "refresh-failed",
    nowMs = Date.now(),
  ): void {
    const parsedProviderId = providerCatalogIdSchema.parse(providerId);
    const current = this.#read(parsedProviderId, kind, nowMs);
    const record = this.#ensureRecord(parsedProviderId, nowMs);
    const next = Object.freeze({
      ...current,
      state: current.entries.length > 0 ? "stale" as const : "miss" as const,
      lastFailedRefresh: toTimestamp(nowMs),
      failure: Object.freeze({ code: failure }),
    });
    record[kind] = next as never;
    record.lastTouchedMs = nowMs;
  }

  invalidate(providerId: string, kind?: ProviderDiscoveryKind): void {
    const parsedProviderId = providerCatalogIdSchema.parse(providerId);
    if (!kind) {
      this.#records.delete(parsedProviderId);
      return;
    }
    const record = this.#records.get(parsedProviderId);
    if (!record) return;
    delete record[kind];
    if (!record.models && !record.voices) this.#records.delete(parsedProviderId);
  }

  prune(nowMs = Date.now()): number {
    let removed = 0;
    for (const [providerId, record] of this.#records) {
      for (const kind of ["models", "voices"] as const) {
        const view = record[kind];
        if (!view) continue;
        const successfulAt = view.lastSuccessfulRefresh ? Date.parse(view.lastSuccessfulRefresh) : Number.NaN;
        const failedAt = view.lastFailedRefresh ? Date.parse(view.lastFailedRefresh) : Number.NaN;
        const referenceTime = Number.isFinite(successfulAt) ? successfulAt : failedAt;
        if (!Number.isFinite(referenceTime) || nowMs - referenceTime > this.#options.maxStaleMs) {
          delete record[kind];
          removed += 1;
        }
      }
      if (!record.models && !record.voices) this.#records.delete(providerId);
    }
    return removed;
  }

  #read(
    providerId: string,
    kind: ProviderDiscoveryKind,
    nowMs: number,
  ): ProviderDiscoveryCacheView<ProviderDiscoveryEntry> {
    const parsedProviderId = providerCatalogIdSchema.parse(providerId);
    const record = this.#records.get(parsedProviderId);
    const current = record?.[kind] as ProviderDiscoveryCacheView<ProviderDiscoveryEntry> | undefined;
    if (!current) return emptyView(parsedProviderId, kind);
    record!.lastTouchedMs = nowMs;
    const successfulAt = current.lastSuccessfulRefresh ? Date.parse(current.lastSuccessfulRefresh) : Number.NaN;
    const failedAt = current.lastFailedRefresh ? Date.parse(current.lastFailedRefresh) : Number.NaN;
    const referenceTime = Number.isFinite(successfulAt) ? successfulAt : failedAt;
    if (!Number.isFinite(referenceTime) || nowMs - referenceTime > this.#options.maxStaleMs) {
      delete record![kind];
      if (!record!.models && !record!.voices) this.#records.delete(parsedProviderId);
      return emptyView(parsedProviderId, kind);
    }
    const state = Number.isFinite(successfulAt) && nowMs - successfulAt <= this.#options.ttlMs ? "fresh" : "stale";
    return Object.freeze({ ...current, state });
  }

  #put(
    providerId: string,
    kind: ProviderDiscoveryKind,
    entries: readonly ProviderDiscoveryEntry[],
    nowMs: number,
  ): void {
    const parsedProviderId = providerCatalogIdSchema.parse(providerId);
    if (entries.length > this.#options.maxEntriesPerProvider) {
      throw new Error(`Provider discovery response exceeds the ${this.#options.maxEntriesPerProvider} entry limit.`);
    }
    const parsedEntries = entries.map((entry) => {
      const parsed = kind === "models"
        ? normalizedProviderModelSchema.parse(entry)
        : normalizedProviderVoiceSchema.parse(entry);
      if (parsed.providerId !== parsedProviderId) {
        throw new Error(`Discovery entry provider ${parsed.providerId} does not match ${parsedProviderId}.`);
      }
      return parsed;
    });
    const references = new Set(parsedEntries.map((entry) => entry.referenceId));
    if (references.size !== parsedEntries.length) throw new Error("Provider discovery references must be unique.");

    const record = this.#ensureRecord(parsedProviderId, nowMs);
    const view = Object.freeze({
      providerId: parsedProviderId,
      kind,
      state: "fresh" as const,
      entries: Object.freeze([...parsedEntries].sort((left, right) => left.referenceId.localeCompare(right.referenceId))),
      lastSuccessfulRefresh: toTimestamp(nowMs),
    });
    record[kind] = view as never;
    record.lastTouchedMs = nowMs;
  }

  #ensureRecord(providerId: string, nowMs: number): DiscoveryRecord {
    const existing = this.#records.get(providerId);
    if (existing) return existing;
    if (this.#records.size >= this.#options.maxProviders) {
      const oldest = [...this.#records.entries()].sort((left, right) => (
        left[1].lastTouchedMs - right[1].lastTouchedMs || left[0].localeCompare(right[0])
      ))[0];
      if (oldest) this.#records.delete(oldest[0]);
    }
    const created: DiscoveryRecord = { lastTouchedMs: nowMs };
    this.#records.set(providerId, created);
    return created;
  }
}

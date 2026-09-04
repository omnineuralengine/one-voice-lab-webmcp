import {
  providerCatalogEntrySchema,
  providerCatalogIdSchema,
  type ProviderAdapterKind,
  type NormalizedProviderCapabilityId,
  type ProviderCatalogEntry,
} from "@/lib/providers/platform-types";

export type ProviderFixtureResult = Readonly<{
  providerId: string;
  capabilityId: NormalizedProviderCapabilityId;
  status: "complete";
  provenance: "synthetic-fixture";
  output: Readonly<{
    text?: string;
    mimeType?: string;
    byteLength?: number;
    eventCount?: number;
  }>;
}>;

export interface ProviderFixtureAdapter {
  readonly providerId: string;
  readonly capabilityId: NormalizedProviderCapabilityId;
  readonly adapterKind: ProviderAdapterKind;
  readonly supportedCapabilityIds: readonly NormalizedProviderCapabilityId[];
  readonly adapterVersion: string;
  readonly fixtureOnly: true;
  executeFixture(
    input: Readonly<{ text?: string; audio?: Uint8Array }>,
    context: Readonly<{ signal: AbortSignal }>,
  ): Promise<ProviderFixtureResult>;
}

export type ProviderContractCandidate = Readonly<{
  catalogEntry: ProviderCatalogEntry;
  adapters: readonly ProviderFixtureAdapter[];
  benchmarkCompatibleCapabilities: readonly NormalizedProviderCapabilityId[];
}>;

export type ProviderContractValidation = Readonly<{
  valid: boolean;
  issues: readonly Readonly<{
    code:
      | "duplicate-provider-id"
      | "adapter-provider-mismatch"
      | "adapter-capability-undeclared"
      | "adapter-primary-capability-missing"
      | "adapter-version-missing"
      | "duplicate-adapter-capability"
      | "benchmark-capability-undeclared"
      | "unsafe-public-field";
    message: string;
  }>[];
}>;

export type ProviderFixtureExecution =
  | Readonly<{ ok: true; result: ProviderFixtureResult }>
  | Readonly<{
    ok: false;
    error: Readonly<{
      code: "cancelled" | "timed-out" | "fixture-failed" | "invalid-fixture-result";
      message: string;
    }>;
  }>;

const unsafePublicKeyPattern = /(?:api.?key|authorization|credential.?value|environment.?variables|secret|token)/i;

function collectUnsafeKeys(value: unknown, path = "provider"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectUnsafeKeys(item, `${path}[${index}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(unsafePublicKeyPattern.test(key) ? [`${path}.${key}`] : []),
    ...collectUnsafeKeys(child, `${path}.${key}`),
  ]);
}

/** Validates provider wiring without executing an adapter or touching a provider network. */
export function validateProviderContractCandidate(
  candidate: ProviderContractCandidate,
  existingProviderIds: readonly string[] = [],
): ProviderContractValidation {
  const catalogEntry = providerCatalogEntrySchema.parse(candidate.catalogEntry);
  const issues: Array<ProviderContractValidation["issues"][number]> = [];
  if (existingProviderIds.includes(catalogEntry.id)) {
    issues.push({ code: "duplicate-provider-id", message: `Provider ID ${catalogEntry.id} is already registered.` });
  }

  const declaredCapabilities = new Set(catalogEntry.capabilities.map((capability) => capability.id));
  const adapterCapabilities = new Set<NormalizedProviderCapabilityId>();
  const primaryAdapterCapabilities = new Set<NormalizedProviderCapabilityId>();
  for (const adapter of candidate.adapters) {
    if (adapter.providerId !== catalogEntry.id) {
      issues.push({ code: "adapter-provider-mismatch", message: `Adapter identity does not match ${catalogEntry.id}.` });
    }
    const supportedCapabilities = new Set(adapter.supportedCapabilityIds);
    if (!supportedCapabilities.has(adapter.capabilityId)) {
      issues.push({ code: "adapter-primary-capability-missing", message: `Adapter ${adapter.capabilityId} must include its primary capability.` });
    }
    for (const capabilityId of supportedCapabilities) {
      if (!declaredCapabilities.has(capabilityId)) {
        issues.push({ code: "adapter-capability-undeclared", message: `Adapter capability ${capabilityId} is not declared.` });
      }
      adapterCapabilities.add(capabilityId);
    }
    if (!adapter.adapterVersion.trim()) {
      issues.push({ code: "adapter-version-missing", message: `Adapter ${adapter.capabilityId} has no stable version.` });
    }
    if (primaryAdapterCapabilities.has(adapter.capabilityId)) {
      issues.push({ code: "duplicate-adapter-capability", message: `Capability ${adapter.capabilityId} has multiple adapters.` });
    }
    primaryAdapterCapabilities.add(adapter.capabilityId);
  }

  for (const capability of candidate.benchmarkCompatibleCapabilities) {
    if (!declaredCapabilities.has(capability) || !adapterCapabilities.has(capability)) {
      issues.push({
        code: "benchmark-capability-undeclared",
        message: `Benchmark capability ${capability} requires a declared fixture adapter.`,
      });
    }
  }

  for (const path of collectUnsafeKeys(catalogEntry)) {
    issues.push({ code: "unsafe-public-field", message: `Unsafe public metadata field: ${path}.` });
  }

  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

/**
 * Runs only an adapter explicitly marked fixture-only. It applies bounded
 * timeout/cancellation and returns normalized, non-provider-specific errors.
 */
export async function executeProviderFixtureContract(
  adapter: ProviderFixtureAdapter,
  input: Readonly<{ text?: string; audio?: Uint8Array }>,
  options: Readonly<{ timeoutMs: number; signal?: AbortSignal }>,
): Promise<ProviderFixtureExecution> {
  providerCatalogIdSchema.parse(adapter.providerId);
  if (options.signal?.aborted) {
    return { ok: false, error: { code: "cancelled", message: "Fixture execution was cancelled." } };
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 5_000) {
    throw new Error("Fixture contract timeout must be between 1 and 5000 milliseconds.");
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort("fixture-timeout");
        reject(new Error("fixture-timeout"));
      }, options.timeoutMs);
    });
    const result = await Promise.race([adapter.executeFixture(input, { signal: controller.signal }), timeout]);
    if (
      result.providerId !== adapter.providerId
      || result.capabilityId !== adapter.capabilityId
      || result.status !== "complete"
      || result.provenance !== "synthetic-fixture"
    ) {
      return {
        ok: false,
        error: { code: "invalid-fixture-result", message: "Fixture adapter returned an invalid normalized result." },
      };
    }
    return { ok: true, result };
  } catch {
    if (timedOut) return { ok: false, error: { code: "timed-out", message: "Fixture execution timed out." } };
    if (options.signal?.aborted || controller.signal.aborted) {
      return { ok: false, error: { code: "cancelled", message: "Fixture execution was cancelled." } };
    }
    return { ok: false, error: { code: "fixture-failed", message: "Fixture execution failed." } };
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

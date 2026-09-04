import type { BenchmarkPlanningProvider } from "@/lib/evaluation/benchmark-engine";
import type { BenchmarkPlan } from "@/lib/evaluation/benchmark-schema";
import type { ProviderPlatformProjection } from "@/lib/providers/platform-types";

/**
 * Stage 3 consumes this structural projection; it does not learn provider
 * names or operational storage. Historical benchmark results retain their own
 * immutable provider/model snapshots after current policy changes.
 */
export function toBenchmarkPlanningProviders(
  providers: readonly ProviderPlatformProjection[],
  category: BenchmarkPlan["category"] = "tts",
): readonly BenchmarkPlanningProvider[] {
  return providers.map((provider) => {
    const capabilityId = category === "tts"
      ? "tts.batch"
      : category === "stt"
        ? "stt.prerecorded"
        : "stt.turn-aware";
    const capability = provider.capabilities.find((item) => item.id === capabilityId);
    const adapterBacked = provider.integration.installed && Boolean(capability
      && capability.support === "supported"
      && capability.integrationPath === "adapter");
    return {
      providerId: provider.id,
      listed: true,
      fixtureAvailable: adapterBacked && provider.integration.fixtureCapable,
      adapterBacked,
      liveEnabled: adapterBacked
        && capability?.benchmarkEligibility === "eligible"
        && provider.readiness.state === "live-enabled"
        && ["enabled", "degraded"].includes(provider.lifecycle.runtime),
      benchmarkEligible: ["benchmark-eligible", "publicly-ranked"].includes(provider.lifecycle.benchmark)
        && capability?.benchmarkEligibility === "eligible",
    };
  });
}

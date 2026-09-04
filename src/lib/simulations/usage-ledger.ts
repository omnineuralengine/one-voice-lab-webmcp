import { simulationUsageEventSchema, type SimulationUsageEvent } from "@/lib/simulations/types";

export const SIMULATION_USAGE_LEDGER_KEY = "voice-open-lab-simulation-usage-v1";
const MAX_LOCAL_USAGE_EVENTS = 100;

export function readSimulationUsageLedger(storage: Pick<Storage, "getItem">): SimulationUsageEvent[] {
  const serialized = storage.getItem(SIMULATION_USAGE_LEDGER_KEY);
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const result = simulationUsageEventSchema.safeParse(value);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function recordSimulationUsage(
  storage: Pick<Storage, "getItem" | "setItem">,
  usage: SimulationUsageEvent,
  observedAt = new Date().toISOString(),
) {
  const event = simulationUsageEventSchema.parse({ ...usage, timestamp: observedAt });
  const events = [...readSimulationUsageLedger(storage), event].slice(-MAX_LOCAL_USAGE_EVENTS);
  storage.setItem(SIMULATION_USAGE_LEDGER_KEY, JSON.stringify(events));
  return event;
}

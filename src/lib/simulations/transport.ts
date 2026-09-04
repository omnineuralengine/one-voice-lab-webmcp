import type { SimulationEvent } from "@/lib/simulations/types";

export type SimulationTransportMode = "local-replay" | "shared-live";

export interface SimulationObserverTransport {
  readonly mode: SimulationTransportMode;
  subscribe(runId: string, onEvent: (event: SimulationEvent) => void): () => void;
}

// V1 intentionally implements only an in-browser replay stream. A future
// shared-live implementation must use durable shared pub/sub or persistence;
// serverless process memory is not a supported broadcast transport.
export const SIMULATION_TRANSPORT_STATUS = {
  implemented: "local-replay",
  sharedLive: "planned",
  sharedLiveRequirements: ["authenticated operator", "durable shared event log", "pub/sub fanout", "privacy-safe replay projection"],
} as const;

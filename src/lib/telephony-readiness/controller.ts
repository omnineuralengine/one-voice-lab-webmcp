import {
  TELEPHONY_GATE_IDS,
  applyTelephonyLabRemediationInputSchema,
  configureTelephonyReadinessInputSchema,
  runTelephonyReadinessInputSchema,
  telephonyLabContextSchema,
  type ApplyTelephonyLabRemediationInput,
  type ConfigureTelephonyReadinessInput,
  type RunTelephonyReadinessInput,
  type TelephonyActivitySource,
  type TelephonyGateId,
  type TelephonyLabContext,
  type TelephonyReadinessConfiguration,
  type TelephonyReadinessReport,
} from "@/lib/telephony-readiness/contracts";
import {
  DEFAULT_TELEPHONY_READINESS_CONFIGURATION,
  enableTelephonySafeguard,
  normalizeTelephonySafeguards,
  runTelephonyReadinessSimulation,
} from "@/lib/telephony-readiness/engine";

export type TelephonyLabActivity = Readonly<{
  sequence: number;
  source: TelephonyActivitySource;
  action: "configure" | "run" | "apply-remediation";
  detail: string;
}>;

export type TelephonyReadinessLabState = Readonly<{
  configuration: TelephonyReadinessConfiguration;
  lastReport: TelephonyReadinessReport | null;
  previousReport: TelephonyReadinessReport | null;
  evidenceStale: boolean;
  revision: number;
  latestActivity: TelephonyLabActivity | null;
}>;

export type TelephonyNotRunGate = Readonly<{
  id: TelephonyGateId;
  status: "not-run";
  evidence: readonly string[];
  owner: "application" | "twilio-provider" | "shared";
  recommendedNextAction: string;
}>;

export type TelephonyReadinessReportView = Readonly<{
  available: boolean;
  stale: boolean;
  report: TelephonyReadinessReport | null;
  gates: readonly (TelephonyReadinessReport["gates"][number] | TelephonyNotRunGate)[];
}>;

const NOT_RUN_OWNERS: Readonly<Record<TelephonyGateId, TelephonyNotRunGate["owner"]>> = {
  responsiveness: "shared",
  interruptibility: "application",
  resilience: "shared",
  "edge-cases": "application",
  observability: "application",
};

function createNotRunGates(): readonly TelephonyNotRunGate[] {
  return TELEPHONY_GATE_IDS.map((id) => ({
    id,
    status: "not-run" as const,
    evidence: ["No simulation evidence exists for the current configuration."],
    owner: NOT_RUN_OWNERS[id],
    recommendedNextAction: "Run the selected deterministic simulation to produce gate evidence.",
  }));
}

function initialState(): TelephonyReadinessLabState {
  return {
    configuration: DEFAULT_TELEPHONY_READINESS_CONFIGURATION,
    lastReport: null,
    previousReport: null,
    evidenceStale: false,
    revision: 0,
    latestActivity: null,
  };
}

function contextFromState(state: TelephonyReadinessLabState): TelephonyLabContext {
  const activeReport = state.evidenceStale ? null : state.lastReport;
  return telephonyLabContextSchema.parse({
    provider: state.configuration.provider,
    mode: state.configuration.mode,
    scenario: state.configuration.scenario,
    configuredSafeguards: state.configuration.safeguards,
    gateState: TELEPHONY_GATE_IDS.map((id) => ({
      id,
      status: activeReport?.gates.find((gate) => gate.id === id)?.status ?? "not-run",
    })),
    credentialsStatus: "Credentials not configured",
    liveCallStatus: "No live call placed",
    liveActionsAvailable: false,
    latestActivitySource: state.latestActivity?.source ?? null,
  });
}

export class TelephonyReadinessController {
  private state: TelephonyReadinessLabState = initialState();
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.state;
  readonly getServerSnapshot = () => this.state;

  getContext(): TelephonyLabContext {
    return contextFromState(this.state);
  }

  getReport(): TelephonyReadinessReportView {
    return {
      available: this.state.lastReport !== null,
      stale: this.state.evidenceStale,
      report: this.state.lastReport,
      gates: this.state.lastReport?.gates ?? createNotRunGates(),
    };
  }

  configure(
    input: ConfigureTelephonyReadinessInput,
    source: TelephonyActivitySource,
  ) {
    const parsed = configureTelephonyReadinessInputSchema.parse(input);
    const configuration: TelephonyReadinessConfiguration = {
      ...parsed,
      safeguards: normalizeTelephonySafeguards(parsed.safeguards),
    };
    const priorReport = this.state.lastReport;
    const comparablePriorReport = priorReport?.scenario === configuration.scenario
      ? priorReport
      : this.state.previousReport?.scenario === configuration.scenario
        ? this.state.previousReport
        : null;
    this.publish({
      ...this.state,
      configuration,
      previousReport: comparablePriorReport,
      lastReport: null,
      evidenceStale: false,
      latestActivity: this.nextActivity(source, "configure", `Configured ${configuration.scenario} with ${configuration.safeguards.length} safeguard(s).`),
    });
    return {
      ok: true as const,
      configuration: this.state.configuration,
      evidenceStatus: "not-run" as const,
      context: this.getContext(),
    };
  }

  run(input: RunTelephonyReadinessInput, source: TelephonyActivitySource) {
    runTelephonyReadinessInputSchema.parse(input);
    const report = runTelephonyReadinessSimulation(this.state.configuration);
    const priorReport = this.state.lastReport;
    this.publish({
      ...this.state,
      lastReport: report,
      previousReport: priorReport?.scenario === report.scenario
        ? priorReport
        : this.state.previousReport?.scenario === report.scenario
          ? this.state.previousReport
          : null,
      evidenceStale: false,
      latestActivity: this.nextActivity(source, "run", `Ran ${report.scenario}; ${report.gatesPassed.length} gate(s) passed and ${report.gatesNeedingAttention.length} need attention.`),
    });
    return {
      ok: true as const,
      report,
      context: this.getContext(),
    };
  }

  applyRemediation(
    input: ApplyTelephonyLabRemediationInput,
    source: TelephonyActivitySource,
  ) {
    const parsed = applyTelephonyLabRemediationInputSchema.parse(input);
    const result = enableTelephonySafeguard(this.state.configuration, parsed.remediation);
    this.publish({
      ...this.state,
      configuration: result.configuration,
      evidenceStale: result.changed && this.state.lastReport !== null ? true : this.state.evidenceStale,
      latestActivity: this.nextActivity(
        source,
        "apply-remediation",
        result.changed
          ? `Enabled ${parsed.remediation}; rerun the same scenario to observe the causal change.`
          : `${parsed.remediation} was already enabled; no causal input changed.`,
      ),
    });
    return {
      ok: true as const,
      changed: result.changed,
      remediation: parsed.remediation,
      configuredSafeguards: this.state.configuration.safeguards,
      rerunRequired: result.changed,
      context: this.getContext(),
    };
  }

  private nextActivity(
    source: TelephonyActivitySource,
    action: TelephonyLabActivity["action"],
    detail: string,
  ): TelephonyLabActivity {
    return {
      sequence: this.state.revision + 1,
      source,
      action,
      detail,
    };
  }

  private publish(next: Omit<TelephonyReadinessLabState, "revision"> & { revision?: number }) {
    this.state = {
      ...next,
      revision: this.state.revision + 1,
    };
    this.listeners.forEach((listener) => listener());
  }
}

export function createTelephonyReadinessController() {
  return new TelephonyReadinessController();
}

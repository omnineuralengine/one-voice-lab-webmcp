import {
  ONE_LAB_MAP_GOALS,
  ONE_PROVIDER_COMPARISON_DIMENSIONS,
  ONE_WEBMCP_TOOL_NAMES,
  type CompareVoiceProvidersInput,
  type FindVoiceProvidersInput,
  type GetOneLabMapInput,
  type OneLabMapGoal,
  type OneProviderComparisonDimension,
  type OpenOneLabInput,
} from "@/lib/one-webmcp/contracts";
import type { OneWebMcpProviderRecord } from "@/lib/one-webmcp/provider-data";
import { isOneVisibleWorkspaceModuleId } from "@/lib/one-webmcp/visible-context";
import {
  ONE_PUBLIC_LAB_DESTINATIONS,
  getOnePublicLabDestination,
  isOnePublicQueryModuleId,
  type OnePublicLabDestination,
  type OnePublicLabDestinationId,
} from "@/lib/public-evidence/lab-destinations";
import { TELEPHONY_READINESS_WEBMCP_TOOL_NAMES } from "@/lib/telephony-readiness/webmcp";

type MaybePromise<Value> = Value | Promise<Value>;

export type OneWebMcpVisibleStateInput = Readonly<{
  pathname: string;
  moduleId: string | null;
  legacyWorkspaceActive?: boolean;
  workspaceProviderId?: "deepgram" | null;
  workspaceEvidenceScope?: "provider-specific" | "provider-neutral" | null;
  interfaceDepth: "essential" | "guided" | "detailed" | "technical";
  reducedMotion: boolean;
}>;

export type OneWebMcpTelephonySnapshot = Readonly<{
  context: Readonly<{
    scenario: string;
    gateState: readonly Readonly<{ id: string; status: string }>[];
    liveActionsAvailable: false;
  }>;
  report: Readonly<{
    available: boolean;
    stale: boolean;
  }>;
}>;

export type OneWebMcpNavigationState = Readonly<{
  sequence: number;
  source: "human-ui" | "webmcp-agent";
  routeId: OnePublicLabDestinationId;
  fromPathname: string | null;
  destination: string;
  status: "requested" | "arrived" | "already-open" | "failed";
  message: string;
}>;

export type OneWebMcpControllerState = Readonly<{
  visible: OneWebMcpVisibleStateInput;
  revision: number;
  latestNavigation: OneWebMcpNavigationState | null;
}>;

export type OneWebMcpControllerDependencies = Readonly<{
  providers: readonly OneWebMcpProviderRecord[];
  initialVisibleState: OneWebMcpVisibleStateInput;
  navigate(href: string): MaybePromise<void>;
  getTelephonySnapshot(): OneWebMcpTelephonySnapshot;
}>;

type ToolRegistrationSnapshot = Readonly<{
  registered: ReadonlySet<string>;
  failed: ReadonlySet<string>;
}>;

const GOAL_DESTINATIONS: Readonly<Record<OneLabMapGoal, OnePublicLabDestinationId>> = {
  orient: "home",
  "discover-providers": "providers",
  "compare-providers": "providers",
  "evaluate-customer-support-voice-agent": "evaluate",
  "prepare-telephony-readiness": "telephony",
};

const NEXT_DESTINATION_BY_CURRENT: Readonly<Record<OnePublicLabDestinationId, OnePublicLabDestinationId>> = {
  home: "providers",
  providers: "evaluate",
  evaluate: "telephony",
  build: "telephony",
  learn: "providers",
  telephony: "providers",
};

function destinationForPathname(pathname: string): OnePublicLabDestination | null {
  const exact = ONE_PUBLIC_LAB_DESTINATIONS.find((destination) => destination.href === pathname);
  if (exact) return exact;
  if (pathname.startsWith("/providers/")) return getOnePublicLabDestination("providers");
  return null;
}

function sanitizeVisibleState(input: OneWebMcpVisibleStateInput): OneWebMcpVisibleStateInput {
  if (
    input.pathname.length > 180
    || !input.pathname.startsWith("/")
    || input.pathname.startsWith("//")
    || input.pathname.includes("\\")
    || input.pathname.includes("?")
    || input.pathname.includes("#")
  ) {
    throw new TypeError("ONE WebMCP requires a sanitized application pathname.");
  }
  const moduleId = input.pathname === "/" && (
    isOnePublicQueryModuleId(input.moduleId)
    || isOneVisibleWorkspaceModuleId(input.moduleId)
  )
    ? input.moduleId
    : null;
  return {
    pathname: input.pathname,
    moduleId,
    legacyWorkspaceActive: input.pathname === "/"
      && (moduleId !== null || input.legacyWorkspaceActive === true),
    workspaceProviderId: input.pathname === "/" && input.workspaceProviderId === "deepgram"
      ? "deepgram"
      : null,
    workspaceEvidenceScope: input.pathname === "/" && (
      input.workspaceEvidenceScope === "provider-specific"
      || input.workspaceEvidenceScope === "provider-neutral"
    ) ? input.workspaceEvidenceScope : null,
    interfaceDepth: input.interfaceDepth,
    reducedMotion: input.reducedMotion,
  };
}

function sameVisibleState(left: OneWebMcpVisibleStateInput, right: OneWebMcpVisibleStateInput) {
  return left.pathname === right.pathname
    && left.moduleId === right.moduleId
    && left.legacyWorkspaceActive === right.legacyWorkspaceActive
    && left.workspaceProviderId === right.workspaceProviderId
    && left.workspaceEvidenceScope === right.workspaceEvidenceScope
    && left.interfaceDepth === right.interfaceDepth
    && left.reducedMotion === right.reducedMotion;
}

function matchingCapabilities(
  provider: OneWebMcpProviderRecord,
  input: FindVoiceProvidersInput,
) {
  const hasCapabilityFilter = input.capabilityFamily !== undefined
    || input.supportedCapability !== undefined
    || input.integrationType !== undefined;
  const constrained = hasCapabilityFilter
    || (input.evidenceRequirement !== undefined && input.evidenceRequirement !== "unverified");
  const matches = provider.capabilities.filter((capability) => (
    capability.support === "supported"
    && (input.capabilityFamily === undefined || capability.family === input.capabilityFamily)
    && (input.supportedCapability === undefined || capability.id === input.supportedCapability)
    && (input.integrationType === undefined || capability.integrationPath === input.integrationType)
    && (
      input.evidenceRequirement === undefined
      || capability.verification === input.evidenceRequirement
    )
  ));
  return { constrained, hasCapabilityFilter, matches };
}

function queryMatches(provider: OneWebMcpProviderRecord, query: string | undefined) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("en-US");
  const searchable = [
    provider.id,
    provider.name,
    provider.description,
    provider.group,
    provider.kind,
    provider.category,
    ...provider.capabilities.flatMap((capability) => [capability.id, capability.family]),
  ].join(" ").toLocaleLowerCase("en-US");
  return searchable.includes(normalized);
}

function providerSearchResult(
  provider: OneWebMcpProviderRecord,
  supportedFacts: OneWebMcpProviderRecord["capabilities"],
) {
  return {
    id: provider.id,
    name: provider.name,
    description: provider.description,
    profilePath: provider.profilePath,
    group: provider.group,
    kind: provider.kind,
    category: provider.category,
    registryStatus: provider.registryStatus,
    supportedFacts,
    evidence: provider.evidence,
    integration: provider.integration,
    limitations: provider.limitations,
    unknowns: provider.unknowns,
  };
}

function comparisonValue(
  provider: OneWebMcpProviderRecord,
  dimension: OneProviderComparisonDimension,
) {
  const metadataProvenance = provider.evidence.sources;
  const capabilityProvenance = provider.capabilities.flatMap((capability) => capability.sources);
  const capabilityFreshness = provider.capabilities
    .map((capability) => capability.lastVerifiedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;
  const repositoryProvenance = [{
    title: "ONE Voice Lab local provider-platform projection",
    url: provider.profilePath,
    verifiedAt: null,
  }] as const;
  const base = {
    providerId: provider.id,
    providerName: provider.name,
    epistemicStatus: "observed" as const,
    inferenceUsed: false as const,
    unknowns: provider.unknowns,
  };

  if (dimension === "identity") {
    return {
      ...base,
      facts: {
        stableId: provider.id,
        name: provider.name,
        category: provider.category,
        group: provider.group,
        kind: provider.kind,
        registryStatus: provider.registryStatus,
      },
      freshness: provider.evidence.lastVerifiedAt,
      provenance: metadataProvenance,
    };
  }
  if (dimension === "capabilities") {
    return {
      ...base,
      epistemicStatus: provider.capabilities.length > 0 ? "observed" as const : "unknown" as const,
      facts: { capabilities: provider.capabilities },
      freshness: capabilityFreshness,
      provenance: capabilityProvenance,
    };
  }
  if (dimension === "evidence") {
    return {
      ...base,
      epistemicStatus: provider.evidence.metadataVerification === "unverified"
        ? "unknown" as const
        : "observed" as const,
      facts: provider.evidence,
      freshness: provider.evidence.lastVerifiedAt,
      provenance: metadataProvenance,
    };
  }
  if (dimension === "integration") {
    return {
      ...base,
      facts: provider.integration,
      freshness: null,
      provenance: repositoryProvenance,
    };
  }
  const eligibility = provider.capabilities.map((capability) => ({
    capabilityId: capability.id,
    eligibility: capability.benchmarkEligibility,
    freshness: capability.lastVerifiedAt,
    provenance: capability.sources,
  }));
  return {
    ...base,
    epistemicStatus: eligibility.length > 0 ? "observed" as const : "unknown" as const,
    facts: { capabilityBenchmarkEligibility: eligibility },
    freshness: capabilityFreshness,
    provenance: capabilityProvenance,
  };
}

function missingForDimension(
  providers: readonly OneWebMcpProviderRecord[],
  dimension: OneProviderComparisonDimension,
) {
  const missing: string[] = [];
  for (const provider of providers) {
    if (dimension === "capabilities" && provider.capabilities.length === 0) {
      missing.push(`${provider.id}: no verified capability declarations; absence is unknown, not unsupported.`);
    }
    if (dimension === "evidence") {
      if (provider.evidence.metadataVerification === "unverified") {
        missing.push(`${provider.id}: provider metadata is unverified.`);
      }
      if (provider.capabilities.length === 0) {
        missing.push(`${provider.id}: capability evidence is unavailable; absence is unknown, not unverified or unsupported.`);
      } else {
        const unverifiedCapabilities = provider.capabilities
          .filter((capability) => capability.verification === "unverified")
          .map((capability) => capability.id);
        if (unverifiedCapabilities.length > 0) {
          missing.push(`${provider.id}: capability evidence is unverified for ${unverifiedCapabilities.join(", ")}.`);
        }
      }
    }
    if (dimension === "integration" && !provider.integration.installed) {
      missing.push(`${provider.id}: catalog membership does not imply an installed integration.`);
    }
    if (dimension === "benchmark-eligibility" && provider.capabilities.length === 0) {
      missing.push(`${provider.id}: no capability-level benchmark eligibility evidence is available.`);
    }
  }
  return missing;
}

export class OneWebMcpController {
  private state: OneWebMcpControllerState;
  private readonly providers: readonly OneWebMcpProviderRecord[];
  private readonly providersById: ReadonlyMap<string, OneWebMcpProviderRecord>;
  private navigate: OneWebMcpControllerDependencies["navigate"];
  private readonly getTelephonySnapshot: OneWebMcpControllerDependencies["getTelephonySnapshot"];
  private readonly listeners = new Set<() => void>();
  private registrations: Readonly<{
    one: ToolRegistrationSnapshot | null;
    telephony: ToolRegistrationSnapshot | null;
  }> = { one: null, telephony: null };

  constructor(dependencies: OneWebMcpControllerDependencies) {
    this.providers = dependencies.providers;
    this.providersById = new Map(this.providers.map((provider) => [provider.id, provider]));
    if (this.providersById.size !== this.providers.length) {
      throw new Error("ONE WebMCP requires unique public provider identifiers.");
    }
    this.navigate = dependencies.navigate;
    this.getTelephonySnapshot = dependencies.getTelephonySnapshot;
    this.state = {
      visible: sanitizeVisibleState(dependencies.initialVisibleState),
      revision: 0,
      latestNavigation: null,
    };
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.state;
  readonly getServerSnapshot = () => this.state;

  getProviderIds() {
    return this.providers.map((provider) => provider.id);
  }

  syncToolRegistration(
    surface: "one" | "telephony",
    registeredToolNames: readonly string[],
    failedToolNames: readonly string[],
  ) {
    const allowed = new Set<string>(
      surface === "one" ? ONE_WEBMCP_TOOL_NAMES : TELEPHONY_READINESS_WEBMCP_TOOL_NAMES,
    );
    const snapshot = {
      registered: new Set(registeredToolNames.filter((name) => allowed.has(name))),
      failed: new Set(failedToolNames.filter((name) => allowed.has(name))),
    };
    this.registrations = { ...this.registrations, [surface]: snapshot };
  }

  syncNavigator(navigate: OneWebMcpControllerDependencies["navigate"]) {
    this.navigate = navigate;
  }

  syncVisibleState(input: OneWebMcpVisibleStateInput) {
    const visible = sanitizeVisibleState(input);
    const pathnameChanged = this.state.visible.pathname !== visible.pathname;
    const moduleChanged = this.state.visible.moduleId !== visible.moduleId;
    const workspaceChanged = this.state.visible.legacyWorkspaceActive !== visible.legacyWorkspaceActive;
    const pendingNavigation = this.state.latestNavigation?.status === "requested"
      ? this.state.latestNavigation
      : null;
    const arrived = pendingNavigation !== null
      && pendingNavigation.destination === visible.pathname
      && (
        pendingNavigation.routeId !== "home"
        || (visible.moduleId === null && visible.legacyWorkspaceActive !== true)
      );
    if (sameVisibleState(this.state.visible, visible) && !arrived) return;
    const visibleDestination = pathnameChanged || moduleChanged || workspaceChanged
      ? destinationForPathname(visible.pathname)
      : null;
    const disclosedVisiblePath = this.publicPathname(
      visibleDestination,
      this.providerForPathname(visible.pathname),
    );
    const visibleSurface = visible.pathname === "/" && visible.moduleId
      ? `/?module=${visible.moduleId}`
      : disclosedVisiblePath ?? "an unlisted route";
    const humanNavigation = visibleDestination && !arrived
      ? {
          sequence: this.state.revision + 1,
          source: "human-ui" as const,
          routeId: visibleDestination.id,
          fromPathname: this.publicPathname(
            destinationForPathname(this.state.visible.pathname),
            this.providerForPathname(this.state.visible.pathname),
          ),
          destination: disclosedVisiblePath ?? visibleDestination.href,
          status: "arrived" as const,
          message: `Human navigation arrived at ${visibleSurface}.`,
        }
      : null;
    this.publish({
      ...this.state,
      visible,
      latestNavigation: arrived && this.state.latestNavigation
        ? {
            ...this.state.latestNavigation,
            status: "arrived",
            message: `Arrived at ${this.state.latestNavigation.destination}.`,
          }
        : humanNavigation ?? this.state.latestNavigation,
    });
  }

  getLabMap(input: GetOneLabMapInput) {
    const current = destinationForPathname(this.state.visible.pathname);
    const suggestedId = input.goal
      ? GOAL_DESTINATIONS[input.goal]
      : current
        ? NEXT_DESTINATION_BY_CURRENT[current.id]
        : "home";
    const suggested = getOnePublicLabDestination(suggestedId);
    return {
      schemaVersion: "one-webmcp-lab-map-v1",
      labs: ONE_PUBLIC_LAB_DESTINATIONS,
      currentRouteId: current?.id ?? null,
      suggestedNextLab: {
        id: suggested.id,
        href: suggested.href,
        purpose: suggested.purpose,
        basis: input.goal ? "explicit-goal" as const : "current-visible-route" as const,
        explicitGoal: input.goal ?? null,
      },
      suggestionPolicy: "Deterministic mapping from the optional bounded goal or the current visible route; no profile or hidden behavior is inferred.",
      externalActionsAvailable: false,
    };
  }

  getCurrentContext() {
    const current = destinationForPathname(this.state.visible.pathname);
    const routeProvider = this.providerForPathname(this.state.visible.pathname);
    const workspaceProvider = this.state.visible.workspaceProviderId
      ? this.providersById.get(this.state.visible.workspaceProviderId) ?? null
      : null;
    const selectedProvider = routeProvider ?? workspaceProvider;
    const telephony = this.state.visible.pathname === "/telephony-readiness"
      ? this.getTelephonySnapshot()
      : null;
    const disclosedPathname = this.publicPathname(current, routeProvider);
    const availableActions = [
      ...ONE_WEBMCP_TOOL_NAMES.map((name) => ({
        name,
        availability: this.registrationAvailability("one", name, true),
      })),
      ...TELEPHONY_READINESS_WEBMCP_TOOL_NAMES.map((name) => ({
        name,
        availability: this.registrationAvailability("telephony", name, true),
        visibleState: telephony ? "visible-on-current-route" as const : "open-route-to-view" as const,
        routeToViewChanges: "/telephony-readiness",
      })),
    ];

    let visibleEvidenceState: Readonly<Record<string, unknown>> = {
      kind: "none",
      detail: "This route does not expose a dedicated evidence selection to the ONE-wide context tool.",
    };
    if (this.state.visible.pathname === "/providers") {
      visibleEvidenceState = {
        kind: "provider-registry",
        providerCount: this.providers.length,
        evidencePolicy: "Repository and dated provider-documentation facts remain separate from unknowns.",
      };
    } else if (routeProvider) {
      visibleEvidenceState = {
        kind: "provider-profile",
        providerId: routeProvider.id,
        evidence: routeProvider.evidence,
        unknowns: routeProvider.unknowns,
      };
    } else if (
      workspaceProvider
      && this.state.visible.workspaceEvidenceScope === "provider-specific"
    ) {
      visibleEvidenceState = {
        kind: "provider-workspace",
        providerId: workspaceProvider.id,
        evidence: workspaceProvider.evidence,
        unknowns: workspaceProvider.unknowns,
        detail: "The visible query-backed interactive workspace is provider-specific to Deepgram; this context does not invoke it.",
      };
    } else if (workspaceProvider) {
      visibleEvidenceState = {
        kind: "provider-neutral-workspace",
        workspaceProviderId: workspaceProvider.id,
        evidenceScope: "provider-neutral",
        detail: "The enclosing interactive shell is Deepgram, but this module's local or educational evidence is not attributed to that provider.",
      };
    } else if (telephony) {
      visibleEvidenceState = {
        kind: "telephony-readiness",
        provenance: "simulated",
        scenario: telephony.context.scenario,
        gateState: telephony.context.gateState,
        reportAvailable: telephony.report.available,
        evidenceStale: telephony.report.stale,
      };
    } else if (this.state.visible.pathname === "/evaluate") {
      visibleEvidenceState = {
        kind: "fixture-first-evaluation",
        provenance: "simulated-until-a-separately-gated-human-action",
        detail: "The default evaluation surface uses deterministic fixtures and does not establish live provider results.",
      };
    }

    return {
      schemaVersion: "one-webmcp-current-context-v1",
      currentRoute: {
        pathname: disclosedPathname,
        routeId: current?.id ?? null,
        label: current?.label ?? null,
        disclosure: disclosedPathname === null ? "redacted-unlisted" as const : "public-canonical" as const,
      },
      currentLabOrModule: this.state.visible.moduleId
        ?? (workspaceProvider ? "deepgram-workspace" : current?.id ?? null),
      selectedProvider: selectedProvider
        ? {
            id: selectedProvider.id,
            name: selectedProvider.name,
            evidence: selectedProvider.evidence,
          }
        : null,
      selectedScenario: telephony?.context.scenario ?? null,
      visibleEvidenceState,
      availableWebMcpActions: availableActions,
      registrationEvidence: {
        one: this.registrationEvidence("one"),
        telephony: this.registrationEvidence("telephony"),
      },
      safeSuggestedNextActions: this.suggestedActions(current, selectedProvider, telephony !== null),
      accessibilityPreferences: {
        interfaceDepth: this.state.visible.interfaceDepth,
        applicationReducedMotionSetting: this.state.visible.reducedMotion,
        systemReducedMotionAlsoRespectedByCss: true,
        systemReducedMotionValueExposed: false,
      },
      latestNavigation: this.state.latestNavigation,
      externalActionsAvailable: false,
      consequentialActionsRemainHumanControlled: true,
    };
  }

  findProviders(input: FindVoiceProvidersInput) {
    const matched = this.providers.flatMap((provider) => {
      if (input.group !== undefined && provider.group !== input.group) return [];
      if (input.kind !== undefined && provider.kind !== input.kind) return [];
      if (!queryMatches(provider, input.query)) return [];
      const capabilityMatch = matchingCapabilities(provider, input);
      if (
        input.evidenceRequirement === "unverified"
        && !capabilityMatch.hasCapabilityFilter
        && provider.evidence.metadataVerification !== "unverified"
        && !provider.capabilities.some((capability) => capability.verification === "unverified")
      ) return [];
      if (capabilityMatch.constrained && capabilityMatch.matches.length === 0) return [];
      const facts = capabilityMatch.constrained || input.evidenceRequirement === "unverified"
        ? capabilityMatch.matches
        : provider.capabilities.filter((capability) => capability.support === "supported");
      return [providerSearchResult(provider, facts)];
    });
    const providers = matched.slice(0, input.maxResults);
    return {
      schemaVersion: "one-webmcp-provider-search-v1",
      filters: input,
      filterSemantics: {
        supportedCapability: "Matches only declarations whose support field is exactly 'supported'.",
        evidenceRequirement: "Matches an exact existing capability-verification value; 'unverified' also matches explicitly unverified provider metadata.",
        missingCapability: "A missing declaration is unknown and never treated as unsupported.",
      },
      totalMatched: matched.length,
      returned: providers.length,
      truncated: matched.length > providers.length,
      ordering: "Stable provider identifier; this order is not a ranking.",
      dataScope: "Credential-free, policy-neutral public registry evidence. Runtime configuration, credentials, health, and live readiness are not exposed.",
      providers,
      providerRequestsMade: 0,
    };
  }

  compareProviders(input: CompareVoiceProvidersInput) {
    const providers = input.providerIds.map((providerId) => {
      const provider = this.providersById.get(providerId);
      if (!provider) throw new RangeError(`Unknown public provider identifier: ${providerId}`);
      return provider;
    });
    return {
      schemaVersion: "one-webmcp-provider-comparison-v1",
      comparisonType: "registry_evidence_only",
      dataScope: "Credential-free, policy-neutral public registry evidence. Runtime configuration, credentials, health, and live readiness are not exposed.",
      providerIds: input.providerIds,
      dimensions: input.dimensions.map((dimension) => ({
        id: dimension,
        values: providers.map((provider) => comparisonValue(provider, dimension)),
        missingOrIncomparable: missingForDimension(providers, dimension),
      })),
      rankingProvided: false,
      winner: null,
      inferenceUsed: false,
      observedStatusDefinition: "Observed means copied from ONE's sanitized registry snapshot; it does not mean a live provider measurement.",
      missingOrIncomparable: [
        "Equivalent measured latency, quality, pricing, security, and production-availability evidence is not present in this registry comparison.",
        "Infrastructure and evaluation systems are not treated as speech-model providers.",
      ],
      limitations: [
        "This comparison preserves exact registry facts and unknowns; it does not manufacture compatibility or a winner.",
        "Provider documentation, repository integration, deterministic fixtures, and live measurements are distinct evidence classes.",
      ],
      providerRequestsMade: 0,
    };
  }

  async openLab(input: OpenOneLabInput) {
    const destination = getOnePublicLabDestination(input.routeId);
    const fromPathname = this.state.visible.pathname;
    const pendingNavigation = this.state.latestNavigation?.status === "requested"
      ? this.state.latestNavigation
      : null;
    if (pendingNavigation?.destination === destination.href) {
      return this.navigationResult(destination, pendingNavigation, {
        coalescedExistingRequest: true,
        sameOriginNavigationRequested: false,
      });
    }
    const destinationAlreadyVisible = this.isDestinationVisible(destination);
    const canonicalSurfaceAlreadyOpen = destinationAlreadyVisible && pendingNavigation === null;
    if (canonicalSurfaceAlreadyOpen) {
      const navigation = this.nextNavigation(destination, fromPathname, "already-open", `Already at ${destination.href}.`);
      this.publish({ ...this.state, latestNavigation: navigation });
      return this.navigationResult(destination, navigation);
    }

    const requested = this.nextNavigation(
      destination,
      fromPathname,
      "requested",
      `Requested internal navigation to ${destination.href}. Read current context after the route transition to verify arrival.`,
    );
    this.publish({ ...this.state, latestNavigation: requested });
    try {
      await this.navigate(destination.href);
      if (
        this.state.latestNavigation?.sequence === requested.sequence
        && this.state.latestNavigation.status === "requested"
        && destinationAlreadyVisible
        && pendingNavigation !== null
        && this.isDestinationVisible(destination)
      ) {
        const arrived = {
          ...requested,
          status: "arrived" as const,
          message: `Navigation to ${destination.href} superseded an older request; the destination is visibly open.`,
        };
        this.publish({ ...this.state, latestNavigation: arrived });
        return this.navigationResult(destination, arrived, {
          coalescedExistingRequest: false,
          sameOriginNavigationRequested: true,
        });
      }
      return this.navigationResult(destination, requested);
    } catch {
      const failed = { ...requested, status: "failed" as const, message: `Navigation to ${destination.href} failed locally.` };
      if (
        this.state.latestNavigation?.sequence === requested.sequence
        && this.state.latestNavigation.status === "requested"
      ) {
        this.publish({ ...this.state, latestNavigation: failed });
      }
      throw new Error("The allowlisted ONE navigation request failed.");
    }
  }

  private suggestedActions(
    current: OnePublicLabDestination | null,
    selectedProvider: OneWebMcpProviderRecord | null,
    telephonyActive: boolean,
  ) {
    if (telephonyActive) {
      return ["Read the current readiness context.", "Run or inspect deterministic evidence.", "Keep any live call or provider action under human control."];
    }
    if (selectedProvider) {
      return [`Compare ${selectedProvider.id} with one or two known provider IDs.`, "Return to the Provider Hub to inspect visible evidence."];
    }
    if (current?.id === "providers") {
      return ["Search the current public registry.", "Compare two or three known provider IDs without requesting a ranking."];
    }
    if (current?.id === "evaluate") {
      return ["Inspect fixture evidence in the human UI.", "Open telephony readiness for deterministic production-stress evidence."];
    }
    return ["Read the ONE lab map.", "Open the Provider Hub for evidence-backed discovery."];
  }

  private nextNavigation(
    destination: OnePublicLabDestination,
    fromPathname: string,
    status: OneWebMcpNavigationState["status"],
    message: string,
  ): OneWebMcpNavigationState {
    return {
      sequence: this.state.revision + 1,
      source: "webmcp-agent",
      routeId: destination.id,
      fromPathname: this.publicPathname(
        destinationForPathname(fromPathname),
        this.providerForPathname(fromPathname),
      ),
      destination: destination.href,
      status,
      message,
    };
  }

  private navigationResult(
    destination: OnePublicLabDestination,
    navigation: OneWebMcpNavigationState,
    invocation: Readonly<{
      coalescedExistingRequest: boolean;
      sameOriginNavigationRequested: boolean;
    }> = {
      coalescedExistingRequest: false,
      sameOriginNavigationRequested: navigation.status === "requested",
    },
  ) {
    return {
      ok: true,
      navigation,
      requestDisposition: invocation.coalescedExistingRequest
        ? "coalesced-existing-request" as const
        : navigation.status === "already-open"
          ? "already-open" as const
          : "new-navigation-request" as const,
      destination: {
        id: destination.id,
        href: destination.href,
        label: destination.label,
        purpose: destination.purpose,
        availableSiteTools: destination.agentActions,
      },
      sideEffects: {
        localNavigationOnly: true,
        sameOriginNavigationRequested: invocation.sameOriginNavigationRequested,
        externalRequestInitiated: false,
        providerActionInitiated: false,
        credentialsChanged: false,
        persistedUserDataChanged: false,
      },
    };
  }

  private isDestinationVisible(destination: OnePublicLabDestination) {
    return this.state.visible.pathname === destination.href
      && (
        destination.id !== "home"
        || (
          this.state.visible.moduleId === null
          && this.state.visible.legacyWorkspaceActive !== true
        )
      );
  }

  private providerForPathname(pathname: string) {
    if (!pathname.startsWith("/providers/")) return null;
    const providerId = pathname.split("/")[2];
    return providerId ? this.providersById.get(providerId) ?? null : null;
  }

  private publicPathname(
    destination: OnePublicLabDestination | null,
    selectedProvider: OneWebMcpProviderRecord | null,
  ) {
    if (selectedProvider) return selectedProvider.profilePath;
    return destination?.href ?? null;
  }

  private registrationAvailability(
    surface: "one" | "telephony",
    toolName: string,
    routeApplicable: boolean,
  ) {
    const registration = this.registrations[surface];
    if (!registration) return "registration-pending" as const;
    if (registration.registered.size === 0 && registration.failed.size === 0) {
      return "registration-pending" as const;
    }
    if (registration.failed.has(toolName)) return "registration-failed" as const;
    if (!registration.registered.has(toolName)) return "unavailable" as const;
    return routeApplicable ? "available" as const : "open-route-first" as const;
  }

  private registrationEvidence(surface: "one" | "telephony") {
    const registration = this.registrations[surface];
    if (!registration) {
      return { state: "pending" as const, registeredToolNames: [], failedToolNames: [] };
    }
    return {
      state: registration.registered.size === 0 && registration.failed.size === 0
        ? "pending" as const
        : registration.failed.size > 0
        ? registration.registered.size > 0 ? "partial" as const : "error" as const
        : "ready" as const,
      registeredToolNames: [...registration.registered],
      failedToolNames: [...registration.failed],
    };
  }

  private publish(next: Omit<OneWebMcpControllerState, "revision"> & { revision?: number }) {
    this.state = { ...next, revision: this.state.revision + 1 };
    this.listeners.forEach((listener) => listener());
  }
}

export function createOneWebMcpController(dependencies: OneWebMcpControllerDependencies) {
  return new OneWebMcpController(dependencies);
}

export const ONE_WEBMCP_SUPPORTED_GOALS = ONE_LAB_MAP_GOALS;
export const ONE_WEBMCP_SUPPORTED_COMPARISON_DIMENSIONS = ONE_PROVIDER_COMPARISON_DIMENSIONS;

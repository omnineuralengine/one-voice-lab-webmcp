"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { useOneExperience } from "@/components/one/OneExperienceProvider";
import { useTelephonyReadiness } from "@/components/telephony-readiness/TelephonyReadinessProvider";
import {
  createOneWebMcpController,
  type OneWebMcpController,
} from "@/lib/one-webmcp/controller";
import type { OneWebMcpProviderRecord } from "@/lib/one-webmcp/provider-data";
import {
  registerOneWebMcpTools,
  type OneWebMcpRegistrationStatus,
} from "@/lib/one-webmcp/webmcp";
import {
  ONE_VISIBLE_WORKSPACE_EVENT,
  ONE_VISIBLE_WORKSPACE_PROVIDER_ID,
  evidenceScopeForOneVisibleWorkspaceModule,
  isOneVisibleWorkspaceModuleId,
  readOneVisibleWorkspaceEvent,
  type OneVisibleWorkspace,
} from "@/lib/one-webmcp/visible-context";

const EXPLORE_PROMPT = "Show me what I can explore in ONE and recommend the best lab for evaluating a customer-support voice agent.";
const DISCOVERY_PROMPT = "Find providers relevant to a low-latency, interruption-heavy voice agent, compare the strongest documented options, then open the telephony-readiness lab. Treat strongest as the best documented match to my explicit criteria; preserve unknowns and do not fabricate a ranking or winner.";

type OneWebMcpProviderProps = Readonly<{
  providers: readonly OneWebMcpProviderRecord[];
}>;

const INITIAL_STATUS: OneWebMcpRegistrationStatus | Readonly<{
  state: "detecting";
  registeredToolNames: readonly [];
  failedToolNames: readonly [];
  message: string;
}> = {
  state: "detecting",
  registeredToolNames: [],
  failedToolNames: [],
  message: "Checking whether this browser supports ONE-wide WebMCP site tools.",
};

export function OneWebMcpProvider({ providers }: OneWebMcpProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const moduleCandidate = searchParams.get("module");
  const moduleId = pathname === "/" && isOneVisibleWorkspaceModuleId(moduleCandidate)
    ? moduleCandidate
    : null;
  const legacyWorkspaceActive = pathname === "/" && Boolean(
    moduleCandidate
    || searchParams.get("operation")
    || searchParams.get("workflow")
    || searchParams.get("command") === "1",
  );
  const { interfaceDepth, theme } = useOneExperience();
  const telephony = useTelephonyReadiness();
  const [visibleWorkspace, setVisibleWorkspace] = useState<OneVisibleWorkspace | null>(null);
  const currentWorkspace = pathname === "/" ? visibleWorkspace : null;
  const currentModuleId = currentWorkspace?.moduleId ?? moduleId;
  const workspaceProviderId = currentWorkspace !== null
    ? currentWorkspace.providerId
    : (
      isOneVisibleWorkspaceModuleId(moduleId)
        ? ONE_VISIBLE_WORKSPACE_PROVIDER_ID
        : legacyWorkspaceActive ? "deepgram" : null
    );
  const workspaceEvidenceScope = currentWorkspace !== null
    ? currentWorkspace.evidenceScope
    : isOneVisibleWorkspaceModuleId(moduleId)
      ? evidenceScopeForOneVisibleWorkspaceModule(moduleId)
      : legacyWorkspaceActive ? "provider-specific" : null;
  // Next 16 treats exact-URL pushes as segment refreshes while retaining
  // navigation priority over an older pending route request.
  const navigate = useCallback((href: string) => router.push(href), [router]);

  const [controller] = useState<OneWebMcpController>(() => createOneWebMcpController({
    providers,
    initialVisibleState: {
      pathname,
      moduleId: currentModuleId,
      legacyWorkspaceActive,
      workspaceProviderId,
      workspaceEvidenceScope,
      interfaceDepth,
      reducedMotion: theme.reducedMotion,
    },
    navigate,
    getTelephonySnapshot: () => ({
      context: telephony.controller.getContext(),
      report: telephony.controller.getReport(),
    }),
  }));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const [registrationStatus, setRegistrationStatus] = useState(INITIAL_STATUS);
  const [copyStatus, setCopyStatus] = useState("Prompts are ready to copy.");

  useEffect(() => {
    controller.syncNavigator(navigate);
  }, [controller, navigate]);

  useEffect(() => {
    function onVisibleWorkspace(event: Event) {
      const detail = readOneVisibleWorkspaceEvent(event);
      if (!detail) return;
      setVisibleWorkspace(detail.active ? detail : null);
    }
    window.addEventListener(ONE_VISIBLE_WORKSPACE_EVENT, onVisibleWorkspace);
    return () => window.removeEventListener(ONE_VISIBLE_WORKSPACE_EVENT, onVisibleWorkspace);
  }, []);

  useEffect(() => {
    controller.syncVisibleState({
      pathname,
      moduleId: currentModuleId,
      legacyWorkspaceActive,
      workspaceProviderId,
      workspaceEvidenceScope,
      interfaceDepth,
      reducedMotion: theme.reducedMotion,
    });
  }, [controller, currentModuleId, interfaceDepth, legacyWorkspaceActive, pathname, theme.reducedMotion, workspaceEvidenceScope, workspaceProviderId]);

  useEffect(() => {
    registerOneWebMcpTools(document, controller, setRegistrationStatus);
  }, [controller]);

  useEffect(() => {
    controller.syncToolRegistration(
      "telephony",
      telephony.siteToolsStatus.registeredToolNames,
      telephony.siteToolsStatus.failedToolNames,
    );
  }, [controller, telephony.siteToolsStatus]);

  const telephonyToolCount = telephony.siteToolsStatus.registeredToolNames.length;
  const registeredToolCount = registrationStatus.registeredToolNames.length + telephonyToolCount;
  const ready = registrationStatus.state === "ready" && telephony.siteToolsStatus.state === "ready";
  const bothUnsupported = registrationStatus.state === "unsupported"
    && telephony.siteToolsStatus.state === "unsupported";
  const detecting = registrationStatus.state === "detecting"
    || telephony.siteToolsStatus.state === "detecting";
  const registrationError = registrationStatus.state === "error"
    ? registrationStatus.message
    : telephony.siteToolsStatus.state === "error"
      ? telephony.siteToolsStatus.message
      : null;
  const supportLabel = ready
    ? `${registeredToolCount} site tools ready`
    : registrationError
      ? registrationError
    : bothUnsupported
      ? "Human interface ready · WebMCP unavailable"
      : detecting
        ? "Checking agent support"
        : `${registeredToolCount} of 10 site tools registered`;

  async function copyPrompt(prompt: string, label: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(prompt);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus(`Select the ${label.toLocaleLowerCase("en-US")} text and copy it manually.`);
    }
  }

  const latestSource = state.latestNavigation?.source === "webmcp-agent"
    ? "WebMCP agent"
    : "Human UI";

  return (
    <aside className="one-agent-entry" data-one-agent-entry>
      <details>
        <summary>
          <span>Use ONE with your agent</span>
          <small aria-live="polite" role="status">{supportLabel}</small>
        </summary>
        <div aria-label="ONE agent guide" className="one-agent-entry__panel" role="region">
          <p>
            ONE supplies structured application data; WebMCP gives an agent controlled access to it.
            Provider discovery is evidence-backed, comparisons preserve unknowns, simulations are not
            live provider results, and consequential actions remain human-controlled.
          </p>
          <PromptCard
            buttonLabel="Copy exploration prompt"
            id="one-agent-explore-prompt"
            label="Explore ONE prompt"
            onCopy={() => void copyPrompt(EXPLORE_PROMPT, "Exploration prompt")}
            prompt={EXPLORE_PROMPT}
          />
          <PromptCard
            buttonLabel="Copy provider workflow prompt"
            id="one-agent-provider-prompt"
            label="Provider discovery prompt"
            onCopy={() => void copyPrompt(DISCOVERY_PROMPT, "Provider workflow prompt")}
            prompt={DISCOVERY_PROMPT}
          />
          <p aria-live="polite" className="one-agent-entry__copy-status" role="status">{copyStatus}</p>
        </div>
      </details>
      {state.latestNavigation ? (
        <p aria-live="polite" className="one-agent-entry__activity" role="status">
          <strong>{latestSource}:</strong> {state.latestNavigation.message}
        </p>
      ) : null}
    </aside>
  );
}

export function OneWebMcpProviderFallback() {
  return (
    <aside className="one-agent-entry one-agent-entry--loading" data-one-agent-entry>
      <span>Use ONE with your agent</span>
      <small>Loading the human-safe agent guide</small>
    </aside>
  );
}

function PromptCard({
  buttonLabel,
  id,
  label,
  onCopy,
  prompt,
}: Readonly<{
  buttonLabel: string;
  id: string;
  label: string;
  onCopy(): void;
  prompt: string;
}>) {
  return (
    <div className="one-agent-entry__prompt">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} readOnly rows={3} value={prompt} />
      <button onClick={onCopy} type="button">{buttonLabel}</button>
    </div>
  );
}

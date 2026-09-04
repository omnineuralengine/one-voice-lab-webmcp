"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useVoiceLabActions } from "@/components/actions/VoiceLabActionProvider";
import { useRegisterVoiceLabAction } from "@/components/actions/useRegisterVoiceLabAction";
import { ExplainThis } from "@/components/one/AdaptiveInterface";
import { ModulePanel, ModuleStatusStrip, ModuleWorkspace } from "@/components/one/ModulePrimitives";
import { useOneExperience } from "@/components/one/OneExperienceProvider";
import {
  resolveScenarioIdentityScope,
  scenarioIdentityChanged,
} from "@/components/scenarios/identity-scope";
import {
  SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  USER_SCENARIO_ID,
  USER_SCENARIO_VERSION,
  scenarioRunResponseSchema,
  type ScenarioExplanation,
  type ScenarioExplanationStatement,
  type ScenarioReviewGoal,
  type ScenarioRunReceipt,
  type ScenarioRunRequest,
  type ScenarioRunResponse,
} from "@/lib/scenarios/contracts";
import { USER_SCENARIO_PRESENTATIONS } from "@/lib/scenarios/presentation";
import {
  depthIncludes,
  INTERFACE_DEPTHS,
  type InterfaceDepth,
} from "@/lib/one/interface-depth";

const MAX_SCENARIO_RESPONSE_BYTES = 196_608;
const scenario = USER_SCENARIO_PRESENTATIONS[0];

type StudioStatus = "idle" | "running" | "complete" | "error";

const EXPLANATION_CATEGORY_LABELS: Record<ScenarioExplanationStatement["category"], string> = {
  happened: "What happened",
  supports: "What the evidence supports",
  uncertainty: "What remains uncertain",
  next: "What to check next",
};

const EPISTEMIC_LABELS: Record<ScenarioRunReceipt["evidence"][number]["epistemicState"], string> = {
  observed: "Observed in the fixture",
  derived: "Derived from fixture evidence",
  unknown: "Unknown",
  not_measured: "Not measured",
};

export function ScenarioStudio() {
  const one = useOneExperience();
  const { dispatch } = useVoiceLabActions();
  const [reviewGoal, setReviewGoal] = useState<ScenarioReviewGoal | null>(null);
  const [scenarioDepth, setScenarioDepth] = useState<InterfaceDepth>("guided");
  const [reviewGoalError, setReviewGoalError] = useState("");
  const [status, setStatus] = useState<StudioStatus>("idle");
  const [response, setResponse] = useState<ScenarioRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identityNotice, setIdentityNotice] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const reviewGoalErrorRef = useRef<HTMLParagraphElement>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const activeGenerationRef = useRef(0);
  const runningRef = useRef(false);
  const hasReceiptRef = useRef(false);

  const identityScope = useMemo(
    () => resolveScenarioIdentityScope(one.authReady, one.user?.id ?? null),
    [one.authReady, one.user?.id],
  );
  const identityScopeRef = useRef(identityScope);

  useRegisterVoiceLabAction("scenario.runFixture", requestScenarioRun, {
    isAvailable: () => identityScope.ready,
    unavailableMessage: "Wait until ONE finishes checking the current account.",
  });

  useEffect(() => {
    const previous = identityScopeRef.current;
    if (!scenarioIdentityChanged(previous, identityScope)) return;

    const hadEphemeralRun = runningRef.current || hasReceiptRef.current;
    identityScopeRef.current = identityScope;
    activeGenerationRef.current += 1;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    runningRef.current = false;
    hasReceiptRef.current = false;
    setStatus("idle");
    setResponse(null);
    setError(null);
    setReviewGoalError("");
    if (hadEphemeralRun) {
      setIdentityNotice("The verified identity changed, so ONE discarded the prior ephemeral run and ignored any stale response.");
    }
  }, [identityScope]);

  useEffect(() => {
    if (status === "error") errorRef.current?.focus();
  }, [status]);

  useEffect(() => () => activeControllerRef.current?.abort(), []);

  async function runScenario() {
    if (runningRef.current || !identityScope.ready) return;
    if (!reviewGoal) {
      setReviewGoalError("Choose what you want to understand before running this fixture.");
      window.requestAnimationFrame(() => reviewGoalErrorRef.current?.focus());
      return;
    }

    const controller = new AbortController();
    const generation = activeGenerationRef.current;
    activeControllerRef.current = controller;
    runningRef.current = true;
    hasReceiptRef.current = false;
    setStatus("running");
    setResponse(null);
    setError(null);
    setIdentityNotice("");

    const request: ScenarioRunRequest = {
      schemaVersion: SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
      scenarioId: USER_SCENARIO_ID,
      scenarioVersion: USER_SCENARIO_VERSION,
      reviewGoal,
      executionMode: "synthetic_fixture",
      correlationToken: crypto.randomUUID(),
    };
    const result = await dispatch("scenario.runFixture", request, {
      source: "ui",
      signal: controller.signal,
      userGesture: true,
    });

    if (generation !== activeGenerationRef.current || controller.signal.aborted) return;
    activeControllerRef.current = null;
    runningRef.current = false;

    if (!result.ok) {
      setError(result.error.message);
      setStatus("error");
      return;
    }

    setResponse(result.data);
    hasReceiptRef.current = true;
    setStatus("complete");
  }

  return (
    <>
      <ModuleStatusStrip
        items={[
          { label: "Execution", value: "Synthetic fixture", tone: "green" },
          { label: "Retention", value: "Ephemeral · no store", tone: "purple" },
          { label: "Provider calls", value: "0", tone: "green" },
          { label: "Provider credits", value: "0", tone: "green" },
        ]}
        label="Scenario run boundaries"
      />

      <div className="scenario-studio-controls">
        <p className="scenario-studio-identity" data-scenario-identity-state={identityScope.ready ? (one.user ? "authenticated" : "guest") : "checking"}>
          <span aria-hidden="true" />
          {identityScope.label}
        </p>
        <ScenarioDepthControl depth={scenarioDepth} onDepth={setScenarioDepth} />
      </div>

      <ModuleWorkspace className="scenario-studio-workspace" layout="split">
        <ModulePanel
          description="One curated interruption journey. Your choice changes the explanation emphasis, never the fixture, provider, action, or authority."
          title="Choose what you want to understand"
        >
          <fieldset aria-describedby={reviewGoalError ? "scenario-review-goal-error" : undefined} className="scenario-review-goals">
            <legend>Review focus</legend>
            <div>
              {scenario.reviewGoals.map((goal) => (
                <label key={goal.id}>
                  <input
                    checked={reviewGoal === goal.id}
                    disabled={status === "running" || !identityScope.ready}
                    name="scenario-review-goal"
                    onChange={() => {
                      setReviewGoal(goal.id);
                      setReviewGoalError("");
                    }}
                    type="radio"
                    value={goal.id}
                  />
                  <span><strong>{goal.label}</strong><small>{goal.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          {reviewGoalError ? (
            <p className="scenario-review-goal-error" id="scenario-review-goal-error" ref={reviewGoalErrorRef} role="alert" tabIndex={-1}>
              {reviewGoalError}
            </p>
          ) : null}

          <section aria-labelledby="scenario-preview-title" className="scenario-preview">
            <p className="one-module-eyebrow">Curated scenario</p>
            <h3 id="scenario-preview-title">{scenario.title}</h3>
            <p>{scenario.goal}</p>
            <ol aria-label="What this run will do">
              <li><span>1</span><p><strong>Replay a repository-owned interruption fixture.</strong><small>No microphone, upload, or voice provider is contacted. Existing account and quota checks still apply.</small></p></li>
              <li><span>2</span><p><strong>Execute the existing canonical evaluation action.</strong><small>The fixture is fixed; this screen cannot choose another action or provider.</small></p></li>
              <li><span>3</span><p><strong>Create one sanitized receipt and explanation.</strong><small>Both stay in this tab only and disappear on refresh, navigation, logout, or account change.</small></p></li>
            </ol>
          </section>

          <div className="scenario-run-boundary" role="note">
            <strong>Preflight confirmed</strong>
            <p>Synthetic fixture · ephemeral/no-store · 0 provider calls · 0 provider credits.</p>
          </div>

          <button
            className="scenario-run-button"
            disabled={status === "running" || !identityScope.ready}
            onClick={() => void runScenario()}
            type="button"
          >
            {status === "running" ? "Running the bounded fixture…" : scenario.actionLabel}
          </button>

          <div aria-atomic="true" aria-live="polite" className="scenario-run-status" role="status">
            {status === "idle" ? "Ready. Nothing runs until you choose the button." : null}
            {status === "running" ? "Executing one deterministic fixture. ONE does not fabricate a progress estimate." : null}
            {status === "complete" && response ? receiptStatusMessage(response.receipt) : null}
          </div>
          {identityNotice ? <p aria-live="polite" className="scenario-identity-notice">{identityNotice}</p> : null}
          {status === "error" ? (
            <div className="scenario-run-error" ref={errorRef} role="alert" tabIndex={-1}>
              <strong>The scenario did not complete.</strong>
              <p>{error ?? "The bounded fixture is unavailable. No provider request was made."}</p>
              <button onClick={() => void runScenario()} type="button">Try the same fixture again</button>
            </div>
          ) : null}
        </ModulePanel>

        <ModulePanel
          description="Lifecycle, evidence, and interpretation are separate so a completed action is never mistaken for a universal quality claim."
          title="Run receipt"
        >
          {response ? (
            <ScenarioRunResult depth={scenarioDepth} explanation={response.explanation} receipt={response.receipt} response={response} />
          ) : (
            <div className="scenario-receipt-empty">
              <span aria-hidden="true">01</span>
              <h3>Your receipt will appear here</h3>
              <p>It will show what ran, what the synthetic evidence supports, what remains uncertain, and the exact boundary of this no-spend run.</p>
            </div>
          )}
        </ModulePanel>
      </ModuleWorkspace>
    </>
  );
}

function ScenarioRunResult({
  depth,
  explanation,
  receipt,
  response,
}: {
  depth: InterfaceDepth;
  explanation: ScenarioExplanation;
  receipt: ScenarioRunReceipt;
  response: ScenarioRunResponse;
}) {
  return (
    <article className="scenario-receipt" data-scenario-lifecycle={receipt.lifecycle.status}>
      <header>
        <div>
          <p className="one-module-eyebrow">Canonical ephemeral receipt</p>
          <h3>{lifecycleLabel(receipt.lifecycle.status)}</h3>
        </div>
        <span className={`scenario-receipt-outcome scenario-receipt-outcome--${receipt.evaluation.outcome}`}>
          {evaluationOutcomeLabel(receipt.evaluation.outcome)}
        </span>
      </header>

      <dl className="scenario-receipt-summary">
        <div><dt>Run lifecycle</dt><dd>{lifecycleLabel(receipt.lifecycle.status)}</dd></div>
        <div><dt>Evaluation conclusion</dt><dd>{evaluationOutcomeLabel(receipt.evaluation.outcome)}</dd></div>
        <div><dt>Evidence completeness</dt><dd>{capitalize(receipt.evidenceCompleteness)}</dd></div>
        <div><dt>Retention</dt><dd>Ephemeral · no store</dd></div>
      </dl>

      <section aria-labelledby="scenario-evidence-title" className="scenario-evidence">
        <h4 id="scenario-evidence-title">Receipt evidence</h4>
        <ul>
          {receipt.evidence.map((item) => (
            <li id={`scenario-evidence-${item.id}`} key={item.id}>
              <span>{EPISTEMIC_LABELS[item.epistemicState]}</span>
              <p>{item.claim}</p>
            </li>
          ))}
        </ul>
      </section>

      <ExplainThis summary="Explain this run">
        <div className="scenario-explanation" data-explanation-engine={explanation.generatedBy}>
          {explanation.statements.map((statement) => (
            <section key={statement.id}>
              <p className="scenario-explanation-category">{EXPLANATION_CATEGORY_LABELS[statement.category]}</p>
              <p>{statement.text}</p>
              <small>Based on: {statement.basisRefs.join(", ")}</small>
            </section>
          ))}
          <p className="scenario-explanation-boundary">This explanation is a pure, versioned rule projection over the receipt. It is not generated by a model.</p>
        </div>
      </ExplainThis>

      <section aria-labelledby="scenario-limitations-title" className="scenario-limitations">
        <h4 id="scenario-limitations-title">Limits of this run</h4>
        <ul>{receipt.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </section>

      <ScenarioTechnicalDetails
        className="scenario-technical-details"
        depth={depth}
        description="Versioned fixture identity, sanitized evidence, lifecycle metadata, and content digests."
        summary="Inspect the sanitized receipt"
      >
        <dl>
          <div><dt>Receipt schema</dt><dd>{receipt.schemaVersion}</dd></div>
          <div><dt>Scenario</dt><dd>{receipt.scenario.id} · {receipt.scenario.version}</dd></div>
          <div><dt>Fixture</dt><dd>{receipt.fixture.id} · {receipt.fixture.version}</dd></div>
          <div><dt>Canonical action</dt><dd>{receipt.action.id}</dd></div>
          <div><dt>Execution</dt><dd>{receipt.execution.mode}</dd></div>
          <div><dt>Actor scope</dt><dd>{receipt.execution.actorScope}</dd></div>
          <div><dt>Provider calls / credits</dt><dd>{receipt.execution.providerCalls} / {receipt.execution.providerCredits}</dd></div>
          <div><dt>Normalized receipt digest</dt><dd>{receipt.normalizedDigest}</dd></div>
        </dl>
        <details className="scenario-json-details">
          <summary>Read sanitized JSON</summary>
          <pre tabIndex={0}>{JSON.stringify(response, null, 2)}</pre>
        </details>
      </ScenarioTechnicalDetails>
    </article>
  );
}

function ScenarioDepthControl({
  depth,
  onDepth,
}: {
  depth: InterfaceDepth;
  onDepth: (depth: InterfaceDepth) => void;
}) {
  const descriptionId = "scenario-depth-description";
  return (
    <fieldset className="one-depth-control one-depth-control--compact" data-depth-source="scenario-ephemeral">
      <legend>Scenario detail</legend>
      <p id={descriptionId}>This changes presentation only. It never changes the receipt, access, ownership, provider policy, or what an action can do.</p>
      <div aria-describedby={descriptionId} className="one-depth-control__options">
        {INTERFACE_DEPTHS.map((option) => {
          const labelId = `scenario-depth-${option.id}-label`;
          const optionDescriptionId = `scenario-depth-${option.id}-description`;
          return (
            <label key={option.id} title={option.description}>
              <input
                aria-describedby={`${descriptionId} ${optionDescriptionId}`}
                aria-labelledby={labelId}
                checked={depth === option.id}
                name="scenario-depth-choices"
                onChange={() => onDepth(option.id)}
                type="radio"
                value={option.id}
              />
              <span id={labelId}>{option.label}</span>
              <small className="sr-only" id={optionDescriptionId}>{option.description}</small>
            </label>
          );
        })}
      </div>
      <p aria-live="polite" className="one-depth-control__status">This scenario detail stays in this tab and is not saved.</p>
    </fieldset>
  );
}

function ScenarioTechnicalDetails({
  children,
  className,
  depth,
  description,
  summary,
}: {
  children: ReactNode;
  className?: string;
  depth: InterfaceDepth;
  description: string;
  summary: string;
}) {
  if (depthIncludes(depth, "technical")) {
    return (
      <section className={`one-adaptive-section ${className ?? ""}`} data-adaptive-minimum="technical" data-adaptive-state="expanded-by-scenario-preference">
        {children}
      </section>
    );
  }
  return (
    <details className={`one-adaptive-disclosure ${className ?? ""}`} data-adaptive-minimum="technical" data-adaptive-state="available-on-request">
      <summary><span>{summary}</span><small>{description}</small></summary>
      <div className="one-adaptive-disclosure__body">{children}</div>
    </details>
  );
}

async function requestScenarioRun(
  input: ScenarioRunRequest,
  context: { signal?: AbortSignal },
): Promise<ScenarioRunResponse> {
  const response = await fetch("/api/scenarios/run", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: context.signal,
  });

  if (!response.ok) throw new Error(messageForScenarioResponse(response.status));
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SCENARIO_RESPONSE_BYTES) {
    throw new Error("The sanitized scenario receipt exceeded ONE's response limit.");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_SCENARIO_RESPONSE_BYTES) {
    throw new Error("The sanitized scenario receipt exceeded ONE's response limit.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("ONE returned an unreadable scenario receipt.");
  }
  const validated = scenarioRunResponseSchema.safeParse(parsed);
  if (!validated.success) throw new Error("ONE returned an invalid scenario receipt.");
  return validated.data;
}

function messageForScenarioResponse(status: number) {
  if (status === 400 || status === 415 || status === 422) return "The bounded scenario request was rejected. Choose a review focus and try again.";
  if (status === 429) return "Scenario runs are temporarily limited. Wait a moment before trying again.";
  if (status === 401 || status === 403) return "ONE could not verify this same-origin scenario action.";
  if (status === 503) return "The deterministic scenario fixture is temporarily unavailable.";
  return "ONE could not complete the deterministic scenario. No provider request was made.";
}

function receiptStatusMessage(receipt: ScenarioRunReceipt) {
  if (receipt.lifecycle.status === "completed") {
    return `Run complete. The action finished and the evaluation conclusion is ${evaluationOutcomeLabel(receipt.evaluation.outcome).toLowerCase()}.`;
  }
  return `${lifecycleLabel(receipt.lifecycle.status)}. The receipt does not claim a scored evaluation outcome.`;
}

function lifecycleLabel(status: ScenarioRunReceipt["lifecycle"]["status"]) {
  return {
    completed: "Run completed",
    failed: "Run failed safely",
    unavailable: "Run unavailable",
  }[status];
}

function evaluationOutcomeLabel(outcome: ScenarioRunReceipt["evaluation"]["outcome"]) {
  return {
    passed: "Fixture assertions passed",
    failed: "Fixture assertion failed",
    inconclusive: "Human review still required",
    "not-scored": "Not scored",
  }[outcome];
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

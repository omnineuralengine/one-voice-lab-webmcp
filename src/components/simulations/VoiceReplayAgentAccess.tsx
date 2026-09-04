"use client";

import { useState } from "react";

import { useVoiceReplayWebMcp } from "@/components/simulations/VoiceReplayWebMcpProvider";
import { VOICE_REPLAY_WEBMCP_TOOL_NAMES } from "@/lib/simulations/webmcp-contracts";

const EXAMPLE_REQUEST =
  "Inspect ONE Voice Lab and help me test a contact-center voice agent under crosstalk. Prepare a deterministic local replay, wait for my authorization, run it, examine the evidence, and recommend the next experiment. Do not use live providers.";

export function VoiceReplayAgentAccess() {
  const { controller, state, siteToolsStatus } = useVoiceReplayWebMcp();
  const [copyStatus, setCopyStatus] = useState("");
  const plan = state.preparedPlan;
  const recentActivity = state.activity.slice(-4).toReversed();
  const detectionLabel = siteToolsStatus.state === "ready"
    ? "WebMCP detected"
    : siteToolsStatus.state === "detecting"
      ? "WebMCP awaiting detection"
      : siteToolsStatus.state === "unsupported"
        ? "WebMCP unsupported"
        : "WebMCP registration needs attention";

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(EXAMPLE_REQUEST);
      setCopyStatus("Example request copied.");
    } catch {
      setCopyStatus("Copy was unavailable. Select the request text to copy it manually.");
    }
  }

  function authorize() {
    if (!plan) return;
    try {
      controller.authorize(plan.id);
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : "The plan could not be authorized.");
    }
  }

  return (
    <section
      aria-labelledby="voice-replay-agent-access-title"
      className="voice-replay-agent-access"
      data-testid="voice-replay-agent-access"
    >
      <div className="voice-replay-agent-access__heading">
        <div>
          <p className="one-module-eyebrow">Agent Access</p>
          <h2 id="voice-replay-agent-access-title">Human-authorized local replay</h2>
        </div>
        <span data-state={siteToolsStatus.state}>{detectionLabel}</span>
      </div>

      <p>
        Exactly four browser tools share this visible Simulation Lab state. Replays are deterministic,
        memory-only, and use zero provider requests, credentials, microphone access, telephony actions,
        or provider spend.
      </p>

      <ul aria-label="Available WebMCP tools" className="voice-replay-agent-access__tools">
        {VOICE_REPLAY_WEBMCP_TOOL_NAMES.map((name) => <li key={name}><code>{name}</code></li>)}
      </ul>

      <div className="voice-replay-agent-access__plan" aria-live="polite">
        <div>
          <strong>Prepared plan</strong>
          {plan ? (
            <dl>
              <div><dt>ID</dt><dd>{plan.id}</dd></div>
              <div><dt>Scenario</dt><dd>{plan.scenarioName}</dd></div>
              <div><dt>Template</dt><dd>{plan.templateName}</dd></div>
              <div><dt>Impairment</dt><dd>{plan.impairment}</dd></div>
              <div><dt>Run</dt><dd>{plan.runCount}</dd></div>
              <div><dt>Reference lens</dt><dd>{plan.referenceProfileId ?? "None"}</dd></div>
            </dl>
          ) : <p>No agent-prepared plan is active.</p>}
        </div>
        <div className="voice-replay-agent-access__authorization">
          <span>Authorization: {state.authorization.state.replace("-", " ")}</span>
          <button
            disabled={!plan || state.authorization.state !== "awaiting-human"}
            onClick={authorize}
            type="button"
          >
            Authorize this local replay
          </button>
          <small>The agent cannot click or invoke this human-only transition.</small>
        </div>
      </div>

      <div className="voice-replay-agent-access__activity">
        <strong>Recent in-memory activity</strong>
        {recentActivity.length ? (
          <ol aria-label="Recent replay activity">
            {recentActivity.map((event) => (
              <li key={event.sequence}>
                <span>{event.source}</span>
                <p>{event.action}: {event.outcome}</p>
              </li>
            ))}
          </ol>
        ) : <p>No agent or authorization activity yet.</p>}
      </div>

      <div className="voice-replay-agent-access__evidence" aria-live="polite">
        <strong>Latest deterministic evidence</strong>
        {state.latestResult ? (
          <>
            <p>{state.latestResult.scorecard.taskOutcome}</p>
            <small>
              {state.latestResult.events.length} simulated timeline events · {state.latestResult.usage.providerRequestCount} provider requests · {state.latestResult.usage.audioSecondsSubmitted} audio seconds
            </small>
          </>
        ) : <p>No authorized replay has completed in this tab.</p>}
      </div>

      <label htmlFor="voice-replay-example-request">Example request</label>
      <textarea id="voice-replay-example-request" readOnly rows={4} value={EXAMPLE_REQUEST} />
      <div className="voice-replay-agent-access__copy">
        <button onClick={() => void copyExample()} type="button">Copy example request</button>
        <span aria-live="polite" role="status">{copyStatus}</span>
      </div>
    </section>
  );
}

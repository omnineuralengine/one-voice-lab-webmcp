"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PocketApiOperationBadge } from "@/components/pocket-deepgram/PocketApiOperationBadge";
import { PocketApiSnippetWorkbench } from "@/components/pocket-deepgram/PocketApiSnippetWorkbench";
import { POCKET_API_CAPABILITIES, POCKET_API_PRESETS, getPocketApiPreset } from "@/data/pocket-api-lab";
import { usePocketApiLab } from "@/hooks/use-pocket-api-lab";
import {
  buildPocketApiHandoffs,
  buildPocketApiRequestExample,
  classifyPocketApiOperation,
  describePocketApiInteraction,
  getPocketApiAvailabilityNote,
  getPocketApiComparisonRows,
  requiresPocketApiConfirmation,
  searchPocketApiRegistry,
} from "@/lib/pocket-api-lab";
import { DEEPGRAM_ENDPOINT_REGISTRY, getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";
import { isOpenLabAccountDataEndpoint } from "@/lib/open-lab-endpoint-policy";
import type { DeepgramApiFamily, DeepgramEndpointDefinition } from "@/types/deepgram-endpoint-registry";
import type { PocketApiExecutionResult, PocketApiSnippetLanguage } from "@/types/pocket-api-lab";

const EMPTY_RESULT: PocketApiExecutionResult = { state: "empty", title: "No live request sent", detail: "Examples are generated locally from the verified endpoint registry." };

export function PocketApiLab({ online, apiConfigured, expanded, openLabMode = false, onExpand }: { online: boolean; apiConfigured: boolean; expanded: boolean; openLabMode?: boolean; onExpand: () => void }) {
  const pocketApi = usePocketApiLab();
  const preset = getPocketApiPreset(pocketApi.state.selectedPresetId);
  const [selectedEndpointOverride, setSelectedEndpointOverride] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<DeepgramApiFamily | "all">("all");
  const [language, setLanguage] = useState<PocketApiSnippetLanguage>("curl");
  const [copied, setCopied] = useState(false);
  const [execution, setExecution] = useState<PocketApiExecutionResult>(EMPTY_RESULT);
  const [confirmLive, setConfirmLive] = useState(false);

  const endpoint = getDeepgramEndpoint(selectedEndpointOverride ?? preset.endpointId) ?? DEEPGRAM_ENDPOINT_REGISTRY[0];
  const endpointPreset = preset.endpointId === endpoint.id ? preset : undefined;
  const requestExample = useMemo(() => buildPocketApiRequestExample(endpoint, endpointPreset), [endpoint, endpointPreset]);
  const handoffs = useMemo(() => buildPocketApiHandoffs(endpoint), [endpoint]);
  const operationClass = classifyPocketApiOperation(endpoint);
  const searchResults = useMemo(() => searchPocketApiRegistry(search, family === "all" ? undefined : family), [family, search]);
  const comparisonRows = useMemo(() => getPocketApiComparisonRows(), []);
  const pinned = pocketApi.state.pinnedSnippets.some((item) => item.endpointId === endpoint.id && item.language === language);
  const accountDataLocked = openLabMode && isOpenLabAccountDataEndpoint(endpoint);
  const hostedExecution = endpoint.hostedExecution;
  const availabilityNote = getPocketApiAvailabilityNote(endpoint, { openLabMode, apiConfigured });

  const selectPreset = (presetId: string) => {
    const next = getPocketApiPreset(presetId);
    pocketApi.selectPreset(next.id);
    setSelectedEndpointOverride(null);
    setExecution(EMPTY_RESULT);
    setConfirmLive(false);
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(requestExample.snippets[language]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setExecution({ state: "error", title: "Clipboard unavailable", detail: "Select the code directly and copy it with the keyboard." });
    }
  };

  const requestLiveRun = () => {
    if (hostedExecution) {
      setExecution({ state: "empty", title: hostedExecution.label, detail: hostedExecution.reason });
      return;
    }
    if (!requestExample.executable || endpoint.riskTier === 3 || accountDataLocked) return;
    if (!openLabMode && requiresPocketApiConfirmation(endpoint)) {
      setConfirmLive(true);
      return;
    }
    void runLiveRequest();
  };

  const runLiveRequest = async () => {
    setConfirmLive(false);
    if (hostedExecution) {
      setExecution({ state: "empty", title: hostedExecution.label, detail: hostedExecution.reason });
      return;
    }
    if (!online) {
      setExecution({ state: "disconnected", title: "Disconnected", detail: "The docs-grounded examples remain available, but a live request needs a network connection." });
      return;
    }
    setExecution({ state: "loading", title: "Request in progress", detail: "The browser sent only allowlisted values to the Learning Lab server proxy." });
    try {
      const response = await fetch("/api/deepgram/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestExample.executeInput),
      });
      const text = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(text) as unknown; }
      catch {
        setExecution({ state: "malformed", title: "Malformed response", detail: "The server returned a response that was not valid JSON. Open the full API Lab for sanitized diagnostics.", status: response.status });
        return;
      }
      if (response.status === 401 || response.status === 403 || response.status === 503) {
        setExecution({ state: "unauthorized", title: "Unauthorized or unavailable", detail: readErrorMessage(payload, "Check the server credential, project access, and deployment environment."), status: response.status });
        return;
      }
      if (response.status === 429) {
        setExecution({ state: "rate-limited", title: "Rate limited", detail: readErrorMessage(payload, "Pause requests and inspect concurrency, quota, and retry behavior."), status: response.status });
        return;
      }
      if (!response.ok) {
        setExecution({ state: "error", title: "Request failed", detail: readErrorMessage(payload, "Open the full API Lab to inspect the sanitized request and response."), status: response.status, body: payload });
        return;
      }
      setExecution({ state: "success", title: "Live request completed", detail: "The response was returned through the allowlisted server proxy. No result body is saved by Pocket.", status: response.status, body: payload });
    } catch {
      setExecution({ state: "disconnected", title: "Execution route unavailable", detail: "The local or deployed proxy could not be reached. Continue with the deterministic request example." });
    }
  };

  return <div className="pocket-api-lab" data-testid="pocket-api-lab">
    <div className="pocket-api-toolbar">
      <div>
        <p className="pocket-eyebrow">Field assistant</p>
        <h3>Pocket API Lab</h3>
        <p>Verified operations, implementation placement, and safe handoffs.</p>
      </div>
      <div className="pocket-api-toolbar-actions">
        <label className="pocket-api-mode-toggle"><span>Quick Call</span><input type="checkbox" checked={pocketApi.state.quickCallMode} onChange={(event) => pocketApi.setQuickCallMode(event.target.checked)} /></label>
        {!expanded ? <button type="button" className="pocket-api-small-button" onClick={onExpand}>Full view</button> : null}
      </div>
    </div>

    <label className="pocket-api-use-case">
      <span>Customer use case</span>
      <select value={preset.id} onChange={(event) => selectPreset(event.target.value)}>
        {POCKET_API_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.question}</option>)}
      </select>
    </label>
    <div className="pocket-api-question-grid" aria-label="Common API questions">{POCKET_API_PRESETS.map((item) => <button key={item.id} type="button" aria-pressed={item.id === preset.id} onClick={() => selectPreset(item.id)}><span>{getDeepgramEndpoint(item.endpointId)?.family}</span><strong>{item.question}</strong></button>)}</div>

    {pocketApi.state.quickCallMode ? <div className="pocket-api-quick" aria-label="Quick Call Mode">
      <section><span>1 · Customer use case</span><strong>{hostedExecution ? "Inspect the provider-specific Voice Agent configuration and event contract." : preset.customerUseCase}</strong></section>
      <section><span>2 · Recommended API family</span><div className="pocket-api-endpoint-line"><PocketApiOperationBadge endpoint={endpoint} /><strong>{endpoint.family} · {endpoint.officialName}</strong></div><p>{endpoint.description}</p></section>
      <section><span>3 · Minimal architecture</span><ol className="pocket-api-flow">{preset.minimalArchitecture.map((item) => <li key={item}>{item}</li>)}</ol><p>{placementGuidance(endpoint)}</p></section>
      <section><span>4 · Request example</span><PocketApiSnippetWorkbench endpoint={endpoint} language={language} setLanguage={setLanguage} code={requestExample.snippets[language]} copied={copied} pinned={pinned} onCopy={copySnippet} onPin={() => pocketApi.togglePin(endpoint.id, language)} /></section>
      <section><span>5 · Expected response</span><strong>{preset.expectedResponse}</strong><p className="pocket-api-illustrative">Illustrative guidance — not a benchmark or captured customer response.</p></section>
      <section><span>6 · Likely implementation risks</span><ul>{preset.likelyRisks.map((risk) => <li key={risk}>{risk}</li>)}</ul></section>
    </div> : <div className="pocket-api-explore">
      <section className="pocket-api-capabilities" aria-labelledby="pocket-api-capabilities-title">
        <div className="pocket-section-heading"><div><p className="pocket-eyebrow">Capability map</p><h3 id="pocket-api-capabilities-title">Choose an API family</h3></div><span className="pocket-route-label">{DEEPGRAM_ENDPOINT_REGISTRY.length} verified operations</span></div>
        <div className="pocket-api-capability-grid">{POCKET_API_CAPABILITIES.map((capability) => {
          const count = DEEPGRAM_ENDPOINT_REGISTRY.filter((item) => item.family === capability.family).length;
          return <button key={capability.family} type="button" aria-pressed={family === capability.family} onClick={() => setFamily((current) => current === capability.family ? "all" : capability.family)}><span>{capability.shortLabel}</span><strong>{capability.label}</strong><small>{count} operation{count === 1 ? "" : "s"}</small></button>;
        })}</div>
      </section>

      <section className="pocket-api-browser" aria-labelledby="pocket-api-browser-title">
        <div className="pocket-section-heading"><div><p className="pocket-eyebrow">Registry search</p><h3 id="pocket-api-browser-title">Endpoints and parameters</h3></div>{family !== "all" ? <button type="button" className="pocket-text-button" onClick={() => setFamily("all")}>All families</button> : null}</div>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search endpoint, parameter, protocol…" aria-label="Search endpoints and parameters" />
        <div className="pocket-api-search-results">{searchResults.length ? searchResults.slice(0, expanded ? 24 : 8).map((item) => <button key={item.id} type="button" aria-pressed={item.id === endpoint.id} onClick={() => { setSelectedEndpointOverride(item.id); setExecution(EMPTY_RESULT); }}><PocketApiOperationBadge endpoint={item} /><span><strong>{item.officialName}</strong><small>{item.method} {item.pathTemplate} · {item.parameters.length} parameters</small></span></button>) : <p className="pocket-empty">No verified operation or parameter matches this search. The widget will not infer an endpoint.</p>}</div>
      </section>

      <section className="pocket-api-detail" aria-labelledby="pocket-api-selected-title">
        <div className="pocket-section-heading"><div><p className="pocket-eyebrow">Selected operation</p><h3 id="pocket-api-selected-title">{endpoint.officialName}</h3></div><PocketApiOperationBadge endpoint={endpoint} /></div>
        <p>{endpoint.description}</p>
        <dl><div><dt>Endpoint</dt><dd>{endpoint.method} {endpoint.pathTemplate}</dd></div><div><dt>Interaction</dt><dd>{describePocketApiInteraction(endpoint)}</dd></div><div><dt>Protocol</dt><dd>{endpoint.protocol.toUpperCase()}</dd></div><div><dt>Authentication</dt><dd>{hostedExecution ? "Hosted temporary-token issuance disabled" : endpoint.authenticationMode === "temporary-token" ? "Short-lived browser token" : "Server API key"}</dd></div><div><dt>Operation</dt><dd>{operationClass}</dd></div><div><dt>Placement</dt><dd>{placementGuidance(endpoint)}</dd></div></dl>
        <details><summary>Parameters ({endpoint.parameters.length})</summary>{endpoint.parameters.length ? <ul className="pocket-api-parameter-list">{endpoint.parameters.map((parameter) => <li key={`${parameter.location}:${parameter.name}`}><code>{parameter.name}</code><span>{parameter.location} · {parameter.valueType}{parameter.required ? " · required" : ""}</span><p>{parameter.description}</p></li>)}</ul> : <p className="pocket-empty">This verified operation declares no request parameters.</p>}</details>
        <PocketApiSnippetWorkbench endpoint={endpoint} language={language} setLanguage={setLanguage} code={requestExample.snippets[language]} copied={copied} pinned={pinned} onCopy={copySnippet} onPin={() => pocketApi.togglePin(endpoint.id, language)} />
        {requestExample.unresolvedInputs.length ? <p className="pocket-api-warning">Add {requestExample.unresolvedInputs.join(", ")} in the full API Lab before a live request.</p> : null}
        {expanded ? <details className="pocket-api-comparison"><summary>Model and feature comparison</summary><div className="pocket-api-table-wrap"><table><thead><tr><th>Surface</th><th>Verified model value</th><th>Transport</th><th>Features in registry</th></tr></thead><tbody>{comparisonRows.map((row) => <tr key={row.endpointId}><td>{row.surface}<small>{row.operation}</small></td><td>{row.models}</td><td>{row.protocol}</td><td>{row.features.join(", ") || "Settings-defined"}</td></tr>)}</tbody></table></div></details> : null}
      </section>

      <section className="pocket-api-local" aria-labelledby="pocket-api-local-title">
        <div className="pocket-section-heading"><div><p className="pocket-eyebrow">Local only</p><h3 id="pocket-api-local-title">Recent and pinned</h3></div>{pocketApi.state.recentQuestions.length || pocketApi.state.pinnedSnippets.length ? <button type="button" className="pocket-text-button" data-pocket-action="destructive" onClick={pocketApi.clearHistory}>Clear</button> : null}</div>
        {pocketApi.state.recentQuestions.length ? <ul>{pocketApi.state.recentQuestions.map((item) => { const recent = getPocketApiPreset(item.presetId); return <li key={item.presetId}><button type="button" onClick={() => selectPreset(item.presetId)}>{recent.question}</button></li>; })}</ul> : <p className="pocket-empty">Ask a common question to create safe, ID-only history.</p>}
        {pocketApi.state.pinnedSnippets.length ? <ul>{pocketApi.state.pinnedSnippets.map((item) => <li key={`${item.endpointId}:${item.language}`}><button type="button" onClick={() => { setSelectedEndpointOverride(item.endpointId); setLanguage(item.language); }}>{getDeepgramEndpoint(item.endpointId)?.officialName} · {item.language}</button></li>)}</ul> : null}
      </section>
    </div>}

    <section className="pocket-api-live" aria-labelledby="pocket-api-live-title">
       <div className="pocket-section-heading"><div><p className="pocket-eyebrow">Server-isolated execution</p><h3 id="pocket-api-live-title">Live request</h3></div><PocketApiOperationBadge endpoint={endpoint} /></div>
       <p className="pocket-api-note">{availabilityNote}</p>
       {hostedExecution ? <div className="pocket-api-warning" role="note"><strong>{hostedExecution.label}</strong><p>{hostedExecution.reason}</p></div> : endpoint.riskTier === 3 ? <p className="pocket-api-warning">Mutating operation. This build shows the verified request and impact but keeps execution locked.</p> : accountDataLocked ? <p className="pocket-api-warning">Account and Management API data is unavailable in the public Open Lab.</p> : endpoint.executionMode !== "server-rest" ? <p className="pocket-api-note">This {endpoint.protocol.toUpperCase()} operation opens in the full API Lab, which owns temporary-token, stream, and cleanup behavior.</p> : requestExample.unresolvedInputs.length ? <p className="pocket-api-note">Required values are unresolved. Add them in the full API Lab; Pocket will not guess identifiers or payloads.</p> : <button type="button" className="pocket-secondary-button pocket-full-button" disabled={execution.state === "loading" || !apiConfigured} onClick={requestLiveRun}>{execution.state === "loading" ? "Running through server proxy…" : apiConfigured ? `Run live ${operationClass} request` : "Live provider paused"}</button>}
       {!openLabMode && confirmLive ? <div className="pocket-api-confirm" role="alertdialog" aria-label="Confirm live API request"><strong>Confirm live {operationClass} request</strong><p>{endpoint.method} {endpoint.pathTemplate}. {endpoint.billable ? "This may consume Deepgram credit." : "This may access administrative account data."}</p><div><button type="button" onClick={() => setConfirmLive(false)}>Cancel</button><button type="button" onClick={() => void runLiveRequest()}>Confirm and run</button></div></div> : null}
      <div className={`pocket-api-result is-${execution.state}`} role="status" aria-live="polite"><strong>{execution.title}</strong><p>{execution.detail}</p>{execution.status ? <small>HTTP {execution.status}</small> : null}</div>
    </section>

    <nav className="pocket-api-handoffs" aria-label="Pocket API Lab handoffs">
      <Link href={handoffs.apiLab}>Open in API Lab</Link>
      <Link href={handoffs.codeLab}>Open in Code Lab</Link>
      <Link href={handoffs.architectureStudio}>Open in Architecture Studio</Link>
    </nav>
    <footer className="pocket-api-source"><span>Source: typed Learning Lab endpoint registry</span><a href={endpoint.documentationUrl} target="_blank" rel="noreferrer">Official operation docs ↗</a><span>No keys · no tokens · no response bodies persisted</span></footer>
  </div>;
}

function placementGuidance(endpoint: DeepgramEndpointDefinition) {
  if (endpoint.hostedExecution?.state === "unavailable") return "Documentation or local/manual inspection only in this hosted lab. No live session can be started here.";
  if (endpoint.protocol === "wss") return "Browser or customer media client uses a short-lived token; permanent credentials stay on the customer server.";
  if (endpoint.family === "Administration" || endpoint.family === "Projects" || endpoint.family === "Billing" || endpoint.family === "Usage" || endpoint.family === "Requests") return "Customer server or protected operations service. Do not call management APIs directly from public browser code.";
  return "Customer server or edge function through a server-held Deepgram API key.";
}

function readErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

# Architecture Studio diagnostics

## Purpose and vertical flow

Failure Diagnostics is a deterministic, offline-safe teaching and facilitation layer over the existing recommendation engine. It does not execute a production fault or claim production telemetry. Its complete flow is:

```text
generated recommendation
  → typed architecture graph
  → auditable operator revision
  → simulated failure origin
  → deterministic direct/downstream impact
  → diagnostic sequence and hypotheses
  → mitigation decision
  → recovery validation
  → incident summary and handoff
```

The first demonstration path is Meridian’s delayed voice-agent response. Accurate transcription remains explicitly healthy while the operator timestamps end-of-turn, orchestration, LLM/tool, CRM, TTS, and playback boundaries.

## Domain model

`src/types/architecture-studio-diagnostics.ts` owns the model:

- `CanvasArchitectureNode` records stable ID, node type, vendor, owner, status, origin, decision state, position, properties, notes, requirements, risks, and recommendation evidence.
- `CanvasArchitectureConnection` records endpoints and optional protocol, direction, mode, encoding, sample rate, transport, authentication, latency assumption, retries, timeout, encryption, region, and ownership boundary.
- `ArchitectureRevision` records the before/after change without mutating the engine baseline.
- `FailureScenario` contains symptoms, affected node/flow types, possible causes, checks, mitigations, fallback, impact, metrics, validation, severity, confidence, and cascade policy.
- `FailurePropagationResult` distinguishes originating failure, directly affected component, downstream symptom, unrelated healthy component, and unobservable component.
- `DiagnosticStep`, `RootCauseSuggestion`, `MitigationDecision`, `ValidationOutcome`, and `IncidentSummary` retain the operator’s reasoning and recovery evidence.

The session stores only serializable domain state. React components render it and dispatch typed actions; they contain no propagation or root-cause logic.

## Mapping recommendation output to the canvas

`buildGeneratedCanvasSnapshot()` converts the existing deterministic topology into the diagnostic graph. It preserves generated node IDs, ownership, recommendation evidence, customer requirements, and flow type. It also adds required voice-journey boundary nodes where the source topology deliberately uses a simpler executive representation.

`applyArchitectureRevisions()` replays operator changes over that snapshot. `compareArchitectures()` reports added, removed, and changed nodes/connections. Restore Generated clears revisions and recomputes from the latest discovery answers, so a discovery change is never hidden behind a stale copied graph.

The SVG renderer has three views:

- **Customer Journey** compresses the caller-to-response path.
- **Technical Flow** shows transports, services, integrations, and ownership.
- **Failure View** highlights origin, direct impact, downstream symptoms, fallbacks, healthy nodes, and visibility gaps.

All important edits are also possible through the inspector, so diagnosis does not depend on drag interactions.

## Failure library and propagation

`src/data/architecture-studio-failures.ts` contains 45 scenarios covering the requested audio/input, network/transport, speech-recognition, conversational-agent, and platform/operational failures. Every entry has at least two mitigation paths—immediate containment and long-term correction—and a required validation test.

`failure-engine.ts` applies small, inspectable rules:

1. Resolve the selected node or connection as the origin.
2. Mark matching adjacent boundaries as directly affected.
3. Follow typed outgoing flows only when the scenario allows cascade.
4. Preserve unrelated nodes as healthy.
5. Mark visibility-only incidents as unobservable rather than failed.
6. Lower root-cause confidence when correlation or boundary telemetry is missing.
7. Apply scenario-specific guards—for example, CRM and TTS failures never degrade upstream speech recognition, and delayed downstream response keeps healthy STT/Flux visible.

Root-cause suggestions contain supporting evidence, weakening evidence, a narrow next check, and categorical confidence. They remain `suggested` or `selected` until the operator explicitly confirms one.

## Diagnostic workflow and recovery

`diagnostic-workflow.ts` seeds the exact ten stages from symptom confirmation through follow-up. Steps can be completed, skipped, reordered, or supplemented. Each step can keep notes, evidence, a node, metric, hypothesis, result, and next action.

Clearing the simulated overlay is not resolution. A validation outcome must record the test, result, and evidence as one of resolved, mitigated, unresolved, unable to reproduce, requires customer action, or requires Deepgram investigation. Generated incident Markdown reflects a confirmed root cause only when the operator explicitly confirmed it.

The three Meridian presets intentionally start with incomplete evidence:

1. Noisy mobile caller
2. Delayed voice-agent response
3. Intermittent session failure

Operator-only details and recovery cues are hidden by default.

## Persistence and portability

Simulation state is part of the existing temporary session and therefore uses the same local/Supabase persistence. Diagnostic JSON export excludes credentials and hidden scenario details. Import rejects wrong schemas, excessive fields, malformed graph state, and credential-shaped keys before replacement.

Reset Simulation clears revisions and the current exercise. Restore Generated keeps the rest of the session and recomputes the recommendation baseline. Reset Demo returns the entire temporary session to the scenario seed.

## Add a failure scenario

1. Add a unique entry through the `scenario()` helper in `architecture-studio-failures.ts`.
2. Choose only relevant node types, flow types, and explicit cascades.
3. Add supporting and weakening diagnostic evidence.
4. Provide immediate and durable mitigations with owner, complexity, tradeoff, architecture impact, and validation.
5. Add a unit test proving the origin, affected path, healthy unrelated nodes, suggestions, mitigation, and validation.

## Known limitations

- Propagation is a deterministic teaching model, not packet-level or causal simulation.
- Estimated latency is operator-entered metadata, not measured runtime evidence.
- Graph editing has no multi-user cursor/selection synchronization or undo stack; session revisions still synchronize.
- The failure library does not replace Deepgram Support, customer telemetry, a security review, or a production incident process.

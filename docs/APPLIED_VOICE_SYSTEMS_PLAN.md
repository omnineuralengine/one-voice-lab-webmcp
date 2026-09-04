# Applied Voice Systems Academy — Implementation Plan

> **Historical implementation plan.** Applied Voice Systems is now implemented in the active control room. Use the application, root README, and current module documentation as the source of truth; items described here as planned are not completion claims.

Verified against the repository on 2026-07-12 before product-code changes.

## Outcome

Add an `Applied Voice Systems` control-room module that teaches the path from client discovery to a production-readiness brief. It complements API Studio instead of duplicating endpoint execution.

## Existing components to reuse

- `src/components/deepgram-control-room.tsx` — full-height shell, left rail, focus mode, command palette, and module routing.
- `src/components/api-studio/*` and `src/lib/deepgram-api-catalog.ts` — verified API operations, payload building, local safe execution, chains, and docs links.
- `src/components/CodeLab.tsx`, `src/lib/code-lab-files.ts`, and `src/lib/code-lab-recipes.ts` — editable code, file placement, architecture recipes, and language-specific examples.
- `src/components/PayloadInspector.tsx`, `src/components/EventTimeline.tsx`, and `src/lib/inspection.ts` — sanitized payloads, timelines, trace events, IDs, durations, and secret redaction.
- `src/lib/code-lab-storage.ts` — guarded local JSON persistence and export sanitization.
- `src/components/browser-mic-card.tsx` and `src/lib/live-mic/*` — actual Live
  Mic state/events. This historical note is superseded for Flux by the dedicated
  `/flux-observatory` direct `/v2/listen` implementation. Flux deterministic
  replay and the live client exist; retained real microphone/provider evidence
  is still **Manual validation required**.
- `src/lib/sample-scenarios.ts` — fictional vertical transcripts and ground truth for evaluation. The referenced audio files may be unavailable until generated, so the UI must label missing audio instead of implying it exists.
- Existing `/api/deepgram/*` routes — safe server-side execution. The Academy will link to these routes/modules rather than add new credential paths.

## Stale or duplicated architecture to avoid

- Do not add a second API catalog, payload executor, code editor, or permanent-key flow.
- Do not treat conceptual telephony, CRM, contact-center, Pipecat, LLM, RAG, or cloud integrations as installed connectors.
- Do not synthesize “live” Flux, Voice Agent, LLM, tool, or telephony measurements. Use deterministic simulations with explicit provenance labels.
- Do not persist payloads, credentials, temporary tokens, raw audio, or sensitive client details in Academy progress records.
- Do not integrate the unused legacy `src/components/voice-lab.tsx`; the active architecture is `DeepgramControlRoom`.
- Correct or label any event/endpoint that is not supported by the official Deepgram reference; retain a local docs metadata registry with verification dates.

## New typed registries and utilities

- `src/types/applied-voice.ts` — shared academy, discovery, pipeline, docs, experiment, trace, tool, failure, evaluation, mastery, and brief types.
- `src/lib/applied-voice/scenarios.ts` — preset client scenarios and solution recipes.
- `src/lib/applied-voice/pipeline.ts` — pipeline layers, ecosystem nodes, ownership, interfaces, and responsibility boundaries.
- `src/lib/applied-voice/labs.ts` — deterministic turn traces, tools, multi-agent states, failures, evaluation fixtures, deployment modes, mastery levels, and docs metadata.
- `src/lib/applied-voice/academy.ts` — explainable recommendations, WER/diff helpers, simulated traces, evaluation, safe exports, and solution brief generation.

## New UI components

- `AppliedVoiceSystems.tsx` — compact IDE shell and shared local state.
- `AcademyNavigation.tsx` — internal section navigation, status/provenance, mastery, and rapid-ramp access.
- `ClientDiscovery.tsx` — discovery inputs, preset loading, explainable Client Context Pack, JSON/Markdown export.
- `PipelineAnatomy.tsx` — selectable pipeline/ownership diagram plus Deepgram-versus-customer boundary view.
- `EcosystemAtlas.tsx` — selectable agentic-voice ecosystem registry; third-party concepts remain labeled.
- `ModelExperimentLab.tsx` — safe STT comparison harness using the existing URL route, local run records, WER/diff, notes, and export.
- `TurnTakingLab.tsx` — deterministic recorded simulation, provenance-aware latency budget, and live-module link.
- `ToolCallingLab.tsx` — schema-validated local mock tools, error/timeout injection, confirmation, and multi-agent handoff simulation.
- `ConversationFlightRecorder.tsx` — sanitized trace views, replay, comparison, exports, state transitions, and latency waterfall.
- `EvaluationLab.tsx` — deterministic scenario runner with pass/fail plus human-review ratings.
- `FailureLab.tsx` — guided diagnosis and at least one runnable local failure simulation.
- `DeploymentLab.tsx` — deployment modes, enterprise checklist, and responsibility matrix.
- `SolutionBrief.tsx` — solution recipes, 10-minute path, experiment journal, and downloadable sanitized Markdown brief.

## Risky changes and mitigations

- **Control-room width:** Academy needs its own internal panes. Hide the global right inspector for this module, as API Studio already does, and use internal scroll regions.
- **Client bundle size:** Keep large registries as serializable data modules and split UI by section; avoid a single huge component.
- **Credential exposure:** Import no server-only Deepgram helper into Academy client code. Execute only through existing local routes and sanitize every persisted/exported artifact.
- **False claims:** Every trace, latency value, tool, third-party node, and multi-agent flow carries a `working`, `measured`, `derived`, `simulated`, `concept`, or `unavailable` provenance.
- **Existing regressions:** Preserve Live Mic, STT, TTS, API Studio, Code Lab, and current routes. Limit shell edits to a new module ID, rail entry, render branch, static inspector, and command actions.
- **Local persistence:** Store only selected scenario IDs, form text, experiment metadata/results, journal entries, and mastery progress. Never store files, audio bytes, Authorization, or tokens.
- **Existing chain persistence:** API Studio custom chains currently accept free-form text. Harden that storage path with secret detection while adding Academy exports; do not copy the permissive pattern.
- **Trace schema:** Use a richer Academy trace event type and adapt it into `InspectorTimelineEvent` for display. Do not overload the existing inspector type with turn/tool/business fields.

## Implementation order

1. Add shared types, docs metadata, scenario/pipeline/tool/failure/evaluation registries, and safe export/evaluation utilities.
2. Build the Academy shell, Client Discovery, Pipeline Anatomy, Ecosystem Atlas, Client Context Pack, and export.
3. Add recorded turn-taking simulation, Flight Recorder, latency waterfall, and Failure Lab.
4. Add Model Experiment, Evaluation, Applied ML journal, local tool calling, and multi-agent handoff simulation.
5. Add Deployment Lab, recipes, rapid-ramp mode, mastery levels, and Solution Brief generator.
6. Integrate the left rail, command palette, API Studio/Code Lab links, capability matrix, and provider notes.
7. Run React review, lint, production build, route regressions, secret scans, and interaction checks.

## Scope discipline for this pass

The target is a coherent, data-driven Academy with at least one working path in every major learning loop. Real third-party integrations, Voice Agent execution, arbitrary code execution, production telemetry ingestion, raw-audio trace export, and automated regulatory assertions remain out of scope unless already explicitly implemented and authorized. Flux now has an explicitly started direct provider path in the dedicated Observatory, but live-provider validation and production readiness remain separate evidence gates.

# Live Solution Case Graph

## Product overview

Live Solution Case Graph is the local-first intelligence layer inside `/live-solution-studio`. It keeps customer statements, observed evidence, official sources, requirements, assumptions, hypotheses, decisions, risks, questions, validations, artifacts, and actions distinct while making their relationships inspectable. It is a field-engineering workspace, not a CRM, recording bot, or automatic decision maker.

The system has five deterministic layers: the versioned case model, append-only redacted ledger, derived relationship graph, Next-Best-Question engine, and Claim Safety/contradiction guard. All remain available offline and without an AI provider.

## Case architecture and persistence

Each existing Live Solution Studio problem owns one `live-solution-case-v1` bundle inside the Studio's existing `deepgram-live-solution-studio:session:v1` local-storage record. The bundle contains case metadata, items, relations, ledger events, and question candidates. This extends the current persistence boundary rather than creating a competing store. Saves remain local, debounced by React state changes, and explicit export/purge remain user actions.

Every case records its schema version, timestamps, application version, revision, freshness, redaction state, migration metadata, and export defaults. Imports are parsed as inert JSON and validated before replacement. Newer schema versions, duplicate IDs, and missing relation targets are rejected without partial import. Zod passthrough preserves unknown fields from a supported schema for future migration.

The current V1 warns through revision metadata but does not yet provide a full multi-tab merge interface. A later migration can use the case revision and `storage` events to offer reload versus preserve-copy choices.

## Item taxonomy and authority

The discriminated item taxonomy is defined in `src/types/live-solution-case.ts`. Customer statements retain `verbatim`, `user-paraphrase`, or `AI-summary` mode; only verbatim capture stores `verbatimText`. Observed technical evidence retains structured fields and a module origin. Official Deepgram evidence retains a canonical official URL, concise paraphrase, verification timestamps, freshness, and citation identifier; full documentation pages are not persisted.

Authority remains ordered and explicit: current official Deepgram evidence, locally/API-Lab validated evidence within its exact scope, artifact-observed evidence, attributed customer statements, external public evidence, inference/AI assistance, and unsupported claims. Confidence (High/Medium/Low/Unknown) never changes verification state.

## Claim safety

Every active item is classified deterministically:

- `safe-to-say`: attributed customer statements, current cited official evidence, accepted decisions, artifact observations, and scoped validations.
- `needs-qualification`: assumptions, hypotheses, AI assistance, inference, stale sources, incomplete tests, recommendations, and proposed decisions.
- `do-not-claim`: contradictions, unresolved conflicts, rejected/superseded claims, unsupported capabilities, or secret-bearing content.
- `private-only`: sensitive/internal material not approved for customer use.
- `not-applicable`: reserved for explicitly inapplicable items.

Suggested wording preserves attribution and test scope. Proposed decisions never become accepted merely through display or export.

## Relationships, graph, and corrections

Relations include support, contradiction, derivation, answers, validation, dependencies, risk/action links, superseding, documentation, and possible causality. Use `possibly-caused-by` until causality is established. The UI exposes a semantic relationship list; no graph visualization is required to access the information.

Corrections create a new item, mark the old item superseded, connect them with `supersedes`, preserve timestamps, and append a ledger event. Archiving is reversible state. Purging the Studio session removes the local case and its ledger together so customer content is not retained in an orphan audit log.

## Evidence & Decision Ledger

Ledger events are append-only operational summaries. Changed fields pass through secret redaction and size limits. Raw transcripts, code, logs, audio, credentials, and complete artifacts are never written to events. Decisions, risks, and actions have specialized structured fields and distinct statuses. A proposed decision cannot render as accepted; validation results retain `testEnvironment` scope.

## Next-Best-Question Copilot

The deterministic library covers business outcome, current workflow, voice/audio, product/API, SDK/runtime, deployment, scale/resilience, latency/quality, security/privacy, POC validation, stakeholders, and next actions. Internal weights prioritize contradictions, blocking security/architecture gaps, high-severity risks, active-stage relevance, success criteria, and module-required evidence. The UI shows contributing reasons rather than a numeric score.

Candidates deduplicate by stable `questionIntentId`, status, and prior answer. A contradiction produces a scoped confirmation question instead of repeating a generic discovery question. Capturing an answer preserves the question, creates an answer item and relationship, records the event, and reranks. Optional future AI assistance may only rewrite wording while retaining the deterministic intent and source IDs.

## Coverage and contradictions

Coverage uses Unknown, Partial, Clear, Validated, Contradicted, or Not applicable—never a fake percentage. Domains are business outcome, current workflow, voice/audio path, product/API, SDK/runtime, deployment/region, scale/resilience, latency/quality, security/privacy, success criteria, stakeholders, decision process, and next actions.

The contradiction engine compares active structured values for SDK/version, runtime, framework, package manager, product/API generation, media mode, deployment, endpoint/region/release, model/language, codec/encoding/sample rate/channels, concurrency, retention, latency, success metric, decision status, due date, and ownership. Different values with distinct scope labels (for example browser-client and backend-api) are contextual, not contradictory.

## Module contribution contract

`CaseModuleContribution` is the shared boundary for Payload & Code Workbench, SDK Doctor, Release Radar, API Lab, Architecture Studio, Pre-Sales Studio, and future modules. A contribution declares created/updated items, proposed relations, questions, warnings, validations, sources, and actions. The adapter validates the case ID, redacts bodies, refuses cross-case mutation, deduplicates question intent, and reruns safety/contradiction/question derivation.

API Lab contributes only after explicit execution and must scope its result to the exact test environment. A successful request does not validate unrelated customer code. Architecture Studio reads approved requirements, constraints, decisions, risks, deployment, scale, runtime, security, and success criteria, then returns options and proposed—not accepted—decisions.

To add a module, construct and validate a `CaseModuleContribution`; do not write another store. To add a question domain, add a stable intent and gap key to the deterministic library. To add a relation, extend the enum, document its semantics, and add validation tests.

## Export, privacy, and security

Export profiles are customer handoff, internal technical brief, POC brief, and support escalation. Preflight separates Ready, Needs qualification, and Excluded for safety. Customer exports exclude private items, proposed decisions, do-not-claim content, secrets, unapproved assumptions, and superseded evidence. Official factual claims carry their source URL. Machine exports exclude private/secret items and orphan relations.

All imported notes, Markdown, URLs, artifacts, and module output are untrusted. The feature never evaluates code, renders raw HTML, invokes a shell, fetches arbitrary URLs, connects to pasted endpoints, automatically uploads cases, or sends content to analytics. Only coarse content-free events are eligible under the existing consent policy. Public Demo Mode uses the synthetic Northstar Appointments case only.

## semantic control, accessibility, and offline behavior

Safe semantic case commands should be routed through the existing `keyboard-shortcut-v1` registry. Destructive actions, API execution, purge, and export are never default deck commands. The UI uses semantic buttons/forms, visible focus states, text labels for safety/confidence, `aria-live` updates, and a semantic relation list. Mobile uses the existing responsive page flow and horizontally scrollable panel navigation; no information depends on hover or a graph.

## Known limitations and removal

V1 does not provide collaborative cloud case sync, automatic module mutation, vector search, a force-directed graph, automatic recording, or automatic external actions. Deep integrations from each legacy module should be added incrementally through the contribution contract after their current state boundaries are individually verified. Multi-tab revision warnings and contextual contradiction-resolution editing are the next persistence improvements.

To remove the feature, first export any approved cases, then purge Live Solution Studio local data. Remove the case component/domain/types/tests/docs and the `solutionCase` field/migration from the existing Studio problem; do not leave case content under a second storage key.

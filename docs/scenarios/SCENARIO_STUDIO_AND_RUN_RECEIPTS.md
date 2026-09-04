# Scenario Studio and run receipts

Status: the Scenario Studio architecture contract. Implementation and verification evidence are recorded in the completed-stage handoff.

## Purpose

Scenario Studio gives a human one goal-first, provider-neutral way to exercise an existing ONE capability and understand the result. The first slice is deliberately small: one curated, source-controlled scenario runs one deterministic synthetic fixture through the canonical action runtime and returns one sanitized receipt plus a deterministic explanation.

Scenario Studio v1 is not a workflow builder, saved-run system, benchmark, provider playground, or live execution surface. It adds no provider adapter, database migration, history, retrieval, export, share, background sync, agent tool, REST discovery schema, or MCP operation.

## Information architecture

`/scenario-studio` sits beneath **Evaluate**. The five-item primary navigation remains Explore, Compare, Evaluate, Build, and Learn. Evaluate links to Scenario Studio before its provider comparison workspace, while existing specialist and legacy studios remain reachable and unchanged.

The journey is ordered around human intent:

1. understand the goal and choose one bounded review lens;
2. review planned capability steps and limitations;
3. confirm synthetic, ephemeral, zero-provider-call execution;
4. explicitly run once;
5. inspect one canonical receipt;
6. open **Explain This Run** without executing anything else.

Removing provider logos must still leave a coherent ONE experience. Restoring provider names must preserve provenance wherever a provider actually contributed. This first scenario invokes no provider or model, and the receipt states that directly.

## Source and authority boundaries

The browser request carries only sanitized presentation inputs. Executable mappings and the hidden contract fixture remain server-only; after execution, the validated receipt intentionally returns allowlisted action and fixture manifest identifiers, including its seed and frozen fixture clock. A browser request contains only:

- the pinned public scenario ID and version;
- one schema-bounded review-goal value;
- the literal `synthetic_fixture` execution mode;
- a bounded opaque correlation token used only for the current dispatch.

The token is not a run ID, idempotency key, receipt locator, owner identifier, or authority. The server derives the actor scope, admission decision, registered action, fixture, and execution authority. Unknown versions, modes, fields, or values fail before dispatch.

## Independently pinned contracts

The server freezes these independently so one change cannot silently reinterpret another:

- scenario schema and content version/digest;
- fixture ID, version, digest, consent/license provenance, seed, and frozen clock;
- registered action ID and action-contract version;
- receipt and evidence schema versions;
- explanation schema version and a separate deterministic explainer ruleset version;
- normalized non-secret input digest.

Digests support deterministic reconstruction and change detection. They are not signatures, attestations, authorization grants, or proof that an external event occurred.

## Run and receipt semantics

The synchronous lifecycle is `completed`, `failed`, or `unavailable`. It is orthogonal to evaluation outcome: `passed`, `failed`, `inconclusive`, or `not-scored`. Evidence completeness is separately `complete`, `partial`, or `none`.

Every terminal receipt includes:

- a volatile run ID and server-derived coarse actor scope;
- the frozen manifest;
- lifecycle timestamps from the server run clock; the synthetic action output separately uses the pinned fixture clock;
- one or more registered action-step receipts;
- bounded receipt-local evidence references;
- warnings, limitations, uncertainty, and sanitized failure classification;
- explicit provider calls `0`, credits `0`, and `ephemeral-no-store` disposition.

Lifecycle timestamps are operational receipt metadata, not performance measurements. The pinned fixture clock makes the synthetic action evidence reproducible. Timing, cost, or confidence is `not_measured` unless the run directly and truthfully measures it. No raw actor ID, auth claim, role, trust grant, admission detail, correlation token, secret, header, provider payload, stack trace, media, or private transcript enters the receipt.

Evidence has two independent dimensions:

- epistemic status: `observed`, `derived`, `unknown`, or `not_measured`;
- provenance: `synthetic_fixture`.

An observed synthetic value remains synthetic. A derived interpretation exposes its basis. Absence stays unknown or not measured rather than becoming a fabricated score.

## Explain This Run

The explanation is a pure, versioned, read-only projection of the exact terminal receipt. The receipt pins `one-scenario-explanation-rules/1.0.0` independently from the explanation response schema, and the returned explanation must identify that exact ruleset. It does not call an LLM, provider, database, analytics endpoint, or action runtime. Each statement includes a deterministic rule ID and receipt/evidence basis references. It answers:

- the human goal;
- what ONE executed;
- what happened;
- what the evidence supports;
- what the run cannot establish;
- one bounded next experiment or recovery action;
- where methodology and sanitized technical evidence can be inspected.

Essential, Guided, Detailed, and Technical presentations use the same receipt and authorized evidence universe. Depth changes presentation only; they never alter execution, identity, ownership, evidence, or security semantics.

## Identity, persistence, and cache boundary

Guest and signed-in runs are both synthetic and not saved. The current request, receipt, evidence, and explanation live only in bounded server/request memory and React component memory. Reload, navigation away, or verified principal change discards them.

An in-flight response is bound to the initiating client identity epoch and is ignored after sign-in, sign-out, or account change. No scenario request, receipt, evidence, or explanation is written to `localStorage`, `sessionStorage`, IndexedDB, the service worker, Supabase, another database, analytics, logs, URLs, account history, or guest migration. When Supabase is configured, the existing server identity check and durable quota admission may contact Supabase and update bounded pseudonymous operational counters; that bookkeeping contains no scenario artifact.

The run endpoint is dynamic, POST-only, same-origin, JSON-only, pre-parse byte bounded, strict-schema validated, admitted through the existing `session_creation` quota, and returns `Cache-Control: private, no-store, max-age=0` with `Vary: Cookie`. There is no receipt GET/retrieval endpoint. `/scenario-studio` is not added to the PWA shell cache, and failed/offline execution is never queued or replayed.

## Inclusive interaction

The flagship journey uses ONE's existing module shell, adaptive-depth, disclosure, focus, status, and design tokens. Critical synthetic, privacy, error, limitation, uncertainty, and no-spend information remains visible at every depth.

Required deterministic coverage includes ordered semantics, fieldset/legend and linked errors, keyboard completion, deliberate error focus, bounded live-status announcements, retained disclosure focus, reduced-motion behavior, 44-pixel targets, reflow at 320/390/768/desktop widths, and no page-level horizontal overflow. Automated checks do not establish deployed assistive-technology or real-device conformance.

## Verification levels and deferred work

- Level 1: contracts, trust boundaries, information architecture, and threat model in repository code and documentation.
- Level 2: deterministic contract/unit/browser tests, local disposable authentication/database regression, build, secret audit, cache inspection, and local visual inspection.
- Level 3: deployed authentication, CDN/service-worker behavior, production abuse controls, real devices, and manual assistive-technology review. These remain unperformed.

Durable owner-scoped run history is deferred. It requires a separately authorized design for RLS, retention, cleanup, deletion, quota races, concurrency, export/share, and Level 3 production-auth review. Live scenarios, arbitrary workflows, concierge-triggered execution, agent execution, cancellation/queues, and provider-backed runs are also deferred. the Voice Concierge may navigate a human to Scenario Studio, but it cannot invoke or preconfigure a run.

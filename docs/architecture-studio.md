# Deepgram Voice Architecture Studio

## Purpose

Voice Architecture Studio is a simulated, collaborative CCaaS solution-discovery module inside ONE Voice Lab. It is designed for a live Applied Engineer guided workshop, not as a product selector, marketing form, pricing calculator, compliance tool, or official provider product.

The entry route is `/architecture-studio`. A presenter chooses Northstar, Meridian, or a custom fictional scenario, creates a four-hour session, and shares a participant URL. Stakeholders contribute to one company profile while deterministic rules update the current best-fit path, component package, editable architecture, evidence, tradeoffs, confidence, unresolved questions, Learning Lab handoffs, and solution brief.

## Guided flow

1. Choose a fictional preset or custom scenario and create a presenter session from `/architecture-studio`.
2. Share the participant URL or six-character code.
3. Participants join without accounts using a fictional display name and stakeholder role.
4. Reveal one question at a time across six stages.
5. Pause a stage when the room needs a checkpoint; participant writes are rejected until it is reopened.
6. Confirm “What I heard” and preserve or resolve stakeholder disagreement.
7. Show why the recommended starting architecture changed.
8. Switch between executive and technical topology views; accept, reject, add, remove, annotate, or restore architecture modules.
9. Open **Failure Diagnostics**, edit the generated graph, and inject a labeled simulated incident. Follow the ten-stage diagnostic sequence, distinguish the failure origin from downstream symptoms, compare mitigations, and record recovery evidence.
10. Inspect Recommendation Evidence: every component’s requirement, decision, approach, fit, tradeoff, validation method, confidence, and source answers, followed by structured gaps and a proof-of-concept plan.
11. Open a relevant Learning Lab module in a new tab; Studio state remains open.
12. Use **Executive Handoff** to adapt the same facts for executive, technical, or Customer Success audiences; produce the technical handoff, proof-of-concept plan, decisions, actions, narrative, and printable report.
13. Rehearse the five-, fifteen-, or thirty-minute flow, run the offline demo-health preflight, and export a validated session snapshot when needed.
14. Delete the temporary session immediately or allow it to expire.

## Customer and presenter modes

Participant route: `/architecture-studio/session/[code]`

Participants can join, answer or revise revealed questions, see contributions, react to the current recommendation, and watch the shared executive architecture change. Operator overrides appear as dashed amber modules but their controls remain presenter-only.

Presenter route: `/architecture-studio/session/[code]/presenter?token=[temporary-token]`

The presenter token is generated from 192 random bits, stored only as a SHA-256 hash in hosted storage, and checked with a timing-safe comparison. The participant link never contains it. Controls stay hidden until verification succeeds. Treat the presenter URL as a temporary bearer secret.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev:local
```

Open `http://127.0.0.1:3000/architecture-studio`.

No new variable is required for Local Demo Mode. The full discovery, rules, diagram, presenter controls, brief, and exports work in one browser. `localStorage` keeps the temporary snapshot and `BroadcastChannel` synchronizes tabs in that browser.

Local sessions enforce the same four-hour expiry in the browser. Expired or manually deleted snapshots, presenter tokens, and participant credentials are removed, and deletion/expiry is synchronized across open tabs. A storage-event listener keeps tab synchronization functional when `BroadcastChannel` is unavailable.

## Hosted environment variables

Set these in Vercel for shared sessions across devices:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=server-only-secret
```

The URL and publishable key are public connection configuration. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never receive a `NEXT_PUBLIC_` prefix.

Apply `supabase/migrations/20260825190216_architecture_studio_sessions.sql` to the Supabase project. The table has RLS enabled, explicitly revokes `anon` and `authenticated` access, and grants storage access only to `service_role`. Session reads and writes go through Next route handlers.

The migration explicitly grants `service_role` because new Supabase projects no longer expose new public-schema tables to the Data API automatically. It also enables Supabase Cron (`pg_cron`) and schedules hourly removal of expired rows; an expired session is rejected immediately even before the cleanup job runs. Verify the `architecture-studio-expiry` job after applying the migration.

This development environment was not connected to a Supabase project, so the migration could not be executed against a live database here. After applying it, create a session and join from a second browser/device before the workshop.

## Realtime architecture

```text
Participant / presenter browser
  ├─ HTTPS → Next route handlers → Supabase session row (service role, server only)
  └─ Supabase Realtime public channel
       ├─ Presence: anonymous connection count and role kind only
       └─ Broadcast: “session_updated” signal with version only

On a signal, every client refetches the public snapshot from the Next route.
```

The realtime channel never carries names, free-text answers, notes, tokens, or the session snapshot. The shared code is the participant access boundary for this fictional prototype. Presenter writes additionally require the presenter token. Participant writes require a random token whose hash is stored only in the server-side snapshot. Clients poll every eight seconds as a reconnect safety net.

Presence publishes only a connection kind and timestamp. Joined participant workspaces send a bounded heartbeat every 30 seconds so the visible participant stack can distinguish recent activity without placing names or free text in Realtime Presence.

## Session and privacy model

- Sessions reject reads and writes after four hours. Hosted rows are also deleted by the hourly database cleanup job; local snapshots and temporary credentials are removed in-browser at expiry.
- The presenter can delete a session immediately.
- Display names are optional, should be fictional, and live only in the temporary session.
- Participant snapshots omit presenter notes, tracked assumptions, parking-lot items, decision-log entries, saved briefs, and editable next steps. Valid presenter requests receive the full facilitation snapshot.
- Free text is length-bounded and control characters are removed.
- Users are warned not to enter real customer information, secrets, or personal data.
- No response is sent to an LLM.
- No pricing, performance guarantee, legal conclusion, or compliance determination is generated.
- Structured logs contain only event type, sanitized code, mode, and bounded machine-safe reason—not names, answers, notes, tokens, or customer data.
- The browser receives the Supabase publishable key only. Service-role and Deepgram keys stay server-side.

## Recommendation rules and package engine

Two pure deterministic layers deliberately separate the broad solution path from component-level evidence:

- `src/lib/architecture-studio/recommendation-engine.ts` resolves participant answers, preserves disagreement, applies presenter refinements, scores five paths, and returns the current path, influences, assumptions, tradeoffs, alternatives, and change triggers.
- `src/lib/architecture-studio/package-recommendation-engine.ts` normalizes the answers into `StudioDiscoverySchema`, applies modular package rules, and returns typed component recommendations, structured gaps, validation tests, and confidence. No LLM is involved.

Every component recommendation contains the customer requirement, architectural decision, Deepgram capability or implementation approach, fit, tradeoff, validation method, confidence, and triggering question IDs. The evidence UI resolves those IDs back to the visible discovery answers. Capabilities that are not verified in the knowledge catalog generate both a `verificationNeeded` flag and an open question.

Confidence is completeness-based. Missing package-decision inputs, stakeholder disagreement, and unverified catalog entries lower confidence; they never get converted into a false numeric probability. Gaps are generated for required missing information, conflicts, unknown concurrency or volume, unclear privacy/deployment constraints, and latency/accuracy targets without test definitions.

The paths are Speech Intelligence, Composable Voice Stack, Managed Voice Agent, Private Deployment, and Evaluation First. Missing decision evidence, close scores, or disagreement can intentionally make Evaluation First the result. Package components can still identify reversible proof points—such as Flux turn events or audio preprocessing—without pretending the broader operating model is settled.

If malformed session state causes the rule engine to throw, the public UI receives a low-confidence Evaluation First recovery result and emits only a privacy-safe `rule_engine_error` event. It never falls back to an opaque product recommendation.

Four stable fixtures live in `src/lib/architecture-studio/fixtures.ts`. The same fixture must always produce the same result.

## Scenario presets

`src/data/architecture-studio-scenarios.ts` owns scenario identity and seed answers.

- Northstar Contact Cloud preserves the original multi-region managed-versus-composable workshop.
- Meridian Contact Cloud is a mid-market inbound CCaaS voice-agent scenario with a legacy speech provider, English/Spanish, noisy mobile audio, interruption requirements, cloud hosting, Salesforce, proprietary routing, and regulated-data concerns. Concurrency, volume, acceptance thresholds, retention detail, and final operating model remain intentionally unresolved.
- Custom starts with only a fictional company name.

Visible landing-page facts are a deliberately smaller subset of the seed. The preset accelerates a live call without exposing every hidden issue or preselecting the final Deepgram solution.

## Editable architecture model

`src/lib/architecture-studio/architecture.ts` derives the engine topology and then applies `architectureOverrides` stored in the session. Each override records module presence, accepted/rejected/undecided status, a bounded note, and timestamp.

- Engine-generated modules use solid owner-colored outlines.
- Any operator-touched module uses a dashed amber outline and an explicit “Operator override” label.
- Removing a generated module keeps a recoverable exclusion record.
- “Restore generated” deletes only the override and reruns the deterministic topology.
- Added modules come from `ARCHITECTURE_MODULE_LIBRARY`; no arbitrary executable code or product claim enters the canvas.

The final solution brief uses the same edited topology and labels every module as engine-generated or operator-overridden, including decision status and note. This prevents summary drift after live facilitation.

The richer diagnostic canvas maps that generated topology into typed nodes and connections in `architecture-workspace.ts`. Revisions are replayed over the generated baseline, so moving, disabling, duplicating, adding, removing, connecting, or relabeling a component never destroys the original recommendation. Customer Journey, Technical Flow, and Failure View share the same graph. Details, protocols, ownership, notes, risks, and recommendation evidence remain available without dragging.

See [Architecture Studio diagnostics](architecture-studio-diagnostics.md) for the graph, revision, failure, propagation, root-cause, mitigation, validation, and portable-state models.

## Executive handoff and rehearsal

The final handoff is derived—not separately authored—from the current discovery profile, package recommendation, generated topology, operator revisions, open-question closures, incident history, mitigation decisions, and validation outcomes. Pure derivation functions build the executive summary, technical handoff, proof-of-concept plan, decision/action registers, narrative, and fifteen-part report. Audience modes change emphasis without changing facts.

Presentation mode removes operator-only views and supports keyboard section navigation. Rehearsal mode contains five-, fifteen-, and thirty-minute scripts, controlled interaction cues, a 1–5 self-assessment, and private reflection notes. Those notes are excluded from exports unless the operator explicitly opts in.

See [Architecture Studio executive handoff](architecture-studio-handoff.md) for traceability, exports, report safety, preflight, and rehearsal behavior.

## Capability catalog

`src/data/deepgram-capabilities.ts` is the product terminology source. Each entry has an identifier, category, plain and technical explanations, use cases, tradeoffs, compatible paths, documentation status, verification date, and official reference.

Terminology was checked against official Deepgram documentation on 2026-07-21. Flux TTS is marked Early Access. Self-hosted, SDK, browser, and telephony details remain confirmation items because account, feature, infrastructure, regional, and commercial compatibility are engagement-specific.

The catalog includes explicit language/multilingual strategy metadata, Nova-3/Flux keyterm prompting, and prerecorded-only language detection in addition to streaming and batch STT, conversational recognition, Voice Agent orchestration, TTS, diarization, formatting, redaction, deployment, SDK, browser, and telephony patterns. Automated tests require unique identifiers, the current verification date, tradeoffs, compatible paths, and an official `developers.deepgram.com` reference for every entry.

## Extending the module

### Add a question

1. Add a stable entry to `src/data/architecture-studio-discovery.ts`.
2. Choose stage, input kind, options, role lenses, critical flag, and “Why this matters.”
3. Include `Other` and `Not sure yet` for closed choices.
4. Add an explicit rule if the answer changes architecture.
5. Update a deterministic fixture and test.

### Add a recommendation rule

1. For path selection, read the resolved value in `recommendFromProfile` and apply points through `score()` so the influence remains visible.
2. For a component decision, add a bounded rule in `buildComponents()` in `package-recommendation-engine.ts` with all eight evidence fields and source question IDs.
3. Add a corresponding gap or validation test when missing evidence could change the decision.
4. Reference only verified catalog capability IDs; otherwise expose verification state.
5. Test the intended, missing, and conflicting inputs.
6. Do not add unsourced benchmarks, commercial claims, or unquestionable conclusions.

### Add a Deepgram capability

1. Verify current terms against official Deepgram docs.
2. Add one entry to `src/data/deepgram-capabilities.ts`.
3. Use `verified`, `early-access`, or `confirm-with-deepgram` honestly.
4. Update `capabilitiesFor()` only if a path should recommend it.
5. Test topology or summary changes.

### Connect a Learning Lab module

Update `recommendLabs()` in `src/lib/architecture-studio/architecture.ts`.

- Use `/?module=[existing-module-id]&from=architecture-studio` for installed modules.
- The control room reads the `module` query parameter.
- Studio links open in a new tab so the session stays visible.
- For a missing module, set `status: "planned"` and omit `href`; it enters the generated backlog without a broken link.

## Deployment

1. Create or select a Supabase project.
2. Apply the committed migration.
3. Confirm RLS and the absence of `anon`/`authenticated` grants.
4. add the three Studio variables to Vercel.
5. Deploy the existing Next project.
6. Check `/api/health`; hosted mode should report `supabase`, `realtime: true`, and `status: "ready"`. A configured but unreachable database returns HTTP 503 with `status: "degraded"` instead of a false-positive health response.
7. Confirm the `architecture-studio-expiry` Cron job exists and run it once in the Supabase dashboard.
8. Create a session on the deployed route.
9. Join from a second device, revise an answer, and verify both views update.
10. Verify presenter authorization, stage pause enforcement, expiry, deletion, lab launch, JSON, Markdown, topology, and print.
11. Run the workshop runbook on the exact public URL.

## Tests

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:architecture-studio
npm run build
```

Coverage includes deterministic fixtures, component evidence contracts, missing-input confidence, Meridian rules, all 45 failure scenarios, failure propagation and healthy-node isolation, root-cause confidence, diagnostic state, architecture revision restore, three Meridian incident presets, summary/handoff/POC derivation, audience consistency, open-question closure, report exports/imports, hidden-note exclusion, session creation/joining/authorization/expiry, local multi-tab synchronization, progressive reveal, Learning Lab handoff, printable output, and desktop/mobile layouts.

## Known limitations

- A live Supabase project is required to prove cross-device hosted synchronization; the repository contains no credentials.
- Realtime uses public presence and version-only broadcast signals plus server-mediated snapshots. Private channels are a future hardening option if anonymous auth is added.
- The shared code is for fictional guided workshops, not real confidential discovery.
- Concurrent writes use optimistic row versions and bounded retries, not field-level CRDT merging.
- The SVG canvas supports bounded node movement and typed connections, but it intentionally omits automatic graph routing, multi-select, undo stacks, and collaborative cursor presence.
- Recommendation confidence is categorical completeness/conflict evidence, not a calibrated probability or product-performance score.
- A fully executable Voice Agent interaction lab is Planned; related existing diagnostics remain guarded or educational.
- Deepgram product, deployment, region, capacity, feature, and commercial compatibility must be reverified for a real opportunity.
- Permanent accounts, CRM export, enterprise administration, billing, organizations, and LLM-written recommendations are out of scope.

## Post-guided session backlog

1. Add anonymous session grants and private Realtime channels so session codes are not also public channel identifiers.
2. Add distributed creation/mutation rate limiting and abuse monitoring before using the tool for anything beyond fictional workshops.
3. Replace row-level optimistic retries with field-aware conflict merging if workshops grow beyond workshop-sized groups.
4. Build the Planned executable Voice Agent interaction lab and connect its measured events back to the Studio.
5. Add a hosted second-device soak test and scheduled deployment smoke test using a dedicated non-production Supabase project.
6. Add organization accounts, durable customer workspaces, CRM export, and governed retention only if the prototype becomes a real customer tool.

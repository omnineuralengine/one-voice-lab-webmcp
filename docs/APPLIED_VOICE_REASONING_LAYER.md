# Applied Voice Reasoning Layer

Last verified: 2026-08-20

This is a community-built Applied Voice Lab. It is not an official Deepgram product, service, roadmap, benchmark, or production certification.

## Purpose

The deterministic Lab establishes evidence. The AI expands reasoning. The human makes the decision.

The Applied Voice Reasoning Layer sits above existing deterministic discovery, Case Graph, architecture, diagnosis, evaluation, and deliverable systems. It can propose, explain, critique, simulate alternatives, identify gaps, suggest tests, and teach. It is not a database, execution engine, provider proxy, or replacement source of truth.

```text
Lab UI
  -> deterministic engine / sanitized typed projection
  -> server-only reasoning policy and safety boundary
  -> Vercel AI Gateway
  -> configured model
  -> Zod-validated structured proposal
  -> claim-label enforcement
  -> human accepts or rejects
  -> existing Lab state
```

An AI failure never removes the deterministic result.

## Repository verified

Implemented as a Prototype/Experimental layer:

- `POST /api/ai/reason`: same-origin, bounded, rate-limited structured reasoning requests.
- `POST /api/ai/usage`: metadata for the caller's random browser session only.
- `/ai-observatory`: developer-facing, ephemeral session metadata view.
- Homepage intent router: suggests existing Lab workflows without removing direct navigation.
- Applied Voice Copilot: a compact context-aware surface available throughout the Lab.
- Live Solution Studio AI Second Opinion: independently reviews a sanitized projection after the deterministic brief exists.
- Architecture Studio **Red Team This Architecture**: produces a structured adversarial review without editing the topology.
- AI POC Generator: creates a structured proposal. Numeric quantitative criteria and numeric test-matrix success criteria are deterministically labeled `Target to confirm` before display.
- Contextual teaching through prompts such as Explain this module, What am I missing?, and What should I test next?
- Explicit proposal acceptance: accepted findings become unvalidated assumptions only. They are not promoted to confirmed facts or accepted decisions.
- Claim-label enforcement: generated prose cannot grant itself `Repository verified` or `Deepgram documentation verified` authority. Those labels are downgraded to `Assumption`; supplied evidence IDs remain visible for human review.
- A per-instance global kill switch, per-session and per-instance request limits, request/output bounds, timeouts, and graceful failure states.
- Safe usage metadata: timestamp, random session ID association, feature, reasoning class, model, latency, tokens when returned, cost when returned, success, and fallback indication.

Structured responses are currently delivered after validation rather than streamed incrementally. This keeps the V1 schema and claim-safety boundary deterministic. Streaming structured UI is future work.

## Reasoning policy and models

Callers request a task and may request FAST or DEEP reasoning. Central policy always forces second opinions, architecture red teams, and POC generation through DEEP. Intent routing, teaching, and concise Copilot help use FAST by default. Feature code does not select a provider directly.

The defaults verified against the public AI Gateway catalog during implementation are:

```text
FAST: openai/gpt-5.6-luna
DEEP: openai/gpt-5.6-sol
```

The IDs are configuration, not a permanent architecture commitment. Change them without rewriting feature code:

```text
LAB_AI_FAST_MODEL
LAB_AI_DEEP_MODEL
```

Actual model availability, routing, pricing, latency, and entitlement remain point-in-time provider behavior. The repository does not claim that a configured model will always be available.

## Data sent to the model

Only after an explicit AI action, the route sends:

- the user's current bounded AI request;
- the current Lab module ID/name;
- a minimal sanitized projection of relevant deterministic facts;
- separately labeled assumptions, open questions, architecture elements, and risks; and
- safe evidence IDs and summaries already present in the Lab context. Source URLs are intentionally omitted from the model payload; they remain reviewable in the deterministic evidence surface.

Live Solution AI context excludes the raw problem-inbox transcript, private items, secret items, customer-statement items, archived items, and items marked `review-required` or `contains-secret`. The confirmed bounded problem summary and selected deterministic brief content can be included because they are the material the user explicitly asks the AI to review. Users must still remove customer or personal information before requesting AI reasoning.

Architecture AI context excludes participant identities, participant tokens, presenter tokens, presenter-only notes, credentials, and private configuration. It uses the public session projection, normalized answers, deterministic recommendation, and generated topology.

Pasted content is wrapped as untrusted data. System instructions explicitly prohibit instructions inside transcripts, logs, payloads, code, or customer material from changing AI behavior. Secret-shaped values are redacted again at the AI boundary, and generated output is redacted and schema-validated before it reaches the browser.

## Data not sent or stored

The reasoning layer does not send or intentionally persist:

- `DEEPGRAM_API_KEY`, AI Gateway credentials, Vercel OIDC tokens, or provider tokens;
- raw microphone audio;
- raw problem-inbox transcripts;
- private Case Graph items;
- arbitrary local files or remote URLs;
- participant or presenter authentication tokens;
- customer configuration mutations; or
- accepted Case Graph facts as silent model edits.

The usage store does not retain prompts, transcript text, payloads, generated content, API keys, or IP-derived fingerprints. Its random browser session ID is created locally with `crypto.randomUUID()`. The current store is bounded, in-memory, and per server instance. It can reset between requests, regions, cold starts, or deployments and is not a durable billing ledger.

Vercel AI Gateway and the selected upstream provider process the submitted sanitized request according to their configured policies. Optional `LAB_AI_ZERO_DATA_RETENTION=true` requests Gateway ZDR routing; availability depends on the Vercel plan, model, and eligible route. Do not describe ZDR as active until deployment behavior is verified.

## Claim safety

Every meaningful generated claim uses one of these labels:

- **Repository verified**: reserved for deterministic repository evidence emitted by trusted Lab code, not model-generated prose.
- **Deepgram documentation verified**: reserved for the Lab's official-documentation evidence path, not model-generated prose.
- **Assumption**: a proposition requiring evidence or representative testing.
- **Experimental idea**: a proposed architecture, test, or exploration.

The model cannot create verification authority. The public request body is untrusted, so even a valid evidence ID cannot make an arbitrary generated sentence verified. Generated `Repository verified` and `Deepgram documentation verified` labels are therefore downgraded to **Assumption**. Evidence IDs remain citations for a human to inspect against the deterministic evidence card. Generated suggestions remain proposals until a human keeps or rejects them. Keeping a proposal records an unvalidated assumption; it does not automatically alter a confirmed fact, accepted decision, deterministic recommendation, or architecture.

## Cost and abuse boundary

The AI route is not a generic completion proxy. It accepts only a strict feature enum and typed context schema, uses fixed system/task prompts, exposes no tools, performs no arbitrary fetch, accepts no files/URLs/code execution, and cannot reach Deepgram execution adapters.

Central safeguards include:

- `LAB_AI_ENABLED` global server-side kill switch, default off;
- same-origin browser boundary;
- random anonymous session attribution rather than fingerprinting;
- 24 KB request limit;
- six requests per ten minutes and 30 per day per session;
- bounded per-instance global request windows;
- 1,600 FAST / 3,500 DEEP maximum output tokens;
- 20-second FAST / 45-second DEEP total timeouts; and
- bounded, content-free metadata storage.

The in-memory limits are a Prototype safeguard, not a distributed abuse-control guarantee. A public deployment should also configure Vercel AI Gateway budgets/alerts and, before high traffic, a durable privacy-preserving distributed limiter. Do not expose an anonymous billable AI route without a reviewed budget and kill switch.

The AI route has no Deepgram imports and cannot spend Deepgram credits. It can consume configured AI Gateway/model credits only when `LAB_AI_ENABLED=true` and Gateway authentication succeeds.

## Graceful degradation

If AI is disabled, unavailable, removed from the catalog, rate-limited, timed out, or returns malformed structured output, the UI says the AI proposal is unavailable and leaves every deterministic workflow usable. There is no automatic retry loop in the browser and no live-provider fallback.

## Analytics and observability

The browser emits one privacy-limited `applied_voice_ai_request` analytics event with only feature, reasoning class, and completion status. It does not include the prompt, response, transcript, random session ID, payload, or customer data.

The AI Usage Observatory shows only the current random session's ephemeral metadata. Cost remains `not returned` unless the Gateway response supplies a defensible cost value; V1 does not issue an additional generation-lookup request merely to populate the UI.

## Configuration

Server-only variable names:

```text
LAB_AI_ENABLED
LAB_AI_FAST_MODEL
LAB_AI_DEEP_MODEL
LAB_AI_ZERO_DATA_RETENTION
AI_GATEWAY_API_KEY
```

On a correctly linked Vercel project, AI Gateway can use Vercel OIDC without a committed key. Local development may use an ignored `AI_GATEWAY_API_KEY`. Never prefix these variables with `NEXT_PUBLIC_`, print their values, or commit `.env.local`.

Manual Vercel work before enabling the public layer:

1. Confirm the project can authenticate to AI Gateway through OIDC, or configure a server-only Gateway key.
2. Configure Gateway budgets, alerts, and any desired provider/model restrictions.
3. Set `LAB_AI_ENABLED=true` only after the budget and abuse boundary are approved.
4. Optionally set the FAST/DEEP model IDs; otherwise the repository defaults apply.
5. Decide whether eligible ZDR routing is required and verify plan/model support before enabling it.
6. Deploy a Preview and run a bounded non-customer smoke request before Production approval.

This change does not modify Vercel variables or deploy the application.

## Status

### Prototype / Experimental

- Gateway reasoning service and strict route boundary.
- Homepage intent routing and Applied Voice Copilot.
- Live Solution second opinion.
- Architecture red team.
- AI POC proposal.
- Claim-label enforcement and explicit assumption acceptance.
- Ephemeral AI Usage Observatory.

Repository tests mock billable model calls. Therefore these are repository-verified prototypes, not live Gateway or production-behavior proof.

### Working independently of AI

- Existing deterministic Lab engines, Case Graph, recommendations, evidence, tests, navigation, and deliverable flows.
- Graceful AI-disabled and AI-error states.

### Planned

- **Speak the Problem**. Existing Live Mic infrastructure was inspected, but V1 does not connect microphone transcription to AI case intake. No microphone is activated by the reasoning layer.
- Incremental structured streaming.
- Durable distributed rate/budget enforcement if public usage warrants it.
- Broader model/provider experiments through configuration after evidence and cost review.
- Tighter Deliverables Studio import of an accepted POC proposal.

No ElevenLabs, Fish Audio, Cartesia, or other voice provider adapter is added by this work. Provider-neutral reasoning configuration is an extension point, not evidence that those voice providers are implemented.

## Tests

Run:

```powershell
npm run test:ai
npm run test:live-solution-studio
npm run test:architecture-studio
npm run test:api-studio
npm run test:pocket
npm run typecheck
npm run lint
npm run build
npm run audit:secrets
```

Automated AI tests mock the billable boundary and cover disabled mode, structured success, malformed output, Gateway failure, timeout, rate limiting, redaction, prompt injection, model configuration, random session attribution, deterministic-state preservation, claim enforcement, keyboard access, intent routing, and graceful degradation.

# Pocket API Lab Field Widget

Pocket API Lab is the docs-grounded API assistant inside the existing Pocket Deepgram shell. It is designed for a pre-sales engineer who needs a concise answer beside a customer call, then a safe handoff into the full Learning Lab.

It is not a separate application, an API-key manager, or a generative endpoint catalog. Open **Pocket**, choose **API Field**, and use the same surface as a mobile bottom sheet, docked desktop panel, or expanded full-screen workspace.

## Source of truth

The widget derives operations from `src/lib/deepgram-endpoint-registry.ts`. That registry supplies:

- official operation name and official documentation URL;
- API family;
- method, protocol, and path template;
- declared parameters and defaults;
- authentication and temporary-token compatibility;
- response type;
- billable and risk classification;
- execution mode, regional support, and test status.

Search, capability counts, parameter details, model values, feature comparisons, code examples, and route handoffs all resolve through this typed registry. The widget does not infer an endpoint or response field when the registry has no matching definition.

Product availability, entitlement, account-specific limits, pricing, and performance still require validation against current official Deepgram documentation and the customer account.

## Operating modes

### Quick Call Mode

Quick Call Mode keeps the call-side answer to six facts:

1. customer use case;
2. recommended API family and verified operation;
3. minimal architecture and code-placement boundary;
4. generated request example;
5. expected response type without invented fields;
6. likely implementation risks.

The common questions are deterministic presets in `src/data/pocket-api-lab.ts`. Preset text, sample URLs, and sample input are labeled as illustrative. Selecting a preset does not execute a request.

### Registry exploration

Turn off **Quick Call** to access:

- cards for STT, TTS, Voice Agent, Intelligence, Authentication, Models, Projects, Requests, Usage, Billing, and Administration;
- endpoint and parameter search;
- operation metadata and expandable parameter definitions;
- a model/feature comparison generated from registry parameters;
- curl, JavaScript, Python, and JSON examples;
- safe recent-question and pinned-snippet shortcuts.

Compact mode limits long search result sets. Expanded mode exposes a wider two-column workbench and the complete comparison table without replacing the widget component, so current selection and code-tab state are preserved.

## Code examples and placement

`src/lib/pocket-api-lab.ts` builds an effective request from the selected verified endpoint and delegates language generation to `src/lib/deepgram-codegen.ts`.

- HTTPS examples use a server environment placeholder named `DEEPGRAM_API_KEY`.
- Browser WebSocket examples request a short-lived token from the customer's server.
- Raw JSON shows only the request body or documented initial stream message represented in the registry.
- Required project, request, model, or account identifiers remain explicit `YOUR_*` placeholders.
- A live action remains unavailable while required values are unresolved.

JavaScript examples currently reuse the registry's server-side TypeScript/JavaScript output because the emitted example contains no TypeScript-only syntax.

## Live execution and safety

The widget never sends a Deepgram API key from the browser. Eligible HTTPS requests use the existing `POST /api/deepgram/execute` route. That route:

- accepts a verified endpoint ID rather than a browser-controlled URL;
- rejects unknown parameters and host overrides;
- attaches `DEEPGRAM_API_KEY` only on the server;
- allows only the operation's declared regions, method, content type, and parameter locations;
- applies bounded request and response sizes and a timeout;
- returns sanitized headers and bodies;
- keeps tier-three mutations locked.

Billable requests and administrative reads require an explicit in-widget confirmation. Mutating operations remain preview-only even when the full API Lab displays their required confirmation phrase. WebSocket workflows hand off to the full API Lab so the existing temporary-token, media, cleanup, and diagnostic owners remain intact.

The result panel distinguishes:

- no request sent;
- loading;
- successful response;
- disconnected execution route;
- unauthorized, unconfigured, or unavailable server credential;
- rate limiting;
- malformed server response;
- other validated request or upstream errors.

Response bodies are held only in component memory and are not written to Pocket storage.

## Handoffs

Every selected operation exposes:

- **Open in API Lab** — opens `api-studio` with the selected registry operation;
- **Open in Code Lab** — opens the matching existing workflow, such as `live-mic`, `tts`, or `temporary-token`;
- **Open in Architecture Studio** — carries the selected operation and capability as non-secret URL context.

The home route accepts `operation` and `workflow` search parameters and remounts the underlying Learning Lab workbench for deterministic selection. Pocket is mounted in the root layout, so its current field-assistant state survives the handoff navigation.

## Local persistence and privacy

Pocket API Lab uses `deepgram-pocket:api-field:v1`. Its sanitizer permits only:

- one known preset ID;
- the Quick Call preference;
- up to eight known preset IDs with timestamps;
- up to twelve verified endpoint ID and snippet-language pairs with timestamps.

It never persists search text, generated code, request values, API keys, temporary tokens, Authorization headers, response bodies, transcripts, audio, free-text customer questions, or customer identifiers. Unknown fields, endpoint IDs, preset IDs, languages, and invalid timestamps are discarded.

## Main files

- `src/components/pocket-deepgram/PocketApiLab.tsx` — field-assistant orchestration and live-state UI.
- `src/components/pocket-deepgram/PocketApiSnippetWorkbench.tsx` — accessible code tabs, copy, and pin actions.
- `src/components/pocket-deepgram/PocketApiOperationBadge.tsx` — read-only, billable, and mutating status.
- `src/hooks/use-pocket-api-lab.ts` — versioned, allowlisted browser persistence.
- `src/data/pocket-api-lab.ts` — deterministic common questions and capability labels.
- `src/lib/pocket-api-lab.ts` — pure registry search, request derivation, code generation, classification, comparison, handoff, and storage functions.
- `src/types/pocket-api-lab.ts` — portable widget domain types.

## Verification

```bash
npm run test:pocket-api
npm run test:pocket
npm run typecheck
npm run lint
npm run build
npm run secret:audit
```

Focused tests cover capability mapping, preset selection, code generation, endpoint/parameter search, model values, operation safety, handoff URLs, storage secret isolation, 390×844 mobile rendering, live unauthorized and rate-limited states, and selection continuity into the full API Lab.

## Known limitations

- The widget intentionally does not provide editable arbitrary path/body values; the full API Lab owns validated request editing.
- Realtime operations are explained and handed off, not executed inside the compact widget.
- Administrative mutations are intentionally locked.
- The architecture-studio handoff carries context in the URL, but the Architecture Studio does not yet render a dedicated API-context banner.
- Pinned snippets store a pointer to regenerated code, not a snapshot; a verified registry update can change the regenerated example.

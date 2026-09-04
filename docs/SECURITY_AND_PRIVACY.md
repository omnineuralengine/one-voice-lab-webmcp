# Security and Privacy

The Lab treats notes, transcripts, code, artifacts, URLs, Mermaid, Markdown,
imported cases, manual edits, and generated documents as untrusted data.

## Non-execution boundary

The web application does not evaluate pasted code, use `eval` or
`new Function`, invoke a shell or `child_process`, fetch arbitrary URLs from
case content, connect to pasted WebSocket URLs, execute Mermaid callbacks, or
render unsanitized HTML. API execution is a separate, explicit API Lab action;
deliverable generation never executes a customer request.

## Credentials and external requests

Permanent `DEEPGRAM_API_KEY`, Docs MCP authorization, service-role keys, access
codes, and session secrets are server-only. Browser realtime workflows use the
existing temporary-credential boundary where implemented.

## Identity, wallets, and future payments

Guest Mode does not create an anonymous cloud identity. Optional ONE identities use Supabase; public URL/publishable-key configuration is allowed in the browser, while OAuth secrets, service-role keys, CAPTCHA secrets, payment keys, and webhook secrets remain server-only.

Wallet authentication proves control of an address for sign-in only. The requested message explicitly states that it does not authorize a payment. Injected wallets and the optional WalletConnect transport may request only the account, chain identifier, and `personal_sign`; the Lab does not request transactions, token approvals, balance/NFT history, or seed phrases. WalletConnect is loaded only after an explicit tap, opts out of vendor telemetry, renders its QR code locally, and remains disabled until its project is restricted to the canonical origin. Supabase Web3 rate limits and CAPTCHA are mandatory before production enablement because new wallet identities are cheap to automate.

The repository currently moves no money. A future payment implementation must create orders and prices on the server, verify raw signed webhooks, process provider event IDs exactly once, and grant finite entitlements only from a confirmed server-side payment state. Browser redirects, connected wallets, submitted transaction hashes, and login signatures are never payment proof. Payment wallets and login identities must remain separate records.

Flux Conversation Observatory connects directly to the documented
`wss://api.deepgram.com/v2/listen` endpoint only after two visible actions:
microphone preparation/consent and provider session start. Its permanent API
key never enters client props or browser state. The same-origin
`/api/deepgram/token` route validates a bounded request, applies an in-memory
six-attempt-per-minute client limit, and returns no-store responses for local
operator workflows. Hosted and production token issuance is disabled even when
the legacy `DEEPGRAM_BROWSER_REALTIME_ENABLED` flag is set because current
repository evidence does not establish replay-safe downstream concurrency. A
requested local TTL must be an integer from 30 through 600 seconds.

The short-lived credential is passed using the Bearer WebSocket subprotocol,
not a URL parameter, and exists only in a private in-memory client reference.
Stop, error, token expiry, reconnect, microphone disappearance, and component
unmount clear that reference. Credential values are excluded from DOM
attributes, local/session storage, IndexedDB, logs, analytics, errors, fixtures,
screenshots, handoffs, Mermaid, and scorecard exports.

The official Docs adapter sends only a redacted technical query after an
explicit action. It does not send raw transcripts and does not act as an
arbitrary URL proxy. Returned URLs must match the official Deepgram
documentation allowlist. Curated fallback results are labeled as fallback, not
fresh live retrieval.

## Case data and local persistence

Case content is local-first and is not uploaded automatically. Persisted
technical evidence is redacted. Raw API keys, tokens, cookies, raw audio,
unapproved transcripts, and unredacted code or logs must not be stored in case
state. Case purge deletes the case and its ledger together.

Deliverables export history stores only timestamp, selected profile, readiness,
source revision, and artifact count. It deliberately excludes customer name,
artifact text, source excerpts, transcripts, and binaries.

Public Demo Mode uses fictional fixtures. Restricted hosted-review surfaces
must not expose real customer evidence, private repository
details, or personal workshop notes.

Flux Synthetic Replay is provider-independent and cannot request a credential
or microphone. Live Provider Mode keeps a bounded event session in memory and
does not automatically persist transcripts or raw microphone audio. Reviewer
notes are bounded, explicitly entered, and pass through the export sanitizer;
operators must not paste customer transcripts, credentials, or private
identifiers into them.

Provider payloads are untrusted. The Flux normalizer caps and sanitizes text,
redacts secret-shaped keys and authorization values, tolerates malformed JSON
and unknown future events, and keeps obsolete connection generations from
changing current state. The browser does not fetch a provider URL supplied by
an event. The AudioWorklet uses bounded frames, and WebSocket backpressure drops
and counts frames rather than growing without limit.

## Claim and export safety

Customer artifacts use active, non-superseded items that are explicitly approved
for customer export. The compiler excludes private-only and do-not-claim items,
rejected decisions, unapproved technical artifacts, raw code, secrets, local
paths, and unconfirmed release findings by default.

Assumptions, hypotheses, stale evidence, scoped tests, proposed decisions, and
possible release matches may appear only with qualification. A successful API
Lab request proves only the tested request and environment. Generation success
does not make an artifact customer-ready.

Manual edits preserve the source-generated version and re-run claim, secret,
layout, and artifact checks. Unsupported new language remains visibly
user-edited and qualified; secret-shaped or local-path content blocks
generation.

The optional machine-readable case file is off by default. When enabled, the
server builds an allowlisted, recursively redacted projection. The customer ZIP
does not contain transcripts, raw audio, environment files, credentials, hidden
files, Git data, or the internal reviewer brief.

Flux POC scorecards deliberately exclude transcript text, raw audio,
credentials, authorization headers, unsanitized provider URLs, and internal
error stacks. Cross-module handoffs carry configuration, evidence status,
risks, questions, and objective metric summaries only. A local provider event
is still labeled for review and cannot become customer evidence merely because
it was received.

## Artifact controls

- Mermaid accepts only bounded flowchart syntax and rejects initialization,
  click, callbacks, HTML, unsafe protocols, external CSS, and external media.
- SVG is generated from sanitized labels and contains no remote images or
  executable links.
- PDF, PPTX, and ZIP generation runs in a Node-only route using safe filenames,
  safe ZIP paths, file and size limits, checksums, and no remote assets.
- PDF download requires a parsed, non-empty, exactly one-page result that passes
  layout checks.
- PPTX download requires valid Office Open XML structure, expected slide titles
  and count, an embedded architecture asset, and no external relationships.
- Solution Pack download requires every selected artifact and matching manifest
  checksums. A blocked customer case cannot produce a valid customer pack.
- Changing source case, profile, customer display name, manual edit, or Mermaid
  source invalidates the prior download state until regeneration.

## Logs and analytics

Operational logs may contain operation type, success or failure, duration, byte
size, page or slide count, validation state, claim-audit state, source count,
schema version, and error category.

They must not contain customer names, case text, questions or answers, code,
artifact text, Mermaid source, filenames containing customer identity, source
excerpts, request IDs, credentials, private URLs, transcript text, or Stream
Deck command sequences. Analytics follows the existing consent boundary and
uses coarse events only.

## Operator responsibilities

- Keep `.env.local`, credentials, recordings, private cases, and generated
  customer artifacts out of Git.
- Verify consent and disclosure before microphone or recording use.
- Use [Flux Provider Validation](FLUX_PROVIDER_VALIDATION.md) before describing
  a Flux run as live-provider validated; a fixture pass is not provider
  evidence.
- Review every customer-facing artifact and its sources before sharing.
- Confirm live account entitlements, current documentation, deployment facts,
  and customer acceptance outside the synthetic test suite.
- Re-run privacy, secret, artifact, and production-build gates before release.
## Open Lab and Flux TTS security additions

Verification date: **2026-08-14**

This community-built Lab treats transcripts, notes, code, artifacts, URLs, Markdown, Mermaid, imported cases, and generated documents as untrusted. It does not execute pasted code, fetch arbitrary case URLs, embed remote export assets, or automatically upload, email, publish, or share artifacts.

## Open Lab and credentials

- Public visitors do not paste a Deepgram key. `DEEPGRAM_API_KEY` remains server-side.
- `OPEN_LAB_MODE` is a public UX mode; `OPEN_LAB_DEEPGRAM_ENABLED` is a private server-side provider switch. Neither is a credential.
- Open Lab live calls require an explicit user action and validated narrow application route. There is no auto-run, background loop, or automatic retry.
- When the switch is off, synthetic/local tools remain available.
- Public Open Lab blocks account/Management reads and implements no key/project/billing/account mutation.
- `/api/deepgram/execute` is a registry-allowlisted operation layer, not an arbitrary URL proxy.

## Permanent and temporary secrets

Permanent keys must not appear in public environment variables, browser JavaScript, React props, HTML, local/session storage, IndexedDB, cookies, source maps, generated examples, inspectors, logs, errors, traces, snapshots, or documentation samples. Generated examples use `$DEEPGRAM_API_KEY` or `process.env.DEEPGRAM_API_KEY` placeholders.

Local realtime browser flows request a short-lived JWT only on explicit connect. `/api/deepgram/token` uses the server key with `/v1/auth/grant` and returns `Cache-Control: no-store`; hosted issuance remains disabled pending authoritative replay/concurrency semantics. The browser holds a local JWT in memory, uses it for the documented bearer subprotocol, clears it after connection/failure/cleanup, and excludes it from inspection/export. Temporary tokens are not used for Manage APIs.

## Flux TTS

`/api/deepgram/flux-tts` validates strict JSON, bounded non-empty text, a dated 35-model allowlist, and documented format combinations. It uses the server key with `/v2/speak`, preserves binary content type and safe request IDs, sets `no-store`, and cleans up abort/timeout paths without retry.

The flight recorder stores sanitized lifecycle metadata and text length, not synthesis text. Authorization, API keys, JWTs, cookies, environment values, and unapproved raw microphone audio are never accepted trace fields. Browser-measured timing remains labeled measured rather than provider-reported.

Flux streaming is disabled pending deployed browser-auth/raw-audio proof. No delayed-batch simulation or serverless WebSocket relay is presented as streaming.

## Consent and data handling

- Microphone permission and recording disclosure remain mandatory.
- Selecting an audio file/sample stays local until an explicit submission.
- Raw audio is not intentionally persisted; media tracks and object URLs are cleaned up.
- Raw transcripts are excluded from URLs, official-doc queries, and default customer exports.
- Transcript redaction does not sanitize the original audio.
- Familiar Care keeps consent, disclosure, opt-out, fallback, and text-policy gates. It is not identity cloning, production care software, or legal/compliance advice.
- Public status warns against confidential or regulated information.

## Storage and private content

Local-first browser storage is not encrypted enterprise storage. It is origin/device accessible and clearable. Live Solution Studio has purge/export controls; Pocket stores only allowlisted preferences and module recents. Open Lab does not expose customer, local-case, or internal repository content. Provider configuration is represented by booleans only.

Mermaid is bounded and rejects active/unsafe directives. Binary generation uses safe names/ZIP paths, file/size limits, checksums, and no remote assets. Logs may record operational state and sizes, never customer content or credentials.

## Evidence limits

Repository tests and mocks do not prove provider uptime, account entitlement, customer-audio accuracy, latency, quality, scale, pricing, compliance, or production readiness. A successful request applies only to its exact environment/input. Current official Flux docs checked on 2026-08-14 list 36 English voices; the Lab intentionally executes 35 and excludes documented `flux-conor-en`. The Lab Early Access label is not a provider lifecycle claim, and the repository does not claim GA.

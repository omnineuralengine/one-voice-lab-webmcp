# Scenario Studio threat model

Scope: the Scenario Studio deterministic, fixture-only, ephemeral Scenario Studio and Explain This Run.

## Assets

- verified human/session and guest boundaries;
- server-owned executable scenario/action/fixture mappings;
- admission and quota authority;
- canonical receipts, evidence, and explanation integrity;
- private run inputs and in-memory results;
- provider credentials and provider budgets elsewhere in ONE;
- the access architecture ownership and cross-user isolation invariants.

## Trust boundaries

1. Browser to Scenario Studio route: the browser controls a small JSON request but owns no action, fixture, provider, identity, or execution authority.
2. Route to admission/identity services: same-origin and bounded parsing happen before quota consumption; identity is server-derived and reduced to a non-authorizing coarse receipt scope.
3. Scenario registry to canonical action runtime: the server maps one pinned scenario/version to one allowlisted synthetic action; no browser value selects an executable action.
4. Action result to receipt: provider-shaped or unbounded output is not accepted. Strict schemas, bounds, normalization, and redaction create receipt-local evidence.
5. Receipt to explanation/UI: explanation is a pure ruleset projection. Interface depth changes disclosure, not the evidence universe or authority.
6. Browser memory to identity transition/cache: a client epoch invalidates stale completion; reload/navigation discards state; response and service-worker rules prohibit storage.

## Threats and controls

| Threat | Prevention | Deterministic evidence | Residual / deployment work |
| --- | --- | --- | --- |
| Unregistered action, fixture, provider, or live-mode injection | Strict closed request; server-only registry; literal synthetic mode; exact version match | Negative schema/route/action tests | Future scenario additions require review of the same allowlist |
| Oversized, deeply nested, or corrupted input | Pre-parse byte ceiling; bounded primitive input; strict unknown-key rejection | Content-type, size, malformed JSON, extra-field tests | Edge/WAF limits remain deployment defense in depth |
| Cross-site request forgery | Same-origin browser signal and origin validation before admission | cross-site/origin tests | Deployed proxy/CDN header behavior is Level 3 |
| Rapid duplicate execution or quota bypass | Client single-flight; existing server admission; no global idempotency claim | double-activation and admission-denial tests | Distributed edge rate limiting remains deployment work |
| Credential or feature flag accidentally activates live execution | Scenario code imports no provider adapter/client and has no live branch; manifest pins provider calls false | provider-domain/global-fetch sentinel and source audit | Future live scenarios require a separate architecture/security stage |
| Secret, auth, correlation, or raw payload leakage | Allowlisted receipt fields; bounded sanitized errors; token never serialized/logged; secret-key/value audit | schema/redaction/source/build audit | Production logging/drain review remains Level 3 |
| Explanation invents causality, confidence, or quality | Pure independently versioned ruleset; receipt and explanation pin the same ruleset; every statement carries receipt/evidence basis refs; unknown/not-measured preserved | schema and projection assertions over complete/failure receipts | New rules require a ruleset-version bump and review, independent of response-schema evolution |
| Fixture evidence presented as provider performance or benchmark proof | Provenance fixed to `synthetic_fixture`; no provider/model fields; explicit non-benchmark limitations | receipt/UI tests | Live/provider comparison remains outside the Scenario Studio |
| Receipt enumeration or IDOR | No GET, history, retrieval, export, share, database key, or URL receipt ID | route/source audit | Durable history would need owner RLS and retention design |
| Cross-user or stale completion leakage | React-memory only; identity epoch abort/ignore; server emits no raw identity | identity-transition and local-auth journey tests | Production auth transition behavior remains Level 3 |
| Browser/service-worker/CDN cache leakage | private no-store response; Vary Cookie; API exclusion; scenario route absent from shell precache | header and service-worker source tests | Deployed CDN/PWA lifecycle remains Level 3 |
| XSS through copy, errors, or evidence | React text rendering; no raw HTML; schemas bound string sizes; static safe copy | malicious-string rendering/source tests | CSP and deployed browser review remain Level 3 |
| Unbounded receipt/evidence growth | Fixed step/evidence counts and bounded strings/arrays | schema boundary tests | Future multi-step authoring requires new resource analysis |
| Offline/background replay | no queue, retry, background sync, persistence, or automatic execution | offline browser and service-worker tests | Deployed install lifecycle remains Level 3 |

## Security invariants

1. Interface depth is presentation only.
2. A browser cannot select an executable action, fixture, provider, model, owner, or trust tier.
3. A credential, environment flag, provider registration, or fixture cannot enable live scenario execution.
4. Lifecycle completion is separate from evaluation outcome and evidence completeness.
5. Synthetic provenance remains visible at every depth.
6. Unknown and not-measured evidence is never promoted to observed.
7. Every explanation claim is traceable to the terminal receipt, and its independently versioned ruleset matches the ruleset pinned by that receipt.
8. Receipt IDs and evidence refs grant no retrieval or authority.
9. Guest and account receipts are not saved, merged, migrated, or transferred.
10. A principal transition discards prior and stale in-flight receipt state.
11. No voice-provider call or credit occurs, and no scenario request, receipt, evidence, explanation, or feature analytics is persisted. Existing server identity verification and bounded quota admission may contact Supabase and update pseudonymous operational counters.
12. the access architecture ownership, RLS, and privileged-Supabase boundaries remain unchanged.

## Residual risk

The Level 1-2 slice cannot establish deployed cache/CDN behavior, WAF enforcement, production authentication transitions, real-device PWA lifecycle, or manual assistive-technology conformance. It also does not authorize a live/provider-backed scenario. Those are explicit future gates, not implicit capabilities of this receipt contract.

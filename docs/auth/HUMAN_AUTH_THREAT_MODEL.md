# ONE human authentication threat model

## Scope and evidence boundary

This threat model covers the access architecture human authentication, sessions, guest state,
user-owned application data, export, deletion, and PWA behavior. It excludes
organization/RBAC design, machine identity, billing, and provider execution
except where an authenticated human could reach an existing protected action.

Controls described as implemented are **Level 1 — architecturally
established**. A control is **Level 2 — locally / deterministically verified**
only when the the access architecture validation record shows its test passed. No control is
**Level 3 — production verified** in this stage.

## Assets

- the human account and Supabase authentication identities;
- browser and server session material;
- ONE's application human/ownership mapping;
- guest preferences and synthetic saved work;
- account-owned profile, preferences, notification state, and saved experiments;
- private evaluations, histories, or artifacts governed by their existing
  visibility models;
- versioned account exports;
- destructive account-deletion authority;
- future organization relationships;
- public Supabase configuration and server-only privileged credentials.

## Trust boundaries

| Boundary | Trusted for | Not trusted for |
| --- | --- | --- |
| Browser UI | User intent and presentation | Identity, ownership, recent auth, or arbitrary target IDs |
| Local storage | Best-effort guest convenience | Authentication, integrity, secrets, or cross-device ownership |
| `one_lab_session` cookie | Opaque device-session correlation and migration idempotency | Human identity or authorization |
| ONE server | Schema enforcement and server-side authorization after verified session resolution | Trusting raw browser claims |
| Supabase Auth | Auth subject, session lifecycle, supported auth/OAuth/MFA primitives | Application authorization by itself |
| Supabase database | RLS, foreign keys, transactional ownership and migration invariants | Product intent not represented by policy |
| Service worker/PWA cache | Allowlisted public shell assets | Auth callbacks, account pages, APIs, or private content |
| OAuth/email provider | Provider-specific proof and delivery once configured | Automatic account merging based on untrusted text |
| Analytics/telemetry | Bounded operational outcomes | Tokens, raw email, guest payload, or identity authority |
| Future external systems | Nothing in the access architecture | Human or resource authority without a future explicit contract |

## Principal threat analysis

| Threat | Severity | Prevention in repository | Detection/evidence | Residual risk or production control |
| --- | --- | --- | --- | --- |
| Session theft | High | Server resolves protected identity with Supabase `getUser()`; sensitive responses are private/no-store; tokens are excluded from telemetry | Deterministic identity-state tests; a dedicated session-expired telemetry event remains deferred | XSS can affect browser-accessible session material. Production CSP, cookie/domain review, dependency monitoring, and incident revocation remain required |
| Session fixation or confusion | High | Auth session and the opaque Lab session are separate; the latter never authorizes resources | Identity-state and malformed-session tests | Production callback/session rotation behavior must be verified with configured Supabase Auth |
| Stale, expired, or malformed session authorization | High | `resolveHumanIdentity()` returns explicit guest, invalid, or unavailable states; protected routes fail closed | Deterministic principal-resolution tests and bounded failure events | Full expiry, resume, and multi-tab behavior needs deployed browser/PWA verification |
| Anonymous-auth principal promoted to human | High | Server and browser reject Supabase users marked `is_anonymous`; protected operations fail closed even if deployment configuration drifts | Deterministic identity-resolution and source tests | Keep anonymous sign-in disabled and verify production auth-provider settings |
| Callback manipulation or open redirect | High | Exact same-origin destination allowlist; rejects external, protocol-relative, backslash, encoded slash/backslash, and unlisted targets | Redirect-security tests | Production redirect allowlists and provider callback settings require independent review |
| Callback replay causing duplicate migration | Medium | Guest claim and migration use a unique receipt, transactional lock, and completed state | pgTAP and deterministic replay tests | Production auth-provider code replay semantics remain unverified; migration itself is idempotent |
| Client-supplied user-ID substitution | Critical | Account routes expose no target owner; `HumanPrincipal` derives IDs from verified server auth | Source-boundary and route tests | Browser-direct writes still require continuous RLS regression coverage |
| Cross-user read, mutation, export, or deletion | Critical | Owner RLS uses `auth.uid()`; export and deletion use only server-derived identity; deletion has no target ID | USER_A/USER_B pgTAP and route tests | New user-owned tables/routes must adopt the same model; production migrations must be applied and retested |
| Guest-state leakage between accounts | High | Callback and every verified browser auth transition bind the opaque guest hash before account state is exposed; an unavailable claim signs out locally; a second account receives `claimed-by-another-account`; account state is reset before account load; eligible local state is cleared after cross-account denial or successful import | Migration/account-switch and transition-boundary tests | Device-local storage remains accessible to scripts running in the origin; XSS and physical-device access remain residual risks |
| Guest state overwrites account state | High | Preference inserts use conflict-do-nothing; import is explicit and existing account rows win | Database precedence tests and human-facing import copy | Additive saved experiments and notification reads still require clear UX; no arbitrary guest fields are accepted |
| Migration replay or duplicate import | High | Unique guest hash, advisory transaction lock, completed receipt, bounded account claim count | Replay and concurrency-safe database tests | A future schema version needs an explicit compatibility/migration rule |
| Corrupt or oversized guest payload | Medium | Strict client/server schemas, 160 KB route/database limit, allowlisted fields and per-array limits | Negative parser and database tests | Local state can be lost or skipped; local copy remains until acknowledged |
| Unsafe account linking or duplicate identity merge | High | Manual link/unlink UI is absent; no merge based solely on an email string | Source test verifies link controls are absent | Provider collision, verified-email, and recent-auth workflows are deferred; support runbook needed before enabling |
| Account enumeration | Medium | Passwordless route returns a generic accepted message and normalized errors | Deterministic response tests | Provider timing and provider-native responses require production testing; WAF/provider rate limits are required |
| Passwordless/OAuth abuse | Medium | Bounded body, same-site requirement, process-local burst control, provider-native flow | Normalized rate-limit events | In-memory limit is not globally durable. Configure Supabase rate limits, edge WAF, monitoring, and CAPTCHA only at justified abuse points |
| CSRF on account actions | High | Browser account endpoints, including export, require explicit same-site request signals; destructive requests also require exact confirmation | Cross-origin and missing-browser-signal negative tests | Same-site headers are defense in depth, not universal non-browser authentication. Production cookie SameSite/origin policy review remains required |
| Account deletion bypass | Critical | Verified principal, exact confirmation, current-session-bound non-refresh authentication timestamp within ten minutes, server-only admin client, no target parameter | Current/other-session recent-auth, route, and cascade tests | Provider-side deletion and retention behavior must be production verified; stronger MFA/AAL may be required later |
| Export authorization bypass | Critical | Verified principal and server-derived owner; fixed allowlisted projections; no target parameter | Cross-origin/source checks and RLS isolation tests | Export coverage is intentionally partial; future owned data must be added explicitly and tested |
| Service-role key exposure | Critical | Admin module is `server-only`; browser config accepts only URL and publishable key | Secret audit and source/bundle review | Deployment-variable scoping and built-bundle inspection remain production gates |
| OAuth/access/refresh token exposure | Critical | Raw provider errors are normalized; callbacks and account responses are no-store; telemetry schema has no token fields | Secret audit and error-normalization tests | Browser compromise remains a threat; production logs, APM, and provider dashboards need review |
| Service-worker cache leakage after logout | High | No API/auth/settings/bench/membership caching; token-query exclusion; only allowlisted shell navigations may be cached; private/no-store excluded | Service-worker source tests | Installed-PWA upgrade, old worker eviction, and platform-specific cache behavior require deployed verification |
| Accidental analytics identity correlation | Medium | Auth events omit email, tokens, cookies, payload, and raw profile data; device signal is not a human ID | Source review and bounded-label tests | External analytics configuration and deletion/reset behavior must be reviewed before production use |
| XSS impact on auth state | Critical | Output escaping/framework defaults, bounded data projections, no tokens in logs, private cache rules | Existing lint/security tests | A successful same-origin XSS can act as the human. Production CSP, dependency review, DOM sink audit, and rapid session revocation remain necessary |
| Privileged operation reachable by ordinary authenticated user | High | Deletion derives the caller, requires recent auth, and exposes no arbitrary admin function; administrative provider/trust routes retain their own authorization | Negative route tests | Every future privileged route needs explicit principal, target, and action review |
| Ambiguous historical ownership | High | the access architecture does not attach unattributed records to the first account; existing benchmark records retain their own visibility/owner semantics | Schema/document review | Product decisions may be needed for legacy ambiguous records; do not infer ownership automatically |

## Ownership invariants

The architecture is designed to enforce these invariants:

1. An authenticated session proves a principal, not authorization to arbitrary
   resources.
2. Ownership comes from verified server/session/database state, never an
   untrusted browser owner identifier.
3. USER_A cannot read, mutate, export, or delete USER_B-owned data.
4. Switching from USER_A to USER_B on one device does not expose USER_A's
   account state to USER_B.
5. Guest state cannot silently overwrite authenticated account state.
6. Repeated guest migration cannot duplicate imported state.
7. Callback replay cannot duplicate migration or mutate another account.
8. Logout removes protected authority even if stale UI remains visible.
9. Stale, malformed, or unavailable session verification fails closed.
10. Account deletion cannot select another human through identifier
    substitution.
11. Account export cannot select another human through identifier
    substitution.
12. Privileged Supabase authority remains server-only.

The the access architecture handoff must report the executed PASS/FAIL/NOT APPLICABLE result for
each invariant. This document does not turn unexecuted test code into Level 2
evidence.

## Security controls by layer

### Browser

- guest/account state is separated during auth transitions;
- import is a deliberate action with explicit scope;
- loading, failure, destructive confirmation, and status text are visible;
- auth and account responses use no-store semantics;
- service-worker caching excludes identity-sensitive routes;
- browser-supplied IDs are treated only as row data and remain RLS constrained.

### Server

- bounded JSON bodies and allowlisted schemas;
- same-site checks on browser-only operations;
- verified Supabase session resolution;
- server-derived human and auth subject IDs;
- normalized errors and bounded observability;
- current-session-bound recent-auth check before account deletion;
- server-only service-role use for the one privileged deletion operation.

### Database

- foreign keys to `auth.users` with reviewed cascade or unlink behavior;
- owner RLS for user-owned application tables;
- private, non-browser-readable guest receipt ledger;
- security-definer functions with empty search paths and explicit grants;
- `auth.uid()`-derived owner, no owner argument;
- advisory lock, unique guest hash, bounded claim count, and transactional
  migration.

## Privacy assumptions

- The application needs a stable human ID, not a duplicate identity profile.
- Raw email is presented only where needed for the signed-in human's UI and is
  not an analytics identifier.
- Guest payloads remain device-local except during an explicit bounded import;
  the database retains only migration metadata and a digest.
- Auth tokens, OTPs, magic links, OAuth tokens, cookies, service credentials,
  and raw provider errors are forbidden from application telemetry.
- Account deletion removes cascade-owned state. Operational records and
  user-authored feedback may lose the owner link yet retain bounded text under
  their existing retention policies; that text is not claimed to be
  deidentified. Production privacy/legal review is still required.

## Production-only controls and residual risk

Before activation, separately verify production Supabase Auth settings, exact
redirect URLs, email/OAuth configuration, SMTP/provider abuse controls, WAF
limits, cookie and custom-domain behavior, CSP, monitoring redaction, session
revocation, backup/recovery, deletion retention, old service-worker eviction,
mobile/PWA deep links, and incident response.

The repository contains no proof that those deployed controls are active. No
real authentication message, live OAuth flow, real account deletion, production
migration, or production configuration change is part of the access architecture.

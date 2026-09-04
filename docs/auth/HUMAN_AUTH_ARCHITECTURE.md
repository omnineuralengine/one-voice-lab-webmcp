# ONE human authentication architecture

## Purpose

ONE keeps the Lab useful in Guest Mode and adds an account only when a human
wants durable ownership, synchronized preferences, saved work, export, or
member-only surfaces. Authentication unlocks those capabilities; it is not a
blanket authorization grant and it is not required for public exploration.

This document describes the repository architecture established by the access architecture.
It does not claim that production authentication has been configured or
verified.

## Verification levels

- **Level 1 — Architecturally established:** the contracts, routes, database
  migration, ownership rules, and UI boundaries exist in the repository.
- **Level 2 — Locally / deterministically verified:** repository tests,
  fixtures, mocks, or the disposable local database demonstrate the behavior.
  Exact passing commands and counts belong in the the access architecture handoff record.
- **Level 3 — Production verified:** a controlled deployed configuration has
  been tested against production infrastructure.

the access architecture establishes Level 1 and targeted Level 2 evidence. No capability in
this document is Level 3. Production configuration, redirect allowlists,
email delivery, OAuth clients, deployed RLS, cookie behavior, monitoring, and
recovery remain deployment gates.

## Authentication provider decision

Supabase Auth remains the single human authenticator. It already shares the
repository's database boundary, works with `auth.uid()`-based RLS, supports
cookie-backed server rendering through `@supabase/ssr`, and leaves future MFA
and supported OAuth paths available. Adding a second authenticator would create
identity reconciliation and session complexity without current product value.

The relationship is deliberately narrow:

```text
Supabase Auth subject
        |
        | verified on the server
        v
ONE HumanPrincipal
        |
        +--> application ownership (`humanId`)
        +--> assurance and recent-auth context
        +--> authorization and trust checks performed separately
```

Today `humanId` and `authSubjectId` are the same verified UUID in a one-to-one
mapping. They have separate names so application code does not treat an
arbitrary UUID, an email, or the complete Supabase user object as ONE's domain
identity. A future organization membership or machine principal can be added
without redefining the human.

## Identity concepts

| Concept | Current meaning | Not equivalent to |
| --- | --- | --- |
| Authentication | Supabase verifies control of a human sign-in identity | Ownership or permission |
| ONE human | A `HumanPrincipal` anchored to a verified auth subject | A browser-provided user ID |
| Authorization | Route, action, trust, quota, and policy decisions | Merely being signed in |
| Resource ownership | A database relationship protected by RLS and/or a server-derived human ID | UI visibility |
| Guest identity | An unauthenticated browser context with bounded local state and an opaque session signal | A unique person |
| Organization identity | Deferred | Human identity |
| Machine or agent identity | Deferred | Human identity or a caller label |

Verified Supabase anonymous-auth users are not promoted to ONE humans. They
fail closed for protected server operations and render as Guest Mode in the
browser. Anonymous Supabase sign-in remains disabled in repository and
production configuration; this code invariant prevents configuration drift
from collapsing guest and human identity.

The opaque `one_lab_session` cookie is a browser-session signal used for
bounded admission and guest-migration idempotency. It is not authentication,
not a fingerprint, and not evidence of a unique human.

## Guest experience

A guest can explore public Labs, provider information, public evidence, local
customization, notification-read state, provider-presentation preferences, and
synthetic Simulation Lab work where the existing product permits it. Guest
state is stored locally on that browser and remains usable when account services
are unavailable.

Guest state does not include or authorize:

- cloud ownership or cross-device synchronization;
- another human's data;
- provider credentials or paid execution;
- private audio, transcripts, customer material, or arbitrary browser data;
- account export or account deletion;
- member-only content rendered after server session verification.

If browser storage is unavailable or corrupt, Guest Mode falls back to defaults.
It does not convert a storage failure into an authenticated or privileged state.

## Account experience

The Settings identity surface communicates whether the current person is a
guest or signed in. Email passwordless sign-in is the preferred entry. Existing
password support is retained behind a secondary disclosure for compatibility.
OAuth buttons are configuration-gated and no provider is enabled merely by
having UI code. Existing wallet authentication remains a separately gated
compatibility surface; it proves control of an authentication method, not a
payment, balance, reputation, or authorization.

After sign-in, the human can use account-backed profile and preferences, owned
saved simulations, bounded guest import, account export, logout, and the
account-deletion boundary. Existing account state always takes precedence over
guest preference rows.

Manual browser-side identity link/unlink controls are not exposed. Automatic
merging based solely on matching email text is not allowed. Multi-method
linking remains deferred until provider guarantees, collision behavior, and a
recent-authentication interaction are production-reviewed.

## Passwordless and OAuth boundaries

`POST /api/auth/passwordless` accepts only a small same-site browser request,
validates a bounded email and an allowlisted callback destination, applies a
small process-local burst guard, and calls Supabase's passwordless method. The
response is intentionally account-enumeration resistant: it does not reveal
whether an account already existed. Provider-native and deployment-edge rate
limits remain required because a process-local map does not coordinate every
instance.

`GET /auth/callback` exchanges the provider code using the supported Supabase
flow. The destination is reduced to an exact same-origin allowlist containing
only `/settings` and `/settings#identity`; external, protocol-relative,
backslash, encoded slash/backslash, query-extended, or otherwise unlisted
destinations fall back safely. Callback responses are private and `no-store`.

OAuth remains configuration-gated. the access architecture does not create OAuth applications,
contact a live OAuth provider, or prove account-linking behavior. Supabase owns
state/PKCE cryptography; ONE does not implement custom OAuth cryptography.

## Session architecture

The session lifecycle has distinct server and browser responsibilities:

1. `src/proxy.ts` runs the Supabase SSR refresh boundary and calls
   `getClaims()` when public Supabase configuration exists.
2. Server code creates a cookie-bound Supabase client and calls `getUser()`
   through `resolveHumanIdentity()` before protected work.
3. The browser client uses `getUser()` and `onAuthStateChange()` to render a
   coherent account experience. Every transition to a verified human calls the
   same-site guest-claim backstop before account state is exposed. If ownership
   cannot be established, the local session is signed out fail-closed. Browser
   state improves UX; it is not security authority.
4. Invalid, malformed, expired, or unavailable session verification fails
   closed for protected operations. Safe guest functionality can remain
   available.
5. Logout calls Supabase sign-out, clears account-derived in-memory state, and
   reloads the device's guest-safe state. Subsequent protected requests must
   reverify a session.

Multiple tabs rely on Supabase's browser session notifications. Installed-PWA
resume and offline session behavior still require controlled deployment
validation; offline UI must never be treated as proof that a protected session
is valid.

## Server, browser, and credential boundary

Browser code receives only the public Supabase URL and publishable key. A
publishable key is configuration, not privileged database authority. The
service-role credential is referenced only by a `server-only` admin client and
is used for the narrow account-deletion operation.

Protected server routes follow this sequence:

```text
bounded request
  -> same-site check where browser-only semantics are required
  -> server cookie-bound Supabase client
  -> verified HumanPrincipal
  -> ownership / recent-auth / route authorization
  -> bounded database or privileged operation
  -> sanitized private no-store response
```

No account route accepts a caller-provided target human. Browser-accessible
Supabase writes that include a row owner field remain constrained by RLS using
`auth.uid()`; the field is data, not authority.

## Ownership and RLS

The current user-owned tables include `profiles`, `user_preferences`,
`notification_preferences`, `user_notification_state`, and
`saved_experiments`. They reference `auth.users`, enable RLS, grant only the
required authenticated operations, and use `auth.uid()` in both visibility and
write checks. The private guest-migration ledger grants no direct browser-role
access.

Application routes additionally derive `humanId` from the verified session.
Export selects rows only for that derived ID. Deletion targets only the derived
`authSubjectId`. An authenticated session therefore proves a principal but does
not authorize arbitrary resource identifiers.

Historical benchmark and operational records have their own retention and
ownership semantics. Account deletion may remove the owner link where existing
schema intentionally uses `ON DELETE SET NULL`; retained user-authored feedback
text is not guaranteed to be deidentified and may remain for its bounded
retention period. Deletion must not rewrite historical evidence as though it
never existed.

## Guest-to-account migration

Migration is explicit, allowlisted, bounded, idempotent, and ownership-safe.
The callback claims the current opaque guest-session receipt for callback-based
sign-in, and the browser session observer repeats the same server-side claim as
an idempotent backstop for password, wallet, recovered callback, and session
resume paths. Account state is not exposed until the backstop succeeds. If the
receipt already belongs to another human, only the eligible local guest keys
are cleared before the new account is shown. The human then chooses whether to
import eligible local state. The database derives the owner from `auth.uid()`
and stores only a receipt hash, bounded counts, status, and payload digest—not
the guest payload.

Account preference rows are never silently overwritten. Known notification
read state is additive, and at most twelve validated synthetic experiments are
imported within the existing account limit. A completed receipt prevents replay
duplication. The same guest receipt cannot be claimed by another human on the
same device. See [GUEST_ACCOUNT_MIGRATION.md](GUEST_ACCOUNT_MIGRATION.md).

## Export and deletion

`GET /api/account/export` is authenticated, same-site, owner-derived, bounded,
private, and `no-store`. Its versioned JSON includes profile, preferences,
notification state, and saved synthetic simulations. It excludes credentials,
auth tokens, system/security records, and private benchmark artifacts. It has
no target-owner parameter.

`DELETE /api/account/delete` requires a verified session, a same-site browser
request, an exact destructive confirmation, and authentication within the
current ten-minute recent-auth window. A server-only admin client deletes only
the auth subject derived from that session. If privileged configuration is
absent, deletion reports that it is not configured; it does not pretend to
delete the account. Successful deletion signs out locally, expires the opaque
Lab session, requests cache clearing, and relies on reviewed foreign-key
semantics for owned data.

Production deletion behavior, recovery expectations, retention/legal review,
and privileged configuration are not verified by this local stage.

## Recent authentication and MFA readiness

`HumanPrincipal` carries the verified current-session ID, assurance level, and
latest non-refresh authentication-method timestamp from JWT claims when those
claims are bound to the same subject returned by `getUser()`. It never uses the
user-wide `last_sign_in_at` value for destructive authorization. Account
deletion requires a bounded recent sign-in and fails closed if the bound
session claims or authentication timestamp are absent or stale.
Identity linking, email change, future MFA management, billing, and future
credential management should also require fresh or higher-assurance proof.

Supabase AAL values are preserved as `aal1`, `aal2`, or `unknown`, which leaves
a clear enforcement point for future MFA. MFA enrollment, recovery, and
production policy are not enabled by the access architecture.

## Privacy and observability

ONE minimizes application profile data and does not duplicate OAuth profile
payloads without a product need. Bounded auth events record event name,
normalized outcome, optional safe reason, and optional correlation ID. They do
not record emails, passwords, OTPs, magic-link tokens, OAuth tokens, cookies,
session tokens, service-role keys, guest payloads, or sensitive profile data.

The device guest signal and any server admission pseudonym are not reused as a
human account identifier. Analytics must not use raw email, silently merge two
humans sharing a browser, or preserve an authenticated identity after logout or
deletion.

## PWA, mobile, and accessibility

The identity surface uses semantic labels, buttons, headings, status regions,
disabled/busy states, keyboard-operable controls, and existing responsive
styles. Auth does not depend on hover, pointer-only interaction, drag, audio,
or color alone.

The service worker excludes `/auth/*`, `/settings`, `/bench`, `/membership`,
all `/api/*`, token-like query parameters, authenticated headers, private or
`no-store` responses, and non-allowlisted navigations from shell caching. This
reduces post-logout and shared-device leakage; it does not replace production
testing on mobile browsers and installed PWAs.

## Capability verification matrix

| Capability | Level 1 | Level 2 repository evidence | Level 3 |
| --- | --- | --- | --- |
| Passwordless request | Yes | Boundary, validation, enumeration-safe response, and no-live-service tests; real delivery not exercised | No |
| OAuth | Config-gated client and callback boundary | Redirect/callback safety only; no provider flow | No |
| Callback handling | Yes | Deterministic redirect and replay/idempotency coverage | No |
| Session lifecycle | Yes | Principal-resolution and stale/malformed failure tests; full deployed lifecycle remains untested | No |
| Ownership isolation | Yes | USER_A/USER_B application and database tests are defined; use the handoff for the executed result | No |
| RLS | Yes | pgTAP coverage is defined; use the handoff for the disposable-database result | No |
| Guest migration | Yes | Bounded parsing, receipt, replay, account-switch, and database tests are defined | No |
| Logout | Yes | Deterministic state-boundary coverage is partial | No |
| Export | Yes | No-target, same-site, and ownership tests are defined; no deployed export | No |
| Deletion | Yes | Recent-auth, no-target, cascade, and fail-closed tests are defined; no real account deletion | No |
| Recent auth | Yes | Current-session subject/session binding, refresh exclusion, and ten-minute boundary tests | No |
| MFA readiness | Yes | Type/boundary review only | No |
| Mobile browser | Yes | Existing responsive semantics; stage browser result belongs in handoff | No |
| Installed PWA | Yes | Service-worker exclusion tests; live callback/resume remains unverified | No |

## Production activation gates

Before production authentication is enabled, an operator must separately
review and verify:

- ordered production migration application and RLS behavior;
- production Supabase URL and exact redirect allowlists;
- email provider, templates, delivery, anti-enumeration behavior, and recovery;
- approved OAuth clients, provider settings, PKCE/state behavior, denial, and
  identity collisions;
- public/publishable versus server-only/service-role configuration;
- cookie attributes, domain boundaries, CSP/XSS posture, and CSRF assumptions;
- edge/WAF and provider-native rate limits, alerting, and abuse response;
- mobile-browser and installed-PWA callbacks, refresh, resume, logout, and
  shared-device behavior;
- deletion retention, backup/recovery, privacy, and legal expectations;
- monitoring that contains no tokens, emails, or sensitive identity payloads.

No production authentication configuration or production migration is changed
by the repository architecture alone.

## Intentionally deferred

- organization/workspace identity, enterprise SSO, SCIM, and full RBAC;
- machine and agent principals;
- automatic account merging and end-user identity linking;
- production OAuth applications and provider verification;
- production email/SMS delivery and recovery operations;
- MFA enrollment/enforcement and recovery;
- billing, subscription, and provider-key management;
- production activation and production security verification.

# ONE human route-access model

## Purpose

Authentication does not justify protecting every page, and a hidden button is
not authorization. This model classifies human-facing routes by the authority
they require and defines the enforcement rule for future routes.

The classifications are architectural Level 1 evidence. Deterministic route,
ownership, and RLS tests supply Level 2 evidence only when the the access architecture handoff
records a passing run. No route is production-verified at Level 3 in this stage.

## Access classes

| Class | Meaning | Required enforcement |
| --- | --- | --- |
| PUBLIC | Safe for any caller and safe to publish | Input/visibility limits; no private projection |
| GUEST-ALLOWED | Works without an account and may use bounded device-local state | Guest must not receive account authority |
| AUTHENTICATED | Requires a valid human session | Server or RLS derives `auth.uid()`; client UI is not enough |
| OWNER-ONLY | Requires authentication plus ownership of the addressed resource | Server-derived owner and/or RLS; negative USER_A/USER_B tests |
| SENSITIVE / RECENT-AUTH | Destructive or identity-sensitive action | Verified principal, recent/higher assurance, explicit intent, no caller-selected target |
| SYSTEM-ONLY | Internal privileged operation | Server-only credential and independent administrator/system authorization |
| FUTURE ORGANIZATION-SCOPED | Would require organization membership and role | Not implemented; must not reuse human ID as organization authority |

## Current human-identity routes

| Route or surface | Class | Current behavior and authority |
| --- | --- | --- |
| Public Lab, learning, provider, methodology, and public evidence pages | PUBLIC / GUEST-ALLOWED | Exploration remains available without authentication; each underlying API retains its own visibility, trust, quota, and provider policy |
| `/settings` | GUEST-ALLOWED | Shows Guest Mode or the current account experience; UI state never grants data authority |
| `/membership` | PUBLIC | Explains boundaries; no payment or entitlement action is enabled by this stage |
| `/bench` | GUEST-ALLOWED page with authenticated content branch | The route is renderable to guests, but preview tracks render only for a server-resolved non-anonymous ONE human; all consequential actions retain their own policies |
| `POST /api/auth/passwordless` | GUEST-ALLOWED protocol entry | Same-site browser signal, 1 KB body, email schema, exact next-target enum, bounded process-local attempts, enumeration-safe response |
| `GET /auth/callback` | PUBLIC protocol endpoint | Exchanges an auth code and redirects only to exact same-origin allowlisted Settings targets; private/no-store response; callback does not accept an owner ID |
| `GET /api/providers/preferences` | GUEST-ALLOWED | Returns guest mode with no account preference data, or reads the verified human's account preferences |
| `PUT /api/providers/preferences` | AUTHENTICATED / OWNER-ONLY | Requires same-site browser request and a verified human; server derives the owner; database RLS provides defense in depth |
| `POST /api/account/claim-guest` | AUTHENTICATED / OWNER-ONLY | Same-site browser backstop binds the opaque guest receipt to `auth.uid()` before account state is exposed; no payload or owner ID is accepted; unavailable claims pause account entry |
| `POST /api/account/migrate-guest` | AUTHENTICATED / OWNER-ONLY | Requires same-site browser request, verified human, opaque guest-session receipt, strict payload, and database owner derivation |
| `GET /api/account/export` | AUTHENTICATED / OWNER-ONLY | Requires an explicit same-site browser signal and verified human; fixed projections use only the server-derived `humanId`; no target query/body field exists |
| `DELETE /api/account/delete` | SENSITIVE / RECENT-AUTH | Same-site browser request, exact confirmation, verified human, current-session-bound non-refresh authentication within ten minutes, server-only admin client, derived auth subject only |
| Direct browser access to `profiles`, `user_preferences`, `notification_preferences`, `user_notification_state`, and `saved_experiments` | AUTHENTICATED / OWNER-ONLY | The browser may submit an owner column, but RLS `USING`/`WITH CHECK` against `auth.uid()` is the authority |
| `private.guest_account_migrations` | SYSTEM-ONLY storage | No `anon` or `authenticated` table grants; only narrow authenticated RPCs can claim/import using `auth.uid()` |
| Existing `/api/admin/*` surfaces | SYSTEM-ONLY / existing admin policy | the access architecture does not broaden them; authentication alone must never confer administrator status |

## Canonical protected-route sequence

```text
request
  -> method, media type, body-size, and schema validation
  -> same-site/origin check when browser-only semantics apply
  -> cookie-bound server Supabase client
  -> resolveHumanIdentity()
  -> explicit route class and ownership/recent-auth decision
  -> RLS-constrained query or narrow server-only privileged operation
  -> bounded private no-store response
```

For a protected operation, `invalid-session` and `unavailable` are not guest
authority. They fail closed. A separate public/guest route can still function
when safe.

## Ownership rules

1. A protected route must not accept `user_id`, `owner_id`, `human_id`, or a
   target auth-subject ID as proof of authority.
2. If a resource ID is supplied, the server query must combine it with the
   verified owner or rely on reviewed RLS that performs the same check.
3. Direct browser database use is allowed only for tables with explicit grants,
   owner RLS, and negative cross-user tests.
4. A page-level signed-in branch is presentation, not authorization for its
   child APIs.
5. Authentication does not bypass trust tier, quota, provider enablement,
   budget, concurrency, benchmark visibility, or administrative policy.
6. Historical evidence with an unlinked owner is not automatically claimable by
   a newly authenticated human.

## Redirect and callback rules

- Callback destinations are exact same-origin paths, not general URLs.
- The current allowlist is `/settings` and `/settings#identity`.
- External origins, `//` destinations, backslashes, encoded slash/backslash,
  schemes, or unlisted query/hash combinations fall back to
  `/settings#identity`.
- Callback responses are private, no-store, and `Vary: Cookie`.
- Repeating a callback cannot cause duplicate guest import because claiming and
  migration are receipt-bound and idempotent.
- Production provider redirect allowlists remain separately configured and
  unverified.

## Response and caching rules

Human account responses must use `Cache-Control: private, no-store, max-age=0`
and vary on cookies. Raw Supabase errors, tokens, stack traces, account-sensitive
metadata, and service credentials must not be returned.

The service worker does not cache APIs, auth callbacks, Settings, Bench,
Membership, token-like query strings, private responses, or non-allowlisted
navigations. A stale UI is never proof that a session remains valid.

## Route review checklist

Before adding an identity-sensitive route:

1. Assign one access class.
2. Identify the resource owner and source of ownership truth.
3. Decide whether server verification, RLS, or both enforce it.
4. Remove caller-selectable owner authority.
5. Add same-site/CSRF protection if it is a browser-only mutation.
6. Add recent-auth or higher-assurance checks for destructive/identity actions.
7. Bound the body, response, pagination, and error projection.
8. Set private/no-store caching where identity affects output.
9. Add GUEST, USER_A, USER_B, stale-session, and malicious-redirect tests as
   applicable.
10. Confirm it does not weaken trust, quota, provider, budget, or benchmark
    visibility policies.

## Deferred route classes

No current route is organization-scoped or machine-principal authenticated.
Those future classes require explicit principals, scopes, ownership models, and
revocation; a caller label such as `source=agent` is not authentication.

# ONE Voice Lab trust and access

> Repository boundary: this document describes the progressive access design in
> the current working tree. A migration file, environment variable, or Vercel
> draft in Git does not prove that the corresponding remote control is active.
> Public live inference must remain off until the deployment checklist below is
> completed and verified.

## User value

Normal visitors should be able to learn, listen to curated samples, inspect
evidence, and run deterministic fixtures without interruption. Friction appears
only when a request can spend provider credits, create durable state, or shows
signals of abuse. Signing in increases a finite allowance; it never creates an
unlimited account.

## Threat model

The protected assets are provider credentials and credits, temporary realtime
tokens, Supabase sessions and service credentials, saved user data, raw audio and
transcripts, provider-account metadata, and the integrity of ONE evidence.

The main abuse paths are:

1. direct scripts calling browser-oriented provider routes;
2. many cheap accounts multiplying a per-user allowance;
3. rotating a client-controlled session value or address;
4. bursts distributed across serverless instances;
5. one expensive request consuming far more than one cheap request;
6. concurrent requests holding provider capacity or amplifying retries;
7. temporary realtime grants whose downstream provider traffic bypasses ONE;
8. stale preview or legacy deployments retaining a provider key;
9. direct Data API calls to a `security definer` function;
10. compromised authenticated users, trusted builders, or operator accounts.

Assumptions and explicit limits:

- An IP address is a coarse network signal, not a person. NAT, mobile networks,
  VPNs, IPv6 rotation, and shared workplaces create both collisions and churn.
- The opaque `one_lab_session` cookie is a bounded browser-session signal, not a
  device fingerprint and not proof of humanity. It contains no profile or usage
  data and is not readable by browser JavaScript.
- Same-origin checks reduce browser CSRF. They do not authenticate REST clients
  or prove that a human clicked a button.
- A signed-in wallet or email account proves control of that identity method,
  not reputation, payment, or humanity.
- In-process maps are only fast defense in depth. They reset on restart and do
  not coordinate every Vercel instance or region.
- A temporary provider token cannot be fully metered by ONE after the browser
  begins a direct provider session. The repository does not establish whether a
  Deepgram grant is single-session or safely replay-bounded, so hosted token
  issuance is disabled even when the legacy enable flag is present. Local
  operator use remains same-origin, finite-TTL, and rate-limited.

## Trust tiers

| Tier | How it is obtained | Intended access | Important boundary |
| --- | --- | --- | --- |
| Guest | No account | Public learning, samples, fixture evidence, very small explicitly enabled live allowance | IP/session/global limits; anonymous live stays off by default |
| Verified | Valid Supabase account | Larger finite allowance, own saved results/preferences, feedback and member Labs | Account creation is not proof of humanity; IP and global ceilings still apply |
| Trusted Builder | Explicitly earned and granted after useful, non-abusive use | Higher experiment limits and selected beta/programmatic capabilities | No self-promotion; a database operator controls the grant |
| Partner / Researcher | Explicit project grant | Controlled sponsored or research budget with larger quotas | Budget, provider, purpose, and expiry remain explicit |
| Admin | Internal grant only | Aggregate safety visibility and incident response | Not unlimited; no public tier-change or provider-key action exists |

Authenticated users default to `verified`. Higher tiers are rows in a private
trust-profile table and cannot be written through the public Data API. Tier and
status are read at request time from the database rather than copied into
user-editable metadata or treated as permanently fresh JWT claims.

`actor_kind` separately records `human`, `developer`, or `agent`. It supports
attribution and future policy differences without using User-Agent strings as
authority. An agent must eventually use an explicit, scoped machine identity;
anonymous automation does not become legitimate merely by declaring itself an
agent.

## Enforcement architecture

```text
request
  -> Vercel automatic DDoS + staged exact-path WAF burst rules
  -> Next route schema, body/size/timeout/same-site validation
  -> trusted edge address + opaque session -> HMAC pseudonyms
  -> durable Supabase admission transaction
       trust status / minimum tier
       operation-wide burst bucket using the endpoint policy
       session + IP + user daily/monthly counters
       cross-account IP signal
       global operation ceiling
       provider daily/monthly budget + emergency pause
       expiring provider concurrency lease
       sanitized audit decision
  -> process-local burst/duplicate guard
  -> fixed provider adapter with server-only key
  -> lease release in finally
```

All application decisions are structured and machine-readable. A denial returns
a safe code such as `tier_required`, `burst_limit_reached`,
`daily_limit_reached`, `monthly_limit_reached`,
`provider_budget_exhausted`, `concurrency_limit_reached`,
`challenge_required`, or `provider_paused`. HTTP 429 responses include
`Retry-After` and rate-limit metadata. Database, provider, credential, raw IP,
cookie, and internal error details are not returned.

The database policy is data-driven by tier, operation, provider scope, and exact
endpoint scope. Code supplies only validated context and conservative usage
units. The browser cannot select a higher tier, lower cost, provider budget, or
trusted identity.

## Usage and cost boundaries

The durable boundary supports:

- short burst windows;
- UTC daily and monthly units;
- per-session, per-IP, per-user, global, and per-provider dimensions;
- exact endpoint overrides;
- minimum tier per operation;
- provider emergency pause;
- expiring concurrency leases so a crashed function does not hold capacity
  forever;
- conservative units, allowing TTS characters or upload bytes to weigh more
  than a small catalog lookup in later adapters.

Speech-transcription units are whole trusted audio seconds. Before admission,
the server enforces the multipart and 10 MB file ceilings, validates MIME and
signature, then independently parses a canonical uncompressed PCM WAV
container. It verifies the RIFF length, PCM format fields, final data chunk,
sample alignment, and five-minute maximum; quota units are
`ceil(data bytes / byte rate)`. Client `duration_ms` values are ignored for
security and cost. MP3, M4A, FLAC, Ogg, WebM, AAC, malformed WAV, and other
unverifiable media fail before quota or provider dispatch. URL-based STT is
disabled because ONE cannot establish trusted duration before the provider
fetches the resource.

Saved-result allowances are enforced by the database trigger. A user-scoped
transaction advisory lock serializes the count and insert, so concurrent Data
API and browser inserts cannot race the tier allowance. This remains a database
rule rather than a client hint.

Feedback admission uses the same database-authoritative principle. The guarded
`submit_feedback` RPC takes a stable global transaction advisory lock before an
authenticated-user lock, re-reads the rolling one-hour counts, and inserts in
that transaction. This preserves the 300/hour global and 20/hour authenticated-
user invariants under concurrent requests. Limit exceptions use bounded,
machine-readable codes; the API maps them to a sanitized 429 response rather
than exposing SQL or connection details. Anonymous feedback remains subject to
the global invariant and the existing shared request policy.

Provider budgets are safety ceilings, not price claims. ONE does not estimate a
dollar value unless pricing metadata is versioned and verified. Provider account
hard limits and Vercel/AI Gateway spend controls remain necessary because an
application request count cannot perfectly predict provider billing.

Every provider-credential consumer must also honor the existing production
master switch, the narrower provider switch, adapter readiness, request schema,
timeout, response limit, and cancellation boundary. Disabling a provider or the
master switch leaves samples, fixtures, public evidence, and learning routes
available.

## Suspicious behavior and progressive friction

Risk signals are intentionally explainable: a missing session, a very new
account, repeated recent denials, or several accounts spending from the same IP
can increase a request's score. Raw IP addresses, full cookies, scripts, audio,
and transcripts are not written to the audit ledger.

No signal automatically promotes a user. High risk can require a challenge or
deny a costly request, while an administrator reviews only sanitized aggregates.
False positives remain possible, especially on shared networks.

Cloudflare Turnstile is appropriate at account creation/recovery and at an
interactive browser escalation—not on every page and not on public agent APIs.
When enabled, the token must be validated server-side with Siteverify, checked
for the expected hostname/action, and treated as single-use and five-minute
bounded. The widget alone is not enforcement. Supabase Auth has its own CAPTCHA
and token-bucket rate-limit configuration; configure those controls at Supabase
because direct Auth traffic does not pass through the ONE Vercel routes.

## Legitimate agents

The current official MCP/public action rail remains read-only or deterministic
and nonbillable. Paid browser routes are not automatically exposed to MCP merely
because an action or provider exists.

A future paid agent path requires all of the following:

- an explicit, revocable machine principal;
- a narrow action and provider allowlist;
- an `actor_kind=agent` trust profile;
- per-agent and project budgets;
- idempotency and bounded concurrency;
- audit attribution and expiry;
- no CAPTCHA dependency and no User-Agent-based trust;
- the same global/provider kill switches as browser calls.

## Audit and admin visibility

The private detailed audit ledger stores every allowed admission and a bounded
sample of denials. Denial detail is limited to one client/operation/reason sample
per hour and no more than 250 denial-detail rows globally per hour. Every denial
still increments a 15-minute aggregate keyed only by bounded operation,
provider, tier, actor, reason, and one of 256 pseudonymous client cohorts. The
aggregate preserves counts, first/last observation, maximum requested units,
maximum risk, and challenge count without one durable row per rejected request.
Raw IP, email, cookie, Authorization data, provider payloads, scripts, audio,
and transcripts are never stored.

Only an explicitly active `admin` can read the aggregate admin summary. The app
does not expose tier editing, provider-key management, quota resets, or arbitrary
audit-row access. Trust grants and provider-budget changes remain deliberate
database/operator actions with an external change record.

Detailed admission history is retained for 35 days. Denial aggregates are
retained for 90 days. The persistence-remediation migration extends the existing
owner-only `private.prune_lab_access_history()` function and reuses the existing
`one-lab-access-history-retention` job; it does not create a parallel cleanup
system. The job runs hourly at minute 23. Each cleanup path is limited to four
5,000-row batches per run, and a transaction advisory try-lock prevents
overlapping cron or operator runs.

The same lifecycle worker aggregates raw viewer events older than 30 days into
private daily event/surface/provider totals before deleting the exact source
batch, retains those aggregates for approximately 400 days, deletes feedback
older than 365 days without preserving message text in an aggregate, and prunes
current plus relevant legacy usage counters older than 120 days. The aggregate
table and maintenance function are owner-only with privileges revoked from
`public`, `anon`, and `authenticated`. The 120-day counter horizon is beyond all
active burst, daily, and monthly quota windows, so cleanup never removes a row
that can participate in a current admission decision.

Viewer admission also uses a stable database transaction advisory lock around
its rolling-hour global count and insert, making the 10,000/hour ceiling exact
under concurrency. The maintenance path can process up to 20,000 expired viewer
rows per hourly run, so normal cleanup capacity exceeds the maximum admitted
ingress. This does not replace cron-lag and oldest-row alerts: an outage or
operator pause can still create a backlog that needs controlled repeated runs.

If the cron job fails, denial aggregate upserts still prevent one detail row per
rejection, but all retention horizons stop advancing. Operators must alert on
cron status, oldest timestamps, and table growth. Admin denial totals use the
most recent 96 complete UTC 15-minute buckets, so they cover exactly 24 hours
with at most 15 minutes of reporting lag.
Recent-denial risk is intentionally based on sampled exact events; aggregate
counts provide incident volume and trends rather than unique-human identity.

## Persistence migration verification

The remediation is the single forward migration
`supabase/migrations/20260827153913_bounded_persistence_and_feedback_admission.sql`.
Historical migrations are not edited, and production rollback must also be
forward-only. If maintenance needs to pause, an operator should disable the
named cron job, preserve the private aggregates, diagnose the worker, and
deploy a reviewed corrective migration. Raw viewer events and feedback that
have passed their retention windows are intentionally not restorable by a down
migration.

This checkout cannot run the disposable database suite locally: the Supabase
CLI and `psql` are not installed, and the installed Docker Desktop daemon is not
available. Path B is therefore the repository's verification path: the
manual-only `.github/workflows/database-verification.yml` starts a disposable
local Supabase stack, applies the complete migration chain, runs pgTAP and real
feedback, saved-result, provider-budget, and global-quota concurrency coverage,
and stops without a backup. It has no automatic
trigger and uses no production credentials.

The workflow is currently **pending and unrun**. After these changes are
reviewed, committed, and pushed, an operator may trigger it explicitly with:

```powershell
gh workflow run database-verification.yml --ref main
```

Until that run succeeds, database-runtime behavior is unverified. The new
migration has not been applied to production, and no production Supabase,
Vercel, Cloudflare, Turnstile, or provider configuration was changed by this
remediation.

## Deployment checklist

### Supabase

1. Run and review the manual disposable-database verification workflow. Apply
   the ordered forward migrations to production only after the full migration,
   pgTAP, concurrency, grant, null-guard, and lifecycle checks pass. Do not edit
   applied migration history.
2. Confirm the server guard token is at least 32 random bytes and that its stored
   digest matches the Vercel secret.
3. Review the seeded operational-unit ceilings and deliberately set
   `private.lab_provider_budgets.enabled=true` only for providers and operations
   intended for live use. The migration defaults every provider budget to off.
4. Run RLS/security-definer adversarial tests as anonymous, authenticated,
   suspended, builder, partner, and admin principals.
5. Configure Auth email, OTP, Web3, and anonymous-user rate limits.
6. Disable unwanted account-creation paths. Magic-link sign-in in ONE no longer
   implicitly creates an account; account creation is a separate explicit flow.
7. Add managed Turnstile to account creation/recovery before opening cheap public
   signup at scale.
8. Verify the `one-lab-access-history-retention` cron job at minute 23, including
   30-day raw viewer aggregation, 400-day viewer-aggregate retention, 365-day
   feedback retention, 120-day counter cleanup, 35-day audit-detail retention,
   and 90-day denial-rollup retention. Alert on job failure, oldest retained
   timestamps, table growth, denial spikes, account clusters, provider budget
   use, and failed guard RPCs.

### Vercel

The current project receives Vercel's automatic DDoS protection, but the audit
found no published custom WAF rules. There is an unpublished log-only draft;
preserve and extend it rather than replacing it.

1. Extend the log rule to exact costly paths, including `/api/evaluate/run`,
   temporary token issuance, provider TTS/STT, Deepgram inference routes, AI,
   deliverables, and read-only account management.
2. Observe normal traffic for 24–72 hours, then test 429 enforcement in Preview
   before Production. Vercel rate counters are regional, so they are never a
   replacement for durable database budgets.
3. Suggested starting points: Evaluate 5 requests/minute/IP, token grants
   8/minute/IP, other paid operations 20/minute/IP, and public read-only agent
   endpoints 180/minute/IP only if abuse appears.
4. Enable deployment protection for preview/generated URLs and keep provider
   keys Production-only unless a protected branch has a scoped test key.
5. Configure firewall and spend alerts. Attack Mode is an incident control, not
   a normal product mode.

The legacy `deepgram-applied-voice-lab` project still has immutable deployment
URLs that return content even though its friendly alias redirects. Audit that
project's environment immediately, remove live flags and provider credentials,
rotate shared keys, and protect its deployments. Deleting the old project is a
separate destructive action and requires explicit approval.

### Cloudflare

Do not add a second CDN solely for rate limiting; native Vercel WAF is the
simpler current edge. If a future custom domain is proxied through Cloudflare,
use Vercel's verified-proxy path, establish one authoritative client-IP header,
avoid double challenges, and separately protect `.vercel.app` URLs because they
bypass the Cloudflare zone.

## Controls that protect credits most effectively

1. Atomic global and per-provider budgets plus emergency provider pauses before
   adapter dispatch.
2. Trust-tier quotas with shared IP/global ceilings, so account creation does
   not multiply the total budget.
3. Durable provider concurrency leases, bounded fan-out, hard timeouts, and no
   automatic retries.
4. Provider-dashboard hard spend/project limits and separate least-privilege
   keys per environment.
5. Exact-path Vercel WAF burst limits.
6. Turnstile and Supabase Auth rate limits at account-farm boundaries.
7. Sanitized audit visibility, alerts, and a rehearsed kill-switch runbook.

## Official operational references

- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase CI database testing](https://supabase.com/docs/guides/deployment/ci/testing)
- [Supabase local CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Vercel Firewall](https://vercel.com/docs/vercel-firewall)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel deployment protection](https://vercel.com/docs/deployment-protection)
- [Cloudflare Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

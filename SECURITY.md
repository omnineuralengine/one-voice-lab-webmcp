# Security

This document describes the current local baseline and the controls required before a future hosted reviewer deployment. It is an engineering boundary, not a compliance certification.

## Credential Boundary

`DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `FISH_AUDIO_API_KEY`, `CARTESIA_API_KEY`, and `RESON8_API_KEY` are permanent server-only credentials. Server routes and explicitly approved local verification tooling read the applicable value from the process environment only after non-secret safety gates pass. They must never:

- use a `NEXT_PUBLIC_` prefix;
- enter client props or browser bundles;
- appear in URLs, logs, inspectors, errors, exports, screenshots, or browser storage;
- be copied into `.env.example`, documentation, fixtures, or generated code;
- be returned by a local API route.

`.env.local` is ignored and is the normal local-development location. GitHub, handoff ZIPs, and SFTP packages contain placeholders only. Hosting secrets must be configured separately in the provider’s server-side secret store.

## Browser Credential Isolation

Local operator realtime workflows can obtain a short-lived credential through `/api/deepgram/token`. The permanent key stays on the server. The temporary credential is returned with no-store semantics, held in memory, used only for the intended realtime session, and excluded from inspectors, storage, URLs, and logs.

Temporary credentials remain sensitive. Expiry is defense in depth, not permission to expose them.

Hosted temporary-token issuance is disabled. Current repository evidence does not establish replay or downstream concurrency semantics strongly enough for ONE to meter a browser-to-provider session after grant issuance. The legacy enable flag cannot override the production/hosted denial; re-enablement requires current authoritative semantics plus a separate reviewed design.

## Human Authentication and Ownership

Supabase Auth is the human authenticator; it is not the complete application
identity or authorization model. Protected operations resolve a non-anonymous
human from the verified server session, derive ownership from that principal,
and enforce owner RLS or an equivalent server-side owner constraint. Browser
supplied user or owner IDs are never authorization.

The Supabase service-role credential is server-only and is used only through
reviewed narrow privileged operations. Account deletion targets only the auth
subject derived from the current verified session and requires explicit
confirmation plus a current-session non-refresh authentication method within
the recent-auth window. Guest migration binds an opaque receipt to the first
verified human before account state is exposed; it stores no guest payload and
cannot overwrite existing account preferences.

Auth callbacks, account APIs, and personalized pages are private/no-store and
excluded from the PWA cache. The service worker writes only explicit public
shell assets and Next static assets. See [Human Auth Architecture](docs/auth/HUMAN_AUTH_ARCHITECTURE.md)
and [Human Auth Threat Model](docs/auth/HUMAN_AUTH_THREAT_MODEL.md).

## Request Allowlisting

API Studio and module routes resolve operations from typed registries and fixed local endpoints. Browser input may not choose an arbitrary upstream host, URL, method, path, or Authorization header. Server policy validates operation, region, content type, body/query shape, upload size, response size, timeout, and supported execution mode.

The application must not become an unrestricted authenticated proxy.

Provider execution uses capability-specific server adapters. The Provider Registry contains safe metadata and environment-variable names only. Unknown providers, Planned providers, disabled providers, and providers without the requested adapter fail before any provider request. Configuration responses expose booleans only; they must never include a credential fragment, fingerprint, length, prefix, or suffix.

## Management Restrictions

Account-changing project, key, member, invitation, billing, or other management mutations are locked by design. Optional management access is read-only, narrowly allowlisted, and kept out of the default reviewer path. Project identifiers remain server-side behind local handles where implemented.

## Upload and Input Limits

Upload Audio validates extension, MIME type, signature, readability, and size in the browser and revalidates on the server. Paid STT admission is narrower: at most 10 MB and five minutes, canonical uncompressed PCM WAV only, with duration derived server-side from validated RIFF/PCM structure. Client duration metadata is not authoritative. Unsupported or malformed media and all URL-based STT fail before quota, concurrency, or provider dispatch. Other modules retain their existing operation-specific bounds. Text, session duration, concurrent runs, and retries are bounded at their owning module.

Selection, preview, configuration handoff, fixture loading, tour navigation, and microphone device listing must not trigger a provider request.

## Audio and Transcript Retention

Raw microphone audio is not persisted. Uploads and offline variants remain in memory for the active workflow. Generated TTS bytes use short-lived server/browser handoff and are removed/revoked after use. Inspectors record metadata such as type and byte size, not binary audio.

Transcript persistence is off by default where the feature supports history. Any transcript retention or export requires a separate explicit choice and warning. Logs, tracing, analytics, agent memory, and downstream data stores require the same governance review as the primary transcript store.

**Transcript redaction does not alter the underlying audio.** Audio access, retention, deletion, replay, and export are separate controls.

## Evaluate Workspace

Evaluate defaults to deterministic fixture execution. Fixture mode cannot invoke a provider and must remain usable while every live switch is off. Protected live TTS comparison requires all of the following before adapter dispatch:

- same-site validated input and an explicit paid-call confirmation;
- `ONE_LIVE_EVALS_ENABLED=true`;
- `ONE_LIVE_LAB_ENABLED=true` in production;
- a registered, adapter-backed, configured provider with its provider-specific switch enabled;
- durable Supabase-backed access and spend protection;
- member access by default, or a separately enabled durable anonymous policy with a configured guard token;
- bounded text, provider count, concurrency, response bytes, per-provider timeout, and caller cancellation.

Process-local request limits are defense in depth and are not sufficient protection for unrestricted anonymous paid calls across hosted instances. Public anonymous live evaluation remains disabled by default.

Local-live is a loopback-only operator workflow. The standard development command binds to `127.0.0.1`; do not expose a credentialed local-live server on a LAN or public interface without a separate operator authorization control.

Each provider result is independent. Failed, timed-out, unavailable, and cancelled results must preserve already completed evidence. Provider responses are normalized through strict allowlists; arbitrary provider configuration, URLs, headers, reference audio, and voice-cloning input are rejected.

Evaluate evidence is private and ephemeral by default. JSON export uses a strict versioned allowlist, omits raw audio and provider payloads, and rejects credential-shaped keys or values. Re-import is UTF-8 JSON only, size-bounded, schema-validated, and non-executing. Scripts, audio, human ratings, and raw traces must not enter product analytics, logs, or public evidence without a separate explicit consent and retention design.

## Progressive Trust and Access

The application policy recognizes `guest`, `verified`, `trusted_builder`, `partner_researcher`, and `admin`. A valid Supabase account defaults to `verified`; higher tiers are explicit private database grants, not user-editable profile metadata or wallet/payment status. Every tier remains finite.

Production provider calls must receive a server-side durable admission decision before adapter dispatch. The decision combines user, pseudonymous client, opaque session, endpoint, operation, global, and provider-budget ceilings. Paid provider work also obtains an expiring distributed concurrency lease. Process-local burst maps remain defense in depth only.

The `one_lab_session` cookie is HttpOnly, SameSite Lax, and opaque. It is a coarse session signal, not a device fingerprint or proof of humanity. Client addresses are likewise coarse; direct Vercel deployments use the platform-owned forwarding header, and arbitrary forwarded headers must not become trusted unless a verified reverse proxy overwrites them.

The progressive-access migration is a required deployment step, not proof of remote state. It hardens guarded security-definer RPCs against null guard tokens, keeps trust/audit tables private, bounds denial detail with aggregate retention, serializes saved-result quotas per user, and exposes only narrow server-brokered functions. Public live provider use must remain disabled if that migration, its retention job, the matching guard secret, or the durable quota RPC cannot be verified. See [Trust and Access](docs/TRUST_AND_ACCESS.md) for the threat model and deployment checklist.

## Redaction Scope

Redaction policies use a verified entity registry, compatibility checks, and repeated query serialization. Deterministic fixtures are fictional. Policy selection and handoff do not execute requests.

Redaction may have false positives, false negatives, and interim/final differences. Unredacted interim events must not be persisted by default. A profile is not a certification of HIPAA, PCI DSS, GDPR, CPRA, or any other framework.

## Consent and Trusted Voice

Trusted Voice uses approved synthetic Aura voices and does not enroll or replicate a person’s voice. The server revalidates scenario risk, disclosure, consent confirmations, fallback, opt-out, sensitive-detail policy, and text length before generation. The browser gate is a usability control, not the trust boundary.

Full payment-card numbers and authentication codes are blocked. Other sensitive-detail detection is heuristic and requires human template review. Loading a scenario, unlocking a session, or opening a tour never calls Deepgram or autoplays audio.

## Diagnostics Sanitization

Browser responses, raw-event views, Payload Inspectors, traces, saved experiments, provider manifests, and generated artifacts must exclude:

- permanent and temporary credentials;
- Authorization and cookie values;
- raw audio and generated audio bytes;
- unapproved transcript text;
- sensitive recipient/customer fields;
- local filesystem usernames and private URLs.

Sanitization should fail closed when a high-confidence credential remains. Provenance labels must distinguish live/measured, derived, fixture/simulated, conceptual, unavailable, and manual-verification evidence.

## Local and Hosted Boundaries

The local runtime is the full operator-controlled lab. A future hosted reviewer runtime must be narrower: protected reviewer session, operation allowlist, quotas/cooldowns, time and size limits, one-concurrent-action policy, server-only permanent key, temporary browser credentials, no management mutations, no raw-audio persistence, no unredacted-transcript persistence, and a global live kill switch.

Current hosted-aware size limits, provider switches, in-memory request guards, and Familiar Care session controls are partial scaffolding, not the complete hosted reviewer experience. In particular, a provider switch is not owner authentication or a durable billing quota. The ElevenLabs prototype therefore always denies execution while `OPEN_LAB_MODE=true` until those controls exist.

**The future hosted reviewer experience must not rely on remaining account credit as its primary abuse control.** Account credit does not replace authentication, authorization, quotas, allowlisting, timeouts, concurrency limits, or a kill switch.

## Hosted Kill-Switch Plan

Every hosted live route and token grant must check one server-authoritative global switch before provider credential use. Disabling the switch must deny live execution while leaving public education, fixtures, and documentation usable. The switch should be reversible without a code deploy, logged without secrets, and included in preview verification.

## Responsible Disclosure

Do not open a public issue containing credentials, private audio, transcripts, account identifiers, or exploit details. Report a suspected vulnerability privately to the repository owner through an approved private GitHub contact channel. A dedicated security contact address has not yet been assigned.

## Human Review Boundary

This repository does not establish legal, medical, financial, privacy, accessibility, security, or regulatory compliance. Production templates, consent/revocation, data retention, access control, incident response, delivery channels, and vendor/account configuration require review by the responsible organization and qualified specialists.

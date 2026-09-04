# ONE guest-to-account migration

## Purpose

Guest Mode preserves local agency. Signing in should not discard legitimate
guest work, but it must also never copy arbitrary browser state, overwrite an
account, duplicate imports, or leak one person's state to another person using
the same device.

the access architecture therefore implements an explicit, bounded import. The migration is
architecturally established at Level 1. Deterministic TypeScript and disposable
database tests provide Level 2 evidence only when their passing execution is
recorded in the the access architecture handoff. No migration behavior is Level 3 production
verified.

## Eligible state

The versioned schema is `one-guest-state/1.0.0` and permits only:

| State | Limit | Import behavior |
| --- | --- | --- |
| Theme | One strict record | Inserted only when the account lacks preferences |
| Lab default-module preference | One strict record | Combined into the first preference insert |
| Notification preferences | One strict record | Inserted only when the account lacks a row |
| Provider-presentation preferences | Canonical bounded provider-preference schema | Combined into the first preference insert |
| Known notification read IDs | At most 100 UUIDs | Only IDs present in `lab_updates`; additive and conflict-safe |
| Synthetic saved simulations | At most 12 | Added once, subject to the existing maximum of 25 account experiments |

The browser collector rejects invalid records rather than repairing arbitrary
objects. Unknown or extra fields fail strict schemas for the affected record.
The server route accepts at most 160 KB, validates the same schema, and the
database repeats structural and size validation.

## Never migrated implicitly

- provider credentials, authentication tokens, cookies, wallet secrets, or
  environment values;
- raw audio, microphone data, transcripts, prompts, customer cases, or private
  benchmark artifacts;
- arbitrary localStorage/sessionStorage/IndexedDB keys;
- analytics identity or browser history;
- provider request/response payloads;
- unverified experiment formats or unknown update IDs;
- ownership of historical or unattributed server records.

## Identity and receipt model

ONE's opaque `one_lab_session` is a 32-character HttpOnly browser-session
signal. It is not human identity. Server code validates it and derives a stable
SHA-256 guest receipt key with a versioned domain separator. The raw cookie is
not stored in the migration ledger.

The private `guest_account_migrations` table stores:

- the guest receipt hash;
- the authenticated `user_id` derived from `auth.uid()`;
- migration schema version and claimed/completed status;
- a digest of the validated payload after completion;
- bounded counts/booleans describing what was imported;
- claim and completion timestamps.

It stores no guest payload, email, token, transcript, or audio. Browser roles
have no direct table privileges. The narrow RPCs are executable only by the
authenticated database role, explicitly reject JWTs marked anonymous, and
accept no owner parameter.

## Flow

```text
Guest uses ONE
  -> eligible state stays in bounded local storage
  -> proxy supplies opaque HttpOnly Lab session

Human authenticates
  -> callback exchanges the Supabase code where applicable
  -> callback and authenticated browser-transition backstop derive the guest receipt server-side
  -> database atomically binds it to auth.uid()
  -> account state is exposed only after the claim succeeds
  -> callback reports that an import is available where applicable

Human explicitly chooses Import
  -> browser collects only the versioned allowlist
  -> same-site account route verifies the human again
  -> database validates and imports transactionally
  -> account rows already present win
  -> completed receipt prevents replay
  -> browser clears only migration-eligible local keys after acknowledgement
```

The claim does not transfer the payload. It reserves the device guest receipt
for the first authenticated human so a later account on that browser cannot
import it. The idempotent `/api/account/claim-guest` backstop runs for every
verified browser auth transition, including immediate password and wallet
sessions that do not traverse the callback. An unavailable claim pauses account
entry and signs out locally rather than leaving the receipt unowned.

## Idempotency and concurrency

- `guest_key_hash` is globally unique.
- A transaction advisory lock serializes claim/import for that receipt.
- Repeating a pending claim returns `claimed`.
- Repeating a completed import returns `already-migrated` and the recorded
  bounded counts; it does not insert again.
- A different authenticated human receives `claimed-by-another-account`.
- Each account can claim at most sixteen guest-device receipts.
- All database writes and receipt completion occur in one transaction. A
  validation or write failure rolls back partial state.

This makes refresh during callback, callback replay, retry after a network
failure, or concurrent duplicate submission safe at the database boundary.

## Precedence and merge rules

Existing account preference and notification-preference rows always win; the
migration uses conflict-do-nothing rather than overwriting. Notification read
state is a set-like additive merge. Validated synthetic experiments are appended
only on the first completed import and only until the account's bounded quota is
reached.

Guest data never silently overwrites authenticated state. The UI describes the
scope and requires an explicit import action.

## Same-device account switching

When a session changes, account-derived theme and notification state are reset
before the new human's data loads. Signed-in preference changes are not written
into the shared guest keys. On logout, account-derived in-memory state is
discarded and Guest Mode reloads only guest-safe local state.

If USER_B attempts to import a receipt already claimed by USER_A, the server
returns a bounded conflict. The browser clears only the eligible guest keys so
USER_B cannot repeatedly see or import USER_A's prior guest snapshot. It does
not clear unrelated device-local application state.

## Failure behavior

| Failure | Behavior |
| --- | --- |
| No valid authenticated session | 401 or bounded unavailable result; no import |
| Auth service unavailable | Fail closed; local copy remains |
| Missing/invalid opaque guest session | 409; no ownership guess |
| Invalid/corrupt/oversized local state | 400 or locally skipped; no partial receipt/import |
| Receipt belongs to another account | 409; eligible local snapshot cleared by the UI to prevent leakage |
| Account device-import limit reached | 409; no import |
| Database/provider unavailable | Bounded 503; local copy remains for retry |
| Repeated completed submission | Successful `already-migrated`; no duplicate rows |

No failure silently downgrades an authenticated owner operation to guest
authority.

## Privacy and observability

Migration events record only a normalized event name, outcome, and bounded
reason. They do not log the email, guest hash, raw cookie, payload, experiment
content, or auth token. The private receipt exists to provide ownership and
idempotency, not analytics identity.

Deleting the auth user cascades the migration receipt and cascade-owned account
rows. Other operational or historical records retain their existing schema and
retention behavior; guest migration does not claim or relabel them.

## Verification cases

The repository defines deterministic coverage for:

- strict allowlist collection and corrupted local records;
- stable receipt hashing and malformed guest IDs;
- first claim/import and repeated callback claim;
- completed replay without duplication;
- existing account preference precedence;
- USER_B denial for USER_A's receipt;
- cross-user RLS read, update, and delete denial;
- bounded read-state and synthetic-experiment import;
- receipt privacy, grants, empty function search path, and owner derivation;
- auth-user deletion cascading owned rows and migration receipt;
- same-site route enforcement and no caller-supplied owner target;
- service-worker exclusion of auth/account-sensitive content.

The the access architecture handoff is the source for the actual executed test counts and local
database result. Test definitions alone are not production evidence.

## Production activation gates

Before relying on migration in production:

1. Apply the reviewed forward migration through the authorized production
   process; do not rewrite migration history.
2. Re-run RLS, grants, USER_A/USER_B, replay, transaction, and deletion tests
   against a disposable environment matching production versions.
3. Verify callback cookie/domain behavior on each production domain and PWA.
4. Verify old service workers are replaced and account-sensitive responses are
   never cached.
5. Add monitoring for normalized migration failures and claim-limit abuse
   without recording payloads or human identifiers.
6. Review retention, deletion, backup/recovery, and privacy expectations.

the access architecture performs none of those production actions.

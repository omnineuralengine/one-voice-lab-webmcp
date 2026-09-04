# Hosted Feature Matrix

Verification date: **2026-08-14**

This matrix describes the current environment-controlled public **Open Lab** on this branch. It is distinct from older, separately curated `hosted-review` showroom material. The repository does not document or prove a deployment URL. A build on `main` does not prove deployed environment values, account entitlement, provider availability, or live-provider results.

`OPEN_LAB_MODE=true` explicitly selects the public lab even when the hosting platform sets `VERCEL=1`; the older hosted-review presentation gate remains active only when Open Lab is off.

## Runtime modes

| Configuration | Visitor experience | Live-provider behavior |
|---|---|---|
| `OPEN_LAB_MODE=true`, `OPEN_LAB_DEEPGRAM_ENABLED=true`, server key configured | Public navigation, no login, no personal key, persistent shared-project/privacy disclosure | Explicit, allowlisted inference requests are available; account/Management data remains blocked |
| `OPEN_LAB_MODE=true`, provider switch absent/false | Same public navigation and disclosure | Fails closed; synthetic/local/educational flows remain usable |
| `OPEN_LAB_MODE=false` | Existing local/full Lab behavior | Existing server configuration and route policy apply |

`OPEN_LAB_MODE` and `OPEN_LAB_DEEPGRAM_ENABLED` contain no credentials. `DEEPGRAM_API_KEY` remains server-only. No browser variable, cookie, inspector, trace, or example receives it.

## Open Lab surface

### Flux Conversation Observatory

If `/flux-observatory` is deliberately included in a hosted-review branch,
Synthetic Replay remains the reviewer-safe path and is always labeled as a
fixture. The same-origin token route denies live browser credentials in hosted
and production modes; the legacy `DEEPGRAM_BROWSER_REALTIME_ENABLED` flag
cannot override that boundary. Selecting Live Provider Mode or a
keyboard companion command cannot bypass the visible microphone confirmation, the
separate provider-start action, or that server-side gate. No hosted deployment
or live-provider validation is claimed by repository implementation alone.

There is no separate Upload-specific live-action unlock in the current application. This change does not introduce or bypass one: the visible Transcribe action remains the only execution trigger, and existing server-side credential/policy gates remain authoritative.

### Public Open Lab capabilities

| Capability | Public behavior | Boundary |
|---|---|---|
| Landing and module navigation | Public | No sign-in or visitor key entry |
| Guided recipes | Public | Navigate only; never auto-trigger billable work |
| URL/file STT | PCM WAV upload only when live gates are deliberately enabled | URL STT disabled; server-derived duration, 10 MB/five-minute cap, quota and provider budgets before dispatch |
| Live Mic / realtime STT | Fixture/local operator only | Hosted temporary-token issuance disabled pending verified replay/concurrency semantics |
| Aura TTS | Explicit Generate | Existing `/v1/speak` route remains intact |
| Flux batch TTS | Explicit Generate or A/B Compare | `/v2/speak`, 35-model policy allowlist, documented formats, playback/download, sanitized inspection |
| Flux streaming | Disabled | Experimental - deployed authentication/audio verification required |
| Voice Agent console | Explicit connection | Temporary-token prototype; mocked tests are not live proof |
| Synthetic/local labs | Available even when provider is off | No provider call until a destination's explicit action |
| API Lab | Public registry and guarded operations | No arbitrary upstream URL; public account-data families denied |
| Live Observatory account/Management reads | Unavailable publicly | Project IDs, usage, request cost, and balances remain private |
| Management mutation | Unavailable | No key/project/billing/account write plane |
| Familiar Care | Public consent-first educational flow; optional explicit preview | Consent/disclosure/risk/text policy remains; Open Lab does not make it production care software |
| Provider Rolodex | Safe provider metadata only | Credential values, customer files, and internal-only artifacts stay excluded |
| Pocket and semantic control | Public navigation/companion surfaces | Only bounded UI preferences persist; semantic commands do not silently execute provider work |
| Lab Evolution | Public engineering-notebook module and module affordances | Repository-controlled structured data only; no provider request, commit, push, merge, or deployment action |

### Lab Evolution delivery boundary

Lab Evolution shows the current `Human intent -> Codex -> working tree -> Git commit -> GitHub -> Vercel -> live Lab -> evidence -> next iteration` architecture. GitHub remains canonical source control, and Vercel remains deployment infrastructure. **Experimental idea:** Entire is a parallel observational context layer with no claimed checkpoint; it cannot replace GitHub or change hosted deployment behavior.

**Repository verified (2026-08-14):** final local post-feature tests passed, including 30/30 Open Lab checks and the cross-timezone `PayloadInspector` hydration regression. The Next.js 16.2.11 build, 379-file source/browser secret audit, zero exact configured key-value occurrences in `.next/static` and scanned `.next` text, and diff check also passed. Hydration-fix commit `24f1340` was pushed, draft PR #4 exists, and Vercel deployment `dpl_GQ4F4ggae6Tnf3xGZmciUxEx4pZF` reached Ready. Clean-session Overview desktop plus Lab Evolution and Flux at 390px showed correct Open Lab disclosure, contained widths, no error overlay, and no captured page/console errors. This is preview evidence, not production deployment or live-provider proof. The bounded Flux Cole/Jack attempt returned authorization failures and no audio. **Experimental idea:** no Entire checkpoint was created because the Entire CLI was unavailable.

## Audio and data boundaries

| Action | Behavior |
|---|---|
| Select/drop/preview audio | Browser-local; no automatic provider submission |
| Explicit Transcribe | Server-mediated request after validation and kill-switch check |
| Raw audio persistence | Off by design; tracks/object URLs are cleaned up |
| Trace/export | Sanitized; no permanent key, temporary JWT, Authorization, cookie, env value, unapproved mic audio, or confidential input |
| Open Lab disclosure | “Shared live Deepgram project” and “Do not submit confidential or regulated information”; no guessed balance |

## Provider and maturity status

Current official Flux documentation was rechecked on 2026-08-14. It lists 36 English voices; the repository executes 35 because explicit Lab policy excludes documented `flux-conor-en`, and it does not register stale `flux-renee-en`. The visible “Early Access” label is Lab maturity. Current provider docs do not supply that lifecycle label, and the Lab does not claim GA.

This remains a community-built learning/prototype environment, not an official Deepgram product, production-certified service, or Deepgram roadmap.

# ONE Voice Lab

Verification date: **2026-08-25**

ONE Voice Lab is the application identity under **Omni Neural Engine**. It is an independent, community-built, provider-flexible laboratory for voice, agents, simulation, and human-controlled AI systems. It is not an official Deepgram, ElevenLabs, Supabase, or other provider product. Deepgram remains the Featured Provider and its SDK, API, model, capability, documentation-evidence, SDK Doctor, and credential boundaries remain provider-specific.

## Repository verified

### Identity and theme

- Application metadata, navigation, home hero, JSON-LD, public evidence name, PWA manifest, semantic control label, and generated deliverable creator identify **ONE Voice Lab · Omni Neural Engine**.
- The original ONE mark is project-authored SVG/CSS. No provider logo is repurposed as the application brand.
- Default runtime theme values are `#9966CC` and `#009966`. Zod accepts normalized six-digit hex values only; values become a bounded set of CSS custom properties rather than arbitrary CSS.
- Guest theme preferences use `one:guest:theme:v1`. Reset, swap, appearance, reduced motion, live preview, and an accessible foreground fallback are implemented.
- Deepgram, ElevenLabs, and Fish Audio remain visible where they identify real provider-specific code or evidence. No capability parity is inferred.

### Guest and optional identity architecture

```text
Guest (actual unauthenticated browser)
        ↓ optional explicit sign-in
ONE Identity
        ↓
Supabase Auth
        ↓
Profile + Preferences + Notification State + Explicitly Saved Experiments
```

Guest Mode is first-class. Loading the application never creates an anonymous Supabase user. When public Supabase configuration is absent, the browser client is not created, the session proxy returns normally, and local Lab functionality continues without a failed-network loop.

The implemented auth surface includes email/password, email magic link, configured OAuth providers, official Supabase Ethereum `signInWithWeb3`, named EIP-6963 wallet discovery, an optional tap-loaded WalletConnect transport, logout, and supported OAuth identity-linking calls. Provider buttons appear only behind explicit public configuration switches. Wallet signing is authentication only: ONE never asks for or stores a seed phrase/private key, requests a transaction or token approval, or inspects balances, tokens, NFTs, or transaction history.

The guest-to-account flow is explicit: local preferences remain local until the human chooses a sync action. Existing cloud preferences load as authoritative. Sensitive local Lab state is not migrated.

### Persistence boundary

Cloud scope is deliberately limited to identity/profile, theme and bounded Lab preferences, notification preferences/read state, and explicitly saved sanitized Simulation Lab experiments. Raw microphone audio, uploaded audio, provider credentials, temporary tokens, private customer cases, transcripts, pasted code, raw logs, and arbitrary existing Lab state are not added to Supabase by this feature.

The migration `supabase/migrations/20260825190225_one_identity_personalization.sql` defines `profiles`, `user_preferences`, `notification_preferences`, `lab_updates`, `user_notification_state`, and `saved_experiments`. Every user-owned table enables RLS with ownership predicates and both `USING` and `WITH CHECK` for updates. Global update writes are not granted to normal users. Public reads are limited to records that are explicitly public and published.

### Simulation Lab

- `/simulation-lab` is the primary Experimental route; `/simulations` remains backward compatible.
- It reuses the existing typed scenario registry and deterministic replay engine. It does not duplicate or replace Architecture Studio's deterministic failure engine.
- Six synthetic architecture templates are available: Browser Voice Assistant, Contact Center Agent, Drive-Thru Voice Agent, Customer Support Assistant, Tool-Using Voice Agent, and Blank Experiment.
- `Target Speaker vs. The World` remains the only implemented deterministic replay. Planned scenarios are visible but non-executable.
- A run requires explicit confirmation and exposes `simulated` provenance, a stage timeline, propagation consequences, a bounded scorecard, two-run comparison, local usage facts, and safe JSON export.
- Guest save is bounded and local. Account save is a separate explicit RLS-protected insert.
- Viewing or running the deterministic Simulation Lab makes no Deepgram, ElevenLabs, LLM, TTS, microphone, upload, or external tool request.

### Notifications and preferences

- `/settings` is the ONE Preference Center for Appearance, Lab Experience, Notifications, Identity, and Privacy.
- The header exposes Guest / Save & personalize state and a small in-app What's New center.
- Initial update records are ONE-authored Lab changes, not fabricated provider announcements.
- Email notification choice is a stored preference only. No mail delivery provider is implemented or claimed.
- Logout clears account-scoped client state and restores legitimate guest-local state.

## Configuration required

Only names and non-secret capability switches belong in repository documentation:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_ONE_AUTH_GOOGLE_ENABLED
NEXT_PUBLIC_ONE_AUTH_GITHUB_ENABLED
NEXT_PUBLIC_ONE_AUTH_APPLE_ENABLED
NEXT_PUBLIC_ONE_AUTH_MICROSOFT_ENABLED
NEXT_PUBLIC_ONE_AUTH_WEB3_ENABLED
NEXT_PUBLIC_ONE_AUTH_WALLETCONNECT_ENABLED
NEXT_PUBLIC_ONE_WALLETCONNECT_PROJECT_ID
```

`SUPABASE_SERVICE_ROLE_KEY` remains an existing server-only Architecture Studio variable and is not used by the ONE browser identity client. OAuth client secrets, Supabase secret/service-role keys, database passwords, wallet secrets, provider keys, and session tokens must never use `NEXT_PUBLIC_` or enter the repository.

External configuration still requires exact callback/signing URLs, each desired OAuth provider, Web3 enablement, strict Web3 rate limits and CAPTCHA, a domain-allowlisted Reown project for WalletConnect, and applying the checked-in migrations. The WalletConnect project ID is public configuration; wallet secrets never belong in an environment variable. A configured button is not proof of a successful production sign-in.

## Current status

| Surface | Status | Evidence boundary |
| --- | --- | --- |
| ONE application identity and default theme | Working | Repository verified; provider identities retained |
| Guest theme and preferences | Working | Repository and browser verified; device-local |
| Simulation Lab deterministic replay | Experimental working prototype | Repository verified; synthetic only |
| Local saved simulations | Working | Repository verified; bounded browser storage |
| Supabase client/session architecture | Configured but unverified externally | Current SSR pattern and code verified; remote schema/auth flow not yet proven |
| Migration and RLS policy definitions | Repository verified | Remote application and adversarial multi-user RLS test still required |
| Email/password and magic-link UI | Configured but unverified externally | Requires Supabase URL/key and email configuration |
| Google/GitHub/Apple/Microsoft OAuth | Configuration required | Explicit OAuth buttons remain hidden until the corresponding provider and switch are enabled; true Google One Tap is not claimed |
| Ethereum / MetaMask-compatible auth | Configuration required | Named EIP-6963 discovery and official Supabase flow implemented; hosted provider and browser flow unverified |
| WalletConnect auth transport | Repository implemented, configuration required | Click-loaded EIP-1193 provider; requires protected Supabase Web3 plus an origin-allowlisted Reown project |
| Membership payments / USDC | Not enabled | `/membership` documents the boundary; no payment integration, checkout route, ledger, Buy button, or entitlement mutation exists |
| Solana wallet auth | Not implemented | Possible future extension; no UI claim |
| Email notification delivery | Not implemented | Preference storage only |
| Provider adapters | Deepgram Working; ElevenLabs and Fish Audio Partial | Unequal evidence-backed states; Fish Audio live use is configuration-required |

## Verification

- `npm run lint -- --quiet`: passed.
- `npm run typecheck`: passed.
- ONE/Voice Open unit suite: 11 passed.
- ONE/Voice Open browser suite: 6 passed, including Guest Mode, theme persistence, Simulation Lab, explicit run confirmation, local save, keyboard, and mobile containment.
- `npm run test:unit`: 438 passed.
- Focused regression suites passed: Architecture Studio 44, Pocket 23 executed / 21 intentional matrix skips, semantic control 28, Agent Rail 14, providers 31, keyboard 7, upload 4, Familiar Care 5, Language Workbench 4, and Redaction Lab 5.
- `npm run build`: passed with 36 generated application pages and the optional session proxy.
- `npm run audit:secrets`: passed across 486 source and browser-asset files.
- Browser verification returned HTTP 200 with no console error or Next.js error overlay for `/`, `/simulation-lab`, and `/settings`.
- `npm audit` reports two pre-existing high-severity denial-of-service advisories in `image-size@1.2.1` through `pptxgenjs@4.0.1`. The package path was not introduced by this feature; no compatible published upstream fix exists as of the verification date. Presentation generation accepts Lab-generated image material rather than arbitrary ICNS/JXL/HEIF uploads, reducing reachability but not removing the vulnerable dependency.

## Manual/external work

- The existing Supabase project `one` was discoverable and reported active, but database inspection timed out repeatedly. The migration was therefore not applied blindly and no remote RLS/auth claim is made.
- Configure the two public Supabase values in Vercel only after the migration is reviewed/applied.
- Configure OAuth/Web3 providers and exact allowed callback/signing URLs in Supabase before enabling their corresponding public switches.
- Configure Web3 CAPTCHA and strict rate limits, then create and domain-allowlist a Reown project before enabling WalletConnect.
- Validate email delivery, provider OAuth consent, MetaMask/EIP-6963 behavior, WalletConnect QR/mobile cancellation and cleanup, account linking, cross-user RLS isolation, and logout on the intended hosted origin.

## Claim ledger

- **Repository verified:** identity, theme validation, Guest Mode, Simulation Lab replay/local save, optional Supabase code boundary, migration/RLS definitions, notification UI, and provider-specific terminology preservation.
- **Documentation verified:** the integration uses current Supabase SSR, PKCE callback, identity-linking, and `signInWithWeb3` patterns retrieved during this implementation.
- **Assumption:** the existing Supabase project is the intended production identity project; the project name alone does not prove deployment linkage.
- **Experimental:** Simulation Lab results and Web3 identity architecture are not production performance or real-world identity evidence.

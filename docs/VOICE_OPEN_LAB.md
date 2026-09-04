# Voice Open Lab

> Historical checkpoint: the current application identity is **ONE Voice Lab** under **Omni Neural Engine**. See [ONE Voice Lab](ONE_VOICE_LAB.md). The evidence below records the preceding Voice Open Lab consolidation and is retained rather than rewritten.

Verification date: **2026-08-20**

Voice Open Lab is the provider-extensible evolution of the Deepgram Learning Lab. It keeps the existing local-first modules and evidence controls while moving their complexity behind four public areas:

- **Try:** Talk, Upload, Generate, and Agent.
- **Simulate:** controlled Voice AI scenario definitions and deterministic replay.
- **Build:** API, architecture, language, audio, SDK, and solution-engineering tools.
- **Learn:** pipeline, evaluation, capability, privacy, language, and failure-recovery explanations.

The project is independent and community-built. It is not an official Deepgram, ElevenLabs, or Fish Audio product, partnership, endorsement, or roadmap. Deepgram is the **Featured Provider** and deepest current integration. ElevenLabs and Fish Audio have bounded, unequal **Partial** API Studio prototypes; Fish Audio live behavior remains configuration-required.

## Repository verified

### Product shell

- `/` presents Voice Open Lab and the four explicit Try actions before specialist tools.
- `/simulations`, `/build`, and `/learn` provide stable contextual routes.
- Existing `/?module=...` links remain valid; functioning specialist modules were not removed.
- The shared shell exposes Try, Simulate, Build, and Learn globally. A contextual rail replaces the prior all-modules-at-once rail within specialist workspaces.
- Metadata, the PWA manifest, canonical evidence record, JSON-LD, sitemap, and public API identity use Voice Open Lab.

### Provider model and Early Access Bench

- The typed provider manifest now carries featured state, a visual-accent token, supported Try experiences, and public documentation references.
- Deepgram is featured and supports the four Lab entry experiences through existing routes. This is Lab implementation evidence, not a product-quality claim.
- `/providers/deepgram` is the provider gateway and links to existing speech, realtime, voice, agent, language, audio, API, and architecture surfaces.
- `/providers/deepgram/early-access` implements the public Early Access Bench contract and safe empty state.
- The public Early Access registry is server-only and empty. Confidential or uncleared names, metadata, assets, and configuration are excluded rather than hidden with CSS or a browser flag.

### Simulation Observatory

- Eleven scenario records use typed IDs, status, modes, impairments, evidence, limitations, and canonical evaluation links where one exists.
- `Target Speaker vs. The World` is the implemented V1 deterministic replay.
- Its event envelope covers Audio, STT, Conversation, Agent, Tool, TTS, Playback, and Outcome stages.
- Start requires a visible confirmation. Pause, resume, immediate stop, clear, sanitized export, and two-run comparison are browser controls.
- The scorecard says **Observed in this experiment**, exposes Lab metrics, and lists remaining uncertainty.
- The local usage ledger stores bounded structured facts only: timestamp, provider, mode, scenario, request count, audio seconds, TTS characters, success, and billing availability. It stores no raw prompt, transcript, audio, credential, or customer payload.
- The replay reports zero provider requests and does not import a Deepgram execution route.

### Keyboard and keyboard shortcuts

- `Ctrl/Cmd + K` opens the command palette.
- `H`, `D`, `S`, `B`, and `L` navigate to Home, Deepgram, Simulations, Build, and Learn. `D` retains its existing diagnostic-copy behavior when a visible diagnostic action exists.
- Existing `G` sequences remain available for specialist modules.
- All global shortcuts remain disabled in text-editing and code-editor surfaces.
- The simplified semantic keyboard shortcuts first page is HOME, TRY, DEEPGRAM, SIMULATE, BUILD, LEARN, BACK, and COMMANDS.
- Those eight actions navigate or focus browser UI only. They cannot start capture, upload, transcription, TTS, an agent, or a simulation.

## Privacy, execution, and telemetry

- `DEEPGRAM_API_KEY` remains server-side. No new public client structure accepts or serializes it.
- Opening `/`, `/simulations`, `/build`, `/learn`, a provider page, or the Early Access Bench does not call Deepgram.
- Existing live paths retain their server routes, short-lived browser-token pattern, runtime flags, and visible execution controls.
- `VOICE_LAB_OPERATOR_MODE` is a server-side boolean for owner UI affordances. In V1 it does not unlock a live runner; the Observatory remains replay-only.
- Privacy-conscious analytics records route categories and replay category metadata only. It does not record raw prompts, transcripts, audio, or provider credentials.

## Current status

| Surface | Status | Boundary |
| --- | --- | --- |
| Voice Open Lab home and primary IA | Working | Repository verified; browser behavior still requires release review |
| Deepgram Featured Provider page | Working | Repository verified; not sponsorship or provider superiority |
| Early Access Bench infrastructure | Partial | Public contract and empty state exist; zero public experiments are configured |
| Simulation scenario registry | Working | Registry metadata only unless a scenario says implemented |
| Target Speaker vs. The World replay | Working deterministic replay | Event-only synthetic fixture; no mixed audio and no provider call |
| Observer UI and event envelope | Working for local replay | No multi-user live broadcast transport |
| Live/operator simulation runner | Planned | Requires authentication, quotas, cancellation, audit, and cost controls |
| Shared live observation | Planned | Requires durable shared event storage and pub/sub; serverless process memory is explicitly unsupported |
| Audio impairment transformations | Experimental idea | Current V1 marks deterministic conditions in event data; it does not generate or alter audio |
| Additional provider adapters | Planned | No capabilities are inferred for future providers |

## Claim vocabulary

- **Repository verified:** implemented or tested in this checkout.
- **Deepgram documentation verified:** supported by a current authoritative Deepgram source in the existing documentation-evidence path.
- **Assumption:** reasonable but not yet verified.
- **Experimental idea:** a Lab design or hypothesis, not a provider capability or commitment.

## Configuration

`VOICE_LAB_OPERATOR_MODE=false` is the only new optional variable in this pass. Set it server-side to `true` only for an owner-controlled environment. It currently changes bounded operator UI affordances; it does not expose a live provider simulator.

Existing Deepgram and Open Lab variables retain their documented meanings. Never commit secret values or copy a permanent provider credential into a `NEXT_PUBLIC_` variable.

## Strongest first credit-backed experiment

The strongest first live candidate is **Target Speaker vs. The World: baseline versus controlled crosstalk** using project-owned synthetic speech or explicitly consented audio. Run equivalent inputs through the existing guarded prerecorded/realtime Deepgram path, confirm task-critical entity `A17`, record background intrusion and correction turns, and stop after a small fixed repetition cap. This would test a meaningful question while preserving the current statement that the V1 replay itself is not provider evidence.

## Validation

Use:

```text
npm run test:voice-open
npm run test:providers
npm run test:keyboard
npm run test:keyboard-shortcut
npm run test:open-lab
npm run typecheck
npm run lint
npm run build
npm run audit:secrets
```

Physical keyboard shortcuts behavior, physical mobile microphones, live Deepgram quality, provider entitlement, shared observation, Vercel deployment, and production traffic are not proven by these local tests.

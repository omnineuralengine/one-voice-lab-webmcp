# ONE Voice Lab WebMCP

ONE Voice Lab is a local-first environment for exploring voice-AI provider evidence, comparing documented capabilities, and running reproducible voice-agent experiments.

This repository includes a challenge-period browser WebMCP extension. It gives an agent a bounded, human-authorized path through the existing deterministic Simulation Lab; it does not grant provider access or initiate live voice activity.

## WebMCP replay flow

The Simulation Lab registers four browser-side tools when WebMCP is available:

- `list_voice_scenarios` lists verified deterministic scenarios.
- `prepare_voice_replay` creates a normalized local replay plan.
- `run_voice_replay` runs only a plan explicitly authorized by a human in the visible Lab UI.
- `get_voice_replay_evidence` returns structured deterministic evidence from the latest replay.

Prepared plans are visible in the Simulation Lab. A human must select **Authorize this local replay** before a plan can run. Authorization is bound to the exact plan, is single-use, and is invalidated by plan changes, navigation, refresh, or unmounting.

## Simulation Mode and safety

All replay results are labeled **Simulation Mode**. Replays use local deterministic fixtures and make no provider, telephony, microphone, upload, or external replay request. They do not use provider credentials and incur zero provider spend.

Provider cards, adapters, and evidence are product data—not provider endorsements. Documentation distinguishes observed evidence from unknown or simulated information.

## Run locally

```bash
npm install
npm run dev
```

Open `/simulation-lab` to use the human interface. WebMCP is progressive enhancement: browsers without it retain the complete human workflow.

Useful checks include:

```bash
npm run test:webmcp
npm run typecheck
npm run lint
npm run build
```

## Privacy

Do not add real provider credentials to this repository. `.env.example` contains placeholders only. This public release intentionally excludes private working notes, prompts, operator artifacts, and deployment material.

Hosted deployments use Vercel Web Analytics for aggregate pageview and traffic insights. The Lab does not send tool inputs or provider payloads as custom analytics events.

# Known Limitations

## Voice Open Lab V1

- The Simulation Observatory runs deterministic browser event replay only. It does not mix audio, call Deepgram, prove provider quality, or estimate billing value.
- The `Target Speaker vs. The World` scorecard is a Lab fixture observation, not a benchmark.
- Public visitors cannot launch live provider simulations. `VOICE_LAB_OPERATOR_MODE` changes bounded owner UI affordances but does not add a live execution path.
- Shared observation is not implemented. A future version needs durable shared persistence and pub/sub; serverless process memory is not an acceptable broadcast transport.
- The Deepgram Early Access Bench has an implemented public contract and empty state, but zero public experiments are configured.
- Deepgram remains the only deeply integrated Featured Provider. ElevenLabs and Fish Audio have bounded, unequal Partial API Studio prototypes for documented catalog, prerecorded STT, and TTS operations. Fish Audio live behavior remains configuration-required and neither Partial integration establishes provider parity or production readiness.
- Responsive browser tests do not prove physical mobile microphone or physical keyboard companion behavior.

This document summarizes implementation boundaries that must remain visible in
a demo, technical discussion, or customer handoff. The current application,
capability registry, focused tests, and retained manual evidence—not a prompt or
roadmap—are the source of truth.

## Flux Conversation Observatory

- `/flux-observatory` has a real direct `/v2/listen` browser implementation,
  but the repository does not retain a completed real microphone/provider
  validation record. Status: **Implemented with deterministic fixtures;
  Manual validation required; Production readiness not established.**
- The 15 replay scenarios are synthetic event records. They do not establish
  provider latency, accuracy, account entitlement, language quality, threshold
  fit, or production behavior.
- The live browser audio implementation currently emits mono linear16 PCM. The
  typed contract lists other officially supported Flux encodings for validation
  and API handoff, not as proof that the current microphone path emits them.
- Approximately 80 ms is a configured/provider-recommended target. Browser
  scheduling and resampling affect actual cadence; the application reports
  observed intervals separately.
- Local timing includes capture, browser scheduling, buffering, network, and
  transport effects. It is not a Deepgram SLA or universal benchmark.
- Median is withheld below three observations and P95 below twenty. A short
  demo cannot support a percentile claim.
- The current normalized wire contract does not identify forced timeout as an
  explicit reason. The application does not infer a forced-timeout count.
- Language hints are available only with `flux-general-multi` at this client
  boundary. Current product/model/language availability must be rechecked
  before a POC.
- The speculative-response panel is a deterministic local state demonstrator.
  It does not call an LLM, TTS provider, or tool and is not a production voice
  agent.
- A `StartOfTurn` event can be used as an interruption cue, but the Observatory
  does not prove downstream playback cancellation, tool idempotency, or a full
  customer agent.
- Dynamic Configure success/failure fixtures prove reducer behavior only. A
  provider acknowledgement is provider evidence only when received and
  retained during a documented live run.
- Live sessions are intentionally bounded and ephemeral. The application does
  not provide a production transcript store, multi-user session backend,
  telemetry warehouse, fleet view, or long-term comparison system.
- The expected next experiment, Flux Turn-Taking Arena, is not part of this
  iteration.

See [Flux Conversation Observatory](FLUX_CONVERSATION_OBSERVATORY.md) and
[Flux Provider Validation](FLUX_PROVIDER_VALIDATION.md).

## Provider, account, and network evidence

- Automated tests and deterministic fixtures make no paid provider call and do
  not prove a configured key, product entitlement, regional availability,
  quota, rate limit, price, accuracy, or provider uptime.
- Live microphone, audible TTS, Voice Agent, account-management, and
  version-sensitive SDK behavior require bounded manual verification.
- Browser WebSocket handshake detail is limited. Close code 1006 alone cannot
  identify authentication, entitlement, configuration, or network cause.
- A successful API Lab request proves only the exact tested request and
  environment; it does not validate unrelated customer code.
- Official documentation and model availability can change after the recorded
  verification date. Recheck current primary sources before making a customer
  claim.

## Customer and production readiness

- The Lab is a community-built learning and solution-engineering environment,
  not official Deepgram material or a production service certification.
- No module establishes regulatory compliance, data residency, retention
  policy, security approval, cost approval, or production SLOs automatically.
- Customer-ready deliverables require reviewed evidence, current citations,
  resolved critical contradictions, accepted decisions, and explicit export
  approval. Generation success alone is not readiness.
- Local-first cases do not provide a production multi-user collaboration or
  conflict-resolution backend.
- Proposed architectures, assumptions, possible release matches, and scoped
  validations retain qualification; they do not become agreed facts through
  export.
- “Speak the Problem” remains planned. Live Solution Studio does not
  automatically listen to meetings or intercept system audio.
- SDK Release & Regression Radar remains partial as a standalone UI; qualified
  registry evidence is integrated through SDK Doctor.
- External telephony, CRM, LLM/RAG, third-party tools, and multi-agent paths are
  simulated or architectural unless a specific implementation and retained
  validation says otherwise.

## Privacy, hosted review, and offline behavior

- Operators remain responsible for consent, recording disclosure, retention,
  customer authorization, and safe handling of exported evidence.
- Demo Mode fixtures are fictional. Private cases, workshop notes, credentials,
  recordings, and generated customer artifacts do not belong in Git or a public
  demo.
- Hosted-review behavior is branch and environment specific. A local build does
  not validate a separately configured hosted deployment.
- Offline support means deterministic/local behavior remains usable after the
  application shell is available. Provider calls, Docs MCP retrieval, and
  server-generated binary deliverables still require their respective local or
  remote services.
- Browser storage is not a confidential multi-tenant database. Persist only
  the redacted fields documented by each module and purge local cases when
  required.

## Evidence language

Use:

- Planned;
- Implemented with deterministic fixtures;
- Working prototype;
- Live-provider validated for a named environment and scenario;
- POC-ready for a defined scenario; and
- Production readiness not established.

Do not use “production-ready,” “enterprise-ready,” “production-certified,”
“zero latency,” “perfect turn detection,” “guaranteed accuracy,” or
“universally optimal configuration.”

## Open Lab and Flux TTS limitations

Verification date: **2026-08-14**

- **Repository verified:** the Lab is a community-built prototype, not an official Deepgram product or production-certified service.
- **Repository verified:** Flux batch `/v2/speak` is implemented; Flux streaming is disabled until its deployed browser JWT/raw-audio path is proven.
- **Repository verified:** a bounded 2026-08-14 production-server smoke made one Cole request and one Jack request with no retry. Both reached Deepgram but returned sanitized `provider_authorization_failed` responses and no audio, so this is not successful live-provider, playback, or download proof.
- **Assumption:** the live rejection may involve credential authorization or account/model entitlement; repository evidence does not establish the cause.
- **Deepgram documentation verified:** current docs list 36 English Flux voices. The Lab intentionally executes 35 and excludes documented `flux-conor-en`; `flux-renee-en` is absent from current docs.
- **Repository verified:** the Flux “Early Access” badge is Lab maturity. Current docs checked on 2026-08-14 do not provide that provider lifecycle label; no GA claim is made.
- **Assumption:** the deployed account is entitled to every documentation-listed model. Documentation support does not prove entitlement.
- **Repository verified:** mocks and fixtures do not prove provider uptime, live latency/quality, customer-audio accuracy, quotas, scale, pricing, compliance, or deployment readiness.
- **Repository verified:** public Open Lab blocks account/Management data. It does not display a guessed balance and provides no Manage mutation surface.
- **Repository verified:** disabling `OPEN_LAB_DEEPGRAM_ENABLED` stops live calls but preserves synthetic/local learning.
- **Repository verified:** microphone permission and recording disclosure remain mandatory; no provider action runs automatically.
- **Repository verified:** local-first browser state is not encrypted enterprise storage or a governed multi-user backend.
- **Repository verified:** Architecture Studio cross-device sessions require optional external configuration and deployment testing.
- **Repository verified:** generated solution/deliverable content remains a reviewable draft requiring human approval.
- **Repository verified:** SDK Release & Regression Radar is partial. Speak the Problem remains planned and unavailable.
- **Repository verified:** keyboard companion hardware export/import requires physical validation.
- **Repository verified:** no approved Omni Neural Engine watermark asset exists. The integration remains disabled until `/public/brand/omni-neural-engine-mark.svg` is supplied.
- **Repository verified:** the Open Lab changes were not deployed as part of this work. Hosting still requires explicit server-side Open Lab booleans and a valid server-only Deepgram credential.
- **Experimental idea:** future realtime Flux controls must follow the then-current official client/server message contract and receive explicit deployment evidence before they are enabled.

## Lab Evolution limitations

- **Repository verified:** Lab Evolution is a community engineering-notebook prototype, not official Deepgram material, a production-certified process, or a replacement for Git history and release checks.
- **Repository verified:** the timeline includes only dates, commits, tests, and sources supported by repository-controlled evidence. Missing module history remains absent.
- **Repository verified:** GitHub remains canonical source control, and Vercel remains deployment infrastructure. Lab Evolution does not commit, push, merge, deploy, or promote a release.
- **Experimental idea:** Entire is modeled only as a parallel observational context layer. No tracked Entire checkpoint is claimed, and Entire does not replace GitHub or alter Vercel delivery.
- **Repository verified:** module maturity describes repository implementation evidence, not provider entitlement, production readiness, deployment success, quality, scale, or customer acceptance.
- **Repository verified:** the approved Omni Neural Engine watermark remains unavailable at `/public/brand/omni-neural-engine-mark.svg`; the shared watermark integration stays disabled.
- **Repository verified:** the 2026-08-14 final local post-feature gate passed: lint/typecheck, `npm test` at 440/440, default Playwright with 76 passes and 6 intentional project-guard skips, Open Lab at 30/30, the Next.js 16.2.11 production build, a 379-file secret audit, and diff check.
- **Repository verified:** `PayloadInspector` intentionally renders ISO timestamps through server/initial hydration and switches to browser-local time afterward. The cross-timezone regression passed; local display remains dependent on the viewer's configured browser locale/timezone.
- **Repository verified:** exact configured `DEEPGRAM_API_KEY` value occurrences were 0 in `.next/static` and scanned `.next` text. This is artifact-scan evidence, not a substitute for runtime secret management.
- **Repository verified:** hydration-fix commit `24f1340` was pushed, draft PR #4 exists, and the matching Vercel preview reached Ready. Clean-session Overview desktop plus Lab Evolution/Flux 390px checks passed without captured page/console errors.
- **Repository verified:** the inspected Vercel artifact is a branch preview, not production deployment, provider entitlement, or live-provider proof. The bounded Flux Cole/Jack attempt returned authorization failures and no audio, so live-provider playback/download remain unproven.
- **Experimental idea:** no Entire checkpoint was created because the Entire CLI was unavailable; local `.entire` data is not checkpoint evidence.

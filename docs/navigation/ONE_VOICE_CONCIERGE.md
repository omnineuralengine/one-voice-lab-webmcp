# ONE Voice Concierge and adaptive navigation

Status: the Voice Concierge architecture contract. Final deterministic evidence and the
checkpoint decision are recorded in the completed-stage handoff.

## Purpose

ONE Voice Concierge gives a human an optional, goal-first entrance into ONE's
existing journeys. A person may type one bounded outcome, or explicitly start
browser/operating-system speech recognition and review its final transcript.
ONE then reflects the interpreted goal, asks one bounded clarification when
needed, and previews at most three registered internal destinations. Navigation
occurs only after the person chooses one of those destinations.

The concierge is a guide, not a gate, chatbot, agent, search engine, provider
recommender, or execution surface. Existing Explore, Compare, Evaluate, Build,
Learn, account, and specialist navigation remains directly available without
opening it.

## Flagship journey

The shared header exposes **Ask ONE** on desktop and mobile. Home also provides
a prominent ONE-owned entry and three curated goal examples. The interaction is:

1. enter one short outcome or select a curated goal;
2. optionally use explicit, foreground voice capture;
3. review and edit the final transcript before interpretation;
4. receive a matched, ambiguous, unsupported, or unavailable result;
5. clarify once when the deterministic result is ambiguous;
6. inspect why each registered journey fits and its input, provider, cost,
   persistence, and confirmation disclosures;
7. explicitly choose a journey or return to direct navigation.

Edit, reset, dismiss, Escape, browser back/forward, and unavailable-destination
recovery remain ordinary, reversible controls. Opening the concierge or arriving
at a route never runs that route's consequential action.

## Canonical goal and destination registry

`ONE_CONCIERGE_REGISTRY_VERSION` identifies the typed
`one-concierge-navigation/1.1.0` contract. It contains stable intent and
destination IDs, bounded phrases, approved route-context hints, adaptive copy,
availability metadata, and disclosure metadata. It does not contain an action,
provider, model, fixture, owner, trust tier, policy grant, or arbitrary URL.

The initial public, guest-allowed destination cohort is:

| Destination ID | Existing ONE journey | Purpose |
| --- | --- | --- |
| `explore` | canonical Explore route | understand ONE and choose a direct path |
| `transcribe-audio` | canonical upload-audio module | prepare approved audio for the existing transcription journey |
| `create-speech` | canonical TTS module | prepare text for the existing speech-generation journey |
| `compare-providers` | canonical Compare / Provider Hub route | inspect attributable capabilities, readiness, and limitations |
| `evaluate-evidence` | canonical Evaluate route | inspect controlled comparison and evidence |
| `stt-evaluation-methodology` | canonical evaluation-methodology surface | inspect the planned, not-runnable STT evaluation boundary without treating TTS fixtures as WER evidence |
| `scenario-studio` | existing Scenario Studio route | explore the fixture-only interruption-recovery scenario |
| `build` | canonical Build route | find existing integration and specialist tools |
| `learn` | canonical Learn route | understand voice-system concepts and evidence |

Explore, Compare, Evaluate, Build, Learn, upload-audio, TTS, and methodology
locations are derived from the existing ONE navigation, experience, and
learning-surface registries. Scenario Studio uses its already registered
application route. The concierge therefore adds a bounded goal index over
canonical routes rather than a second route tree. Clear WER and STT-evaluation
intent resolves only to the methodology state; it does not run an evaluation.

Registry startup assertions reject duplicate intent IDs, destination IDs,
destination routes, synonym collisions, invalid destination references,
unsafe internal routes, and destination sets outside one-to-three results.

## Deterministic resolver

The pure resolver:

- accepts at most 240 Unicode characters and returns at most three destination
  IDs;
- applies NFKC and whitespace normalization with stable registration order;
- rejects control/format characters, URLs and paths, URL schemes, markup or
  injection-like instructions, authority-shaped assignments, and multi-command
  chains;
- performs bounded exact, whole-phrase, and token-overlap matching;
- returns only `matched`, `ambiguous`, `unsupported`, or `unavailable`;
- requires clarification rather than guessing for registered ambiguity;
- treats stale registry versions, missing routes, and offline-only destinations
  as unavailable;
- returns IDs rather than route strings, then performs a fresh code-owned
  destination lookup only after explicit selection.

React renders input as text and uses no unsafe HTML evaluation. A transcript and
typed statement use the exact same resolver after final confirmation. Partial
speech, malformed speech results, unconfirmed final transcripts, and unsupported
goals never navigate.

## Navigation-only authority boundary

The concierge may explain, preview, change the existing presentation-depth
preference at the person's request, and navigate to one allowlisted internal
route. It performs no fetch, action dispatch, provider call, upload, form
submission, save, download, Scenario run, receipt mutation, authentication
change, quota admission, trust change, provider/model selection, or external URL
opening.

The browser receives no executable action mapping. A destination ID is not an
authorization grant. The selected route re-runs its existing authentication,
ownership, quota, provider-policy, confirmation, and server-authorization
checks. Navigation filtering is usability, not authorization; direct and forged
deep links remain independently governed by the destination.

The recommendation card explicitly explains what input, provider involvement,
cost, persistence, and confirmation may occur after arrival. These disclosures
never imply that arrival itself provides consent.

## State machine and cancellation

The explicit client state machine covers closed, input, voice preparation,
listening, voice processing, transcript review, clarification,
recommendations, unsupported, unavailable, and voice-error states. One
generation counter and the shared browser-speech coordinator discard late
results and enforce one active recognition flow across ONE's browser speech
controls.

Close, reset, route/search transition, verified principal transition, pagehide,
BFCache restore, visibility loss during capture, offline transition, and
component unmount abort active capture, release the shared speech lease, clear
timers, invalidate late results, and clear concierge state. Reconnect never
replays cancelled work.

## Voice progressive enhancement

Text, keyboard, and touch provide the complete journey. The browser speech
module is dynamically imported only after the person presses **Use microphone**.
There is no permission request, microphone activation, audio preload, polling,
or speech work during ordinary navigation.

When supported, ONE uses the browser's `SpeechRecognition` or
`webkitSpeechRecognition` capability with:

- a 12-second hard duration and four-second silence bound;
- at most three deduplicated final segments;
- at most six event results inspected and a 240-character transcript;
- visible and announced ready, listening, processing, review, and error states;
- immediate stop and cancel controls;
- review and editing before deterministic resolution;
- direct recovery to preserved typed text for denial, revocation, no speech,
  timeout, unsupported APIs, malformed results, cancellation, offline state, or
  processing failure.

ONE does not claim this recognition is local, offline, private, provider-free,
or on-device. The interface states that the browser or operating system may use
its own speech service. Browser-controlled speech processing is outside ONE's
application transport and remains Verification Level 3.

ONE does not use speech synthesis in this slice. It never plays user text,
transcripts, account information, evidence, or arbitrary content.

## Ephemeral privacy and identity lifecycle

Goal text, partial/final transcript, interpreted intent, recommendations, and
progress live only in current-tab React memory. the Voice Concierge adds no database row,
migration, cookie, profile field, localStorage/sessionStorage/IndexedDB/Cache API
key, history, export, share, resume path, analytics taxonomy, or log event.

Concierge state never enters URLs, query strings, server-rendered shared HTML,
ONE application-controlled requests, error payloads, service-worker caches,
analytics, logs, traces, exports, or share links. ONE application code does not
obtain or retain raw microphone audio; speech capture is delegated to the
browser/operating-system recognition API.

The existing server-derived ONE principal and client identity epoch remain the
identity boundary. The surface waits for identity readiness before resolving a
journey or starting voice. Sign-in, sign-out, USER_A-to-USER_B transitions,
route/search transitions, page lifecycle invalidation, and relevant cross-tab
identity signals clear tab-local concierge state and reject late results. No
restricted route name is placed in the guest-visible registry.

## Adaptive presentation

the Voice Concierge reuses the exact Essential, Guided, Detailed, and Technical presentation
depths and the existing `HumanDepthControl`. Depth changes explanation density
and can reveal the stable destination and registry IDs at Technical depth. It
does not change destination IDs, route availability, provider or model choice,
authority, trust, quota, cost semantics, privacy, evidence, provenance, or the
destination's outcome.

The **Why this view?** disclosure explains that boundary. Depth is explicit,
reversible, and governed by the existing guest/account preference precedence.
The concierge adds no persistence or inference. It does not classify expertise,
emotion, accent, demographics, disability, personality, occupation, or
commercial value.

## Provider neutrality and provenance

The hierarchy is human goal, recommended ONE journey, disclosed tradeoffs, then
destination. No provider owns or dominates the concierge. Provider names typed
as a goal resolve only to the neutral provider-comparison journey; they never
select a provider or model. The concierge offers no ranking, sponsored placement,
quality winner, or unsupported "best" claim.

Provider attribution remains visible where a destination or its later evidence
requires it. A navigation recommendation says whether provider involvement may
occur after arrival, while leaving the provider registry, execution policy, and
evidence contracts unchanged.

## Accessibility and responsive behavior

The shared trigger and Home entry are keyboard, pointer, and touch operable. The
native modal dialog supplies a semantic dialog boundary; heading and description
relationships, one polite status region, visible state text, labeled controls,
and non-color state communication support assistive technology. Escape closes
the surface and restores focus to the opener. Phase changes deliberately move
focus to the next heading while recommendation updates do not move focus among
choices unexpectedly.

Controls use the existing visible-focus and minimum 44-pixel target rules. The
dialog becomes a safe-area-aware mobile sheet, reflows cards and technical text,
accounts for the virtual keyboard, honors reduced motion, and preserves direct
navigation. The deterministic viewport matrix is 320, 390, 768, 1024, and 1440
CSS pixels plus a 200% zoom check. Automated evidence supports Level 2, not full
WCAG 2.2 AA, real-device, or screen-reader conformance.

## PWA, offline, and performance boundary

No dynamic concierge endpoint exists. The existing static application shell may
be cached under existing policy, but transcript-bearing state is React-memory
only and cannot enter CacheStorage. There is no background sync, offline queue,
deferred command, reconnect replay, or background microphone capture.

Offline text may resolve only destinations whose static shell is registered as
available; other journeys fail closed and retain an editable text path. Offline
voice fails directly to text. The application contract is designed to render a
neutral installed-PWA startup state until the existing identity context is
ready; deployed/installed-PWA verification remains Level 3.

No runtime dependency is added. The resolver and registry are small synchronous
modules, the surface performs no application request, and voice-specific code is
lazy. Deployed worker/CDN behavior and actual browser/OS speech networking remain
Level 3.

## Verification boundary

- **Level 1 — architecturally established:** versioned registry and resolver,
  navigation-only authority, explicit state machine, identity/privacy lifecycle,
  adaptive invariants, threat model, responsive/accessibility design, and PWA
  boundary.
- **Level 2 — deterministic local evidence:** focused unit and mocked-browser
  journeys, exact text/voice parity, hostile-input rejection, cancellation and
  late-result invalidation, storage/cache sentinels, isolated contexts,
  destination no-execution checks, required viewport/depth/zoom reflow, adjacent
  regressions, local database/schema invariance, build, lint, typecheck, and
  secret audits. Final counts belong in the completed-stage record.
- **Level 3 — not performed:** real browser/OS speech service and its network
  behavior, microphone permission UX across browsers, real devices and virtual
  keyboards, manual assistive-technology verification, installed-PWA lifecycle,
  deployed authentication/identity transitions, CDN/cache/CSP/WAF behavior, and
  production observability/abuse controls.

No Level 1 or Level 2 result is production verification.

## Deferred work

- generative, semantic, RAG, or learned intent routing;
- arbitrary commands, tools, actions, or agent execution;
- provider/model recommendations or rankings;
- concierge history, persistence, analytics, personalization, sync, export,
  sharing, or resume;
- server/provider STT, wake words, always-listening, background capture, or
  voice authentication;
- offline command execution or replay;
- paid, mutating, destructive, Scenario, benchmark, or provider execution from
  the concierge;
- Level 3 speech, mobile, PWA, accessibility, authentication, and deployment
  verification.

# Applied Engineering Questline — Implementation Plan

> **Historical implementation plan.** Applied Engineering Questline is now implemented in the active control room. Use the application, root README, and current Questline documentation as the source of truth; items described here as planned are not completion claims.

Verified against the repository on 2026-07-12 before product-code changes.

## User value

Applied Engineering Questline turns the existing endpoint, code, payload, and architecture labs into a deliberate practice system. The learner should be able to translate one voice workflow across runtimes, explain how bytes and events move, diagnose a realistic client-stack failure, and produce a sanitized implementation recommendation.

## Existing architecture to reuse

- `src/components/deepgram-control-room.tsx` — active full-height shell, left rail, focus mode, and command palette.
- `src/components/CodeLab.tsx`, `src/lib/code-lab-files.ts`, and `src/lib/code-lab-recipes.ts` — editable mock IDE, file placement, TypeScript/Python/Go/.NET/Shell examples, and Integration Recipe Builder.
- `src/components/api-studio/*` and `src/lib/deepgram-api-catalog.ts` — operation IDs, verified endpoint metadata, payload teaching, and safe local execution.
- `src/components/PayloadInspector.tsx`, `src/components/EventTimeline.tsx`, and `src/lib/inspection.ts` — sanitized request/response and timeline conventions.
- `src/components/applied-voice-systems/*` and `src/lib/applied-voice/*` — client discovery, pipeline ownership, failures, evaluation, experiments, deployment, and secret-safe export helpers.
- `src/components/browser-mic-card.tsx` and `src/lib/live-mic/*` — real browser microphone lifecycle, MediaRecorder MIME detection, level metering, track cleanup, and temporary-token flow.
- `src/lib/code-lab-storage.ts` — local JSON helpers plus credential detection and snippet sanitization.

## Ownership boundaries

- **API Studio:** endpoint and payload exploration.
- **Code Lab:** editable starter files and file placement.
- **Payload Inspector:** sanitized request/response evidence.
- **Applied Voice Systems:** solution architecture, evaluation, and production reasoning.
- **Applied Engineering Questline:** language/runtime mental models, polyglot comparison, client-stack diagnosis, audio fundamentals, testing practice, and progression.

Questline will cross-link those surfaces rather than clone their implementation.

## Data model and registries

- `src/types/questline.ts` — language, quest, code example, runtime, incident, audio lesson, toolchain, pattern, stack adapter, capstone, drill, and progress types.
- `src/lib/questline/language-tracks.ts` — primary, bridge, framework-specialization, and optional awareness tracks.
- `src/lib/questline/quest-nodes.ts` — six-tier quest nodes with prerequisites, mental models, challenges, links, and Applied ML lenses.
- `src/lib/questline/polyglot-patterns.ts` — workflow implementations and semantic regions across verified languages; REST fallback or docs-verification labels where SDK support is uncertain.
- `src/lib/questline/client-incidents.ts` — deterministic incidents with evidence, misleading clues, diagnosis, prevention, and client explanation.
- `src/lib/questline/audio-engineering-lessons.ts` — digital-audio lessons, failure fixtures, and language-specific byte movement.
- `src/lib/questline/ide-tracks.ts` — VSCodium, Visual Studio, JetBrains, Jupyter, terminal, CMake/Ninja, and containers.
- `src/lib/questline/capstone-projects.ts` — eight client-impact capstones.
- `src/lib/questline/mastery-checks.ts` — seven local educational mastery levels and skill constellation axes.
- `src/lib/questline/questline-utils.ts` — guarded persistence, sanitization, stack recommendations, scoring, and exports.

## UI composition

- `AppliedEngineeringQuestline.tsx` — compact workspace controller and sanitized local progress.
- `QuestlineNavigation.tsx` — quest/language/toolchain/audio/incident/capstone tree.
- `QuestLessonWorkbench.tsx` — lesson, challenge, first-principles runtime, Applied ML lens, and mastery check.
- `PolyglotMatrix.tsx` — synchronized semantic-region comparison.
- `ClientIncidentLab.tsx` — guided/timed diagnosis, clue/architecture/payload reveals, and client-facing explanation.
- `AudioEngineeringWorkbench.tsx` — explicit-start microphone/synthetic fixtures, waveform, RMS/peak/clipping, settings, and guaranteed cleanup.
- `ClientStackAdapter.tsx` — stack-specific project, concurrency, testing, deployment, pitfall, and discovery recommendations.
- `DebuggerAndTestingLab.tsx` — evidence-driven debugger simulation, trace-this-code, build-from-blank, and testing quests.
- `CapstoneAndDrillLab.tsx` — capstones, impact artifacts, timed applied-engineer drills, notes, mastery, and sanitized exports.
- Shared compact primitives keep focus, badges, code panes, and internal scrolling consistent.

## Implementation phases

1. Shell, quest navigation, TypeScript/Python foundations, runtime explainer, polyglot matrix, and Client Stack Adapter.
2. Go, .NET/C#, Shell/PowerShell, SQL, and incident library.
3. Browser-native Audio Engineering Workbench, audio failures, and per-language byte movement.
4. C++20, PHP, HTML/CSS/React specializations, and IDE/toolchain tracks.
5. Trace/build/debug/testing modes, capstones, drills, mastery constellation, exports, and documentation updates.

## Safety and accuracy rules

- No Questline surface executes learner-authored code.
- No permanent key, Authorization value, temporary token, raw microphone data, or likely credential is persisted or exported.
- Generated code uses `DEEPGRAM_API_KEY`, `$DEEPGRAM_API_KEY`, or runtime environment APIs only.
- Microphone access is user-triggered; tracks, animation frames, audio nodes, and `AudioContext` are stopped on stop/unmount.
- Synthetic sine, silence, and noise fixtures stay local and are never uploaded automatically.
- Deepgram SDK/package/method examples appear only when verified against current official docs. Otherwise use direct REST/WebSocket patterns or mark `Docs verification required`.
- Simulated incidents, debugger frames, capstone evidence, and scores are visibly labeled.
- Optional Java/Kotlin and Rust tracks are awareness-only and never block progression.

## Risks and mitigations

- **Bundle/content size:** use compact typed registries, render one active surface, and avoid visualization dependencies.
- **Duplicated code examples:** reference Code Lab workflows and use a small translation matrix focused on semantic differences.
- **LocalStorage secret leakage:** sanitize before persistence/export and skip persistence when credential detection fires.
- **React media lifecycle:** isolate Web Audio in one client component with refs, explicit start/stop, and unmount cleanup.
- **False SDK confidence:** local documentation metadata records verification status and official URL per pattern.
- **Layout overflow:** Questline owns the central workspace, hides the global right inspector, and uses three independently scrollable regions.
- **Mastery inflation:** statuses are local learning evidence (`Completed`, `Practiced`, `Needs review`, `Not started`), never certification.

## Completion target for this pass

Deliver a coherent working surface across all five phases with representative depth in every track. Live Deepgram execution remains in existing guarded modules. Full language-specific production projects, real third-party integrations, installed external test frameworks, live C++ audio dependencies, and server-side code execution are intentionally outside this pass.

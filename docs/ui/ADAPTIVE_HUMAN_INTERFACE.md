# Adaptive Human Interface Architecture

## Purpose

ONE adapts presentation depth to the task a human is performing without
changing the underlying capability, evidence, ownership, or authorization.
The interface begins with human intent, keeps provider provenance visible, and
reveals configuration and technical detail when they become useful.

This architecture is provider-neutral and capability-centered. It does not
create separate beginner, executive, developer, or researcher products.

## Architectural principles

1. Human intent leads; provider and model selection appear at the depth where
   they are relevant.
2. Simplicity is organization, not removal of power or technical truth.
3. Adaptation is explicit, reversible, and explainable. ONE does not infer or
   persist a person's supposed expertise.
4. Interface depth is presentation only. It never grants authority, changes
   ownership, bypasses provider policy, or enables a server capability.
5. Accessibility, mobile behavior, cognitive clarity, and performance are
   structural requirements rather than finishing work.
6. Provider neutrality never removes provenance, limitations, methodology, or
   uncertainty needed to interpret a result.

## Interface-depth model

ONE uses four presentation states:

| Depth | Human need | Typical content |
| --- | --- | --- |
| **Essential** | Begin and understand the immediate outcome | Human purpose, primary action, result, key state, consequential limitation |
| **Guided** | Act with nearby explanation | Essential content plus contextual education, plain-language terms, and next-step guidance |
| **Detailed** | Compare or configure deliberately | Provider/model, meaningful configuration, measurements, limitations, provenance, and evaluation context |
| **Technical** | Inspect exact implementation evidence | Stable identifiers, methodology, traces, sanitized structured data, request/response semantics, and diagnostics |

The product default is **Guided**. These labels describe the experience, not
the human. A human may change the global depth and may open a deeper disclosure
for one surface without changing the global preference.

Not every component needs four distinct renderings. A component exposes only
the layers that improve understanding or control. Technical implementation
leakage is not promoted merely to fill a depth.

## Preference and precedence model

- Guest depth preference is bounded, device-local presentation state.
- Authenticated depth preference is account-owned presentation state where the
  existing owned-preference boundary supports it.
- Account-owned state wins during guest-to-account transitions.
- Guest depth is not silently imported over an existing account preference.
- Signing out removes account-derived presentation and restores the current
  guest-safe preference.
- Changing humans on one browser must not expose the previous human's account
  preference.
- Corrupt, missing, or unknown values fall back to Guided.
- A local surface override is ephemeral unless the human explicitly changes
  the global preference.

Preference persistence is not identity proof. Browser storage and client state
remain untrusted for authorization.

## Canonical information architecture

Primary navigation is organized around human capabilities:

- **Explore** — understand what ONE can do and begin a capability.
- **Compare** — discover providers and compare supported, attributable options.
- **Evaluate** — run or inspect reproducible evaluation and evidence.
- **Build** — configure and combine supported capabilities.
- **Learn** — understand concepts near practical use.

**Account** is a utility boundary rather than a product capability. Provider
profiles remain directly discoverable under Compare and from attributed
results. Provider identity is visible wherever it affects configuration,
evidence, compatibility, cost, or interpretation.

Insertion points are intentionally reserved without implementation for:

- Scenario Studio under Build/Evaluate;
- future organizations/workspaces at the ownership and Account boundary.

the Scenario Studio now occupies the Scenario Studio insertion point with a bounded
fixture-only action. the Voice Concierge occupies the Voice Concierge insertion point with
an optional, deterministic intent-first entry into existing journeys. The
concierge changes navigation presentation only; it does not invoke an action or
grant destination authority. See
[`navigation/ONE_VOICE_CONCIERGE.md`](../navigation/ONE_VOICE_CONCIERGE.md).

## Adaptive component contract

The shared interface foundation uses a small set of composable primitives:

- `HumanDepthControl` — selects the presentation state with an accessible,
  reversible control.
- `AdaptiveSection` — reveals content at a declared minimum depth while keeping
  a deliberate local disclosure available when appropriate.
- `ExplainThis` — provides accurate contextual learning close to an unfamiliar
  term or result.
- `TechnicalDetails` — contains sanitized identifiers, methods, traces, or raw
  data without making them the default reading path.
- capability, evidence, measurement, status, and provider-attribution patterns
  that consume shared domain data rather than provider-specific UI branches.

These are presentation primitives. They do not create alternate business
logic, provider transports, evaluation methods, or authorization paths.

## Human-capability layering

For each migrated workflow, contributors should answer:

1. What is the human trying to accomplish?
2. What is the minimum truthful information required to begin?
3. What explanation becomes useful after interaction?
4. What configuration does deliberate comparison require?
5. What evidence does an evaluator need?
6. What sanitized technical data does a developer need?
7. Which visible details are useful, and which are implementation leakage?

The intended sequence is usually:

`action -> result -> explanation -> configuration -> evidence -> technical detail`

## Provider-neutral presentation

ONE owns navigation, interaction, terminology, status patterns, and evidence
presentation. Providers retain their names, models, verified capabilities,
limitations, sources, and provenance.

Two tests govern this boundary:

1. With provider logos removed, the product should still clearly feel like
   ONE and remain usable by capability.
2. With provider names restored, a human should be able to identify which
   provider/model produced a result and inspect relevant limitations and
   evidence.

Provider metadata must come from canonical provider projections. UI depth must
not fabricate support, quality, latency, pricing, health, or ranking claims.

## Evaluate presentation

Evaluate preserves the Stage 3 engine and deterministic semantics. Its
presentation should make these layers available without conflating them:

- the question being evaluated and why it matters;
- the human-readable result and uncertainty;
- provider/model/configuration and comparable measurements;
- methodology and evidence;
- sanitized technical trace or raw structure where already supported.

A single result or benchmark must not be presented as universal provider
superiority. Simplification may shorten the explanation but may not remove
material uncertainty, provenance, or methodological limits.

## Design-system governance

The interface uses a small, coherent set of tokens and primitives for:

- typography, spacing, layout, responsive boundaries, and surface hierarchy;
- focus, hover, pressed, selected, disabled, loading, empty, warning, error,
  success, and destructive states;
- disclosure, forms, navigation, provider attribution, evidence, technical
  detail, and educational callouts;
- minimum touch targets, reflow, reduced motion, and non-color-only status.

Contributors should normalize an existing sound primitive before adding a
replacement. Route-specific exceptions require a real interaction need. Do
not build a large component library, add visual dependencies for trivial
behavior, imitate provider branding, or recreate domain actions in UI code.

## Mobile, PWA, and performance boundaries

- Mobile transformation may change layout, but not remove essential
  capability, provenance, status, or security-relevant information.
- Dense tables and technical data should reflow or disclose rather than force
  unusable desktop layouts.
- Identity-sensitive and private responses remain outside unsafe service-worker
  caches.
- Adaptive preferences contain presentation values only; no transcript,
  provider secret, token, raw email, or sensitive inferred trait is stored.
- Prefer native disclosure, server rendering, bounded client components, and
  existing dependencies. Avoid unnecessary hydration and decorative motion.

## Adaptation safety invariants

1. Interface depth is presentation, not authorization.
2. Deeper depth cannot reveal unauthorized data.
3. Simpler depth cannot mutate or discard owned data.
4. Guest preference manipulation cannot obtain authenticated capability.
5. Browser depth state cannot bypass server checks.
6. USER_A preferences cannot appear for USER_B.
7. Guest preferences cannot overwrite account preferences silently.
8. Logout cannot leave account-specific adaptive state attributed to the next
   human.
9. Adaptation cannot merge histories across humans.
10. Adaptation cannot depend on sensitive inferred traits.
11. Technical detail cannot reveal credentials, tokens, private payloads, or
    privileged implementation data.
12. Provider neutrality cannot remove required provenance.
13. Simplification cannot misrepresent uncertainty or methodology.
14. Accessibility preferences cannot reduce security.
15. Reduced motion cannot remove essential status.
16. Mobile adaptation cannot remove essential capability.
17. Presentation changes remain reversible.
18. Human-selected preferences remain discoverable and explainable.

## Initial migration cohort

The completed the adaptive interface migration covers:

- shared shell and capability-centered navigation;
- Home as an intent-first entry point;
- Provider Hub and one provider profile through neutral presentation;
- Evaluate through layered meaning and evidence;
- Settings/Account through clear guest, signed-in, local-only, and account-owned
  state;
- the shared depth preference and disclosure primitives used by those surfaces.

Specialist studios and simulations remain usable but are not rewritten in this
cohort. Their later migration should reuse the same primitives and preserve
their domain capabilities.

The implemented map consists of the typed four-depth model,
`HumanDepthControl`, `AdaptiveSection`, `ExplainThis`, and `TechnicalDetails`;
the five-capability primary navigation; guest-local and account-owned
preference precedence; and the Home, Provider Hub/profile, Evaluate, and
Settings/Account migration cohort.

## Verification boundary

the adaptive interface establishes Level 1 architectural evidence and Level 2 deterministic
local evidence. It does not establish Level 3 production proof. Production
authentication, real OAuth/passwordless delivery, deployed PWA lifecycle,
production cache/CDN behavior, real-device coverage, and manual assistive-
technology validation remain separately gated.

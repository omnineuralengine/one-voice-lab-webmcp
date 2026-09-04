# Inclusive Design Acceptance Criteria

## Target and evidence boundary

ONE targets WCAG 2.2 AA behavior where applicable. Automated tests and local
inspection support Level 1–2 evidence; they do not establish complete
conformance or production verification.

Evidence vocabulary:

- **Level 1 — architecturally established:** typed contracts, documented
  behavior, source review, and static/local reasoning.
- **Level 2 — deterministically verified:** unit, interaction, browser,
  accessibility, responsive, ownership, provider, and build checks using local
  fixtures or repository tooling.
- **Level 3 — deployed/manual verified:** production configuration, real mobile
  devices, installed-PWA lifecycle, assistive technology, production cache/CDN,
  and deployed authentication behavior.

## Structural acceptance criteria

| ID | Requirement | Intended evidence | Current result |
| --- | --- | --- | --- |
| IA-01 | Primary navigation is capability-centered and has one consistent landmark/current-page model | Level 1 source review + Level 2 browser | **PASS — representative shell** |
| IA-02 | Provider discovery remains direct while provider branding does not own the application hierarchy | Level 1 neutrality review + Level 2 browser | **PASS — neutrality tests both yes** |
| IA-03 | Provider/model provenance and material uncertainty remain visible at every relevant depth | Level 1 content review + Level 2 UI tests | **PASS — Hub/profile/Evaluate** |
| AD-01 | Essential, Guided, Detailed, and Technical are typed presentation states; Guided is default | Level 1 types + Level 2 unit | **PASS — 8/8 adaptive unit** |
| AD-02 | The human can change depth with a labeled keyboard/touch-accessible control | Level 2 interaction/browser | **PASS — keyboard and touch-sized control** |
| AD-03 | A surface can reveal deeper detail without forcing a global preference change | Level 2 interaction/browser | **PASS — local disclosure tested** |
| AD-04 | Unknown/corrupt preference values fail safely to Guided | Level 2 unit | **PASS — strict bounded parser** |
| AD-05 | Depth changes do not alter actions, ownership, server policy, or authorization | Level 1 boundary review + Level 2 negative tests | **PASS — presentation-only invariant** |
| AC-01 | Landmarks, headings, labels, descriptions, and names/roles/values are meaningful | Level 2 automated + manual local review | **PASS — migrated representative flows** |
| AC-02 | Representative critical flows are keyboard operable in a logical order | Level 2 browser/manual local | **PASS — skip, depth, Hub, Evaluate** |
| AC-03 | Focus is visible and restored deliberately after disclosures, dialogs, async results, and destructive confirmations | Level 2 interaction/browser | **PASS — representative flows; full AT manual gated** |
| AC-04 | Errors are associated with controls and async status is announced without excessive repetition | Level 2 browser/accessibility | **PASS — bounded status/live regions** |
| AC-05 | State is not communicated through color alone and locally measured contrast meets applicable AA thresholds | Level 2 automated/local inspection | **PASS — labels plus state; complete manual conformance gated** |
| AC-06 | Reduced motion preserves essential status and interaction meaning | Level 1 CSS review + Level 2 browser | **PASS — CSS and preference regression** |
| AC-07 | Controls provide usable touch targets and pointer alternatives | Level 2 responsive/local inspection | **PASS — 44 px nav checks and keyboard paths** |
| AC-08 | Content supports browser zoom and narrow reflow without losing essential capability | Level 2 responsive/local inspection | **PASS — 320/390/768 deterministic reflow** |
| CG-01 | Necessary technical language receives accurate contextual explanation close to use | Level 1 content review + Level 2 disclosure test | **PASS — contextual disclosures** |
| CG-02 | Essential/Guided views preserve consequential limitations and uncertainty | Level 1 content review + Level 2 UI test | **PASS — uncertainty/provenance retained** |
| MB-01 | Small and large mobile layouts retain navigation and primary actions | Level 2 responsive browser | **PASS — 320/390/768** |
| MB-02 | Technical tables/raw data reflow or use bounded labeled scrolling | Level 2 responsive browser | **PASS — migrated evidence cohort** |
| MB-03 | Sticky navigation/actions do not obscure focused controls or results | Level 2 responsive browser | **PASS — representative small-mobile review** |
| ID-01 | Guest, signed-in, local-only, and account-owned states are understandable | Level 2 browser/auth fixtures | **PASS — Account/Settings and auth fixtures** |
| ID-02 | USER_A adaptive state cannot appear for USER_B | Level 2 identity/isolation tests | **PASS — transition generation and isolation** |
| ID-03 | Guest preference cannot silently overwrite account preference | Level 2 transition tests | **PASS — account precedence** |
| ID-04 | Logout removes account-derived adaptive presentation and returns to guest-safe state | Level 2 auth regression | **PASS — auth regression** |
| PW-01 | Identity-sensitive surfaces and responses remain excluded from unsafe service-worker caching | Level 1 worker review + Level 2 cache tests | **PASS — denylist/cache regression** |
| PR-01 | Provider, authentication, ownership/RLS, and evaluation regression suites retain the established deterministic baseline | Level 2 repository suites | **PASS — attributed baseline retained** |

## Keyboard and focus scenarios

Representative deterministic checks should cover:

1. skip/navigation entry and primary navigation order;
2. depth-control selection and announced state;
3. educational and technical disclosure open/close behavior;
4. provider filters and profile navigation;
5. Evaluate setup, validation error, running, result, and evidence disclosure;
6. guest/account controls, sign-out, export, and destructive confirmation;
7. focus restoration when a disclosure or dialog closes;
8. focus remaining visible when sticky mobile navigation is present.

## Responsive validation matrix

Representative local widths should include:

| Class | Reference width | Required inspection |
| --- | ---: | --- |
| Small mobile | 360 px | Navigation, forms, disclosures, sticky controls, overflow, touch targets |
| Larger mobile | 430 px | Same plus long labels, provider/evaluation cards, account state |
| Tablet / narrow desktop | 768 px | Navigation transition, two-column boundaries, dialogs, technical detail |
| Standard desktop | 1440 px | Hierarchy, line length, density, alignment, focus flow |
| Wide desktop | 1920 px | Maximum content width, excessive whitespace, scanning order |

These widths are deterministic representatives, not claims about every browser
or device. Orientation changes, virtual keyboards, safe areas, and installed-
PWA chrome still require appropriate manual/deployed checks.

## Visual review checklist

Inspect Home, primary navigation, Provider Hub, one provider profile, Compare,
Evaluate, Settings/Account, guest state, fixture-authenticated presentation,
loading, empty, error, technical disclosure, educational disclosure, and a
destructive confirmation where available.

Review for:

- clipping, overflow, hidden controls, or horizontal page scrolling;
- broken hierarchy, alignment, or reading order;
- too much or too little whitespace;
- unreadable technical content and unbounded data;
- card proliferation and repeated status noise;
- contrast, focus visibility, touch targets, and non-color state;
- sticky collisions and dialog overflow;
- provider-brand imbalance;
- information that disappears at lower depth or smaller width when it remains
  essential.

## Security and privacy acceptance

Adaptive UI must not introduce:

- browser-controlled ownership or client-side authorization;
- cross-human preference/history leakage;
- raw emails, tokens, credentials, or sensitive traits in analytics;
- provider secrets or privileged Supabase authority in browser code;
- unsafe HTML/remote content execution;
- weakened auth callback or redirect behavior;
- private response caching in the service worker;
- fabricated provider capability, health, price, quality, or evidence claims.

All eighteen adaptation invariants in
[`ADAPTIVE_HUMAN_INTERFACE.md`](./ADAPTIVE_HUMAN_INTERFACE.md) are blocking
acceptance conditions when applicable.

## Level 3/manual verification still required

the adaptive interface does not prove:

- complete WCAG 2.2 AA conformance;
- screen-reader behavior across supported browser/AT combinations;
- production color rendering, zoom, high-contrast, or forced-colors behavior;
- real-device mobile browser and virtual-keyboard behavior;
- installed-PWA install, resume, update, offline, and old-worker eviction;
- production OAuth/passwordless callback presentation;
- production CDN/cache, CSP, WAF, monitoring, or authentication behavior.

These checks must remain explicitly labeled as pending until separately
authorized and performed.

## Final evidence record

- automated accessibility: **PASS for the migrated deterministic surface;
  complete WCAG/AT conformance remains Level 3**
- keyboard/focus: **PASS — adaptive browser 4/4 plus established auth flows**
- responsive/mobile deterministic review: **PASS — 320/390/768 browser checks**
- desktop/wide deterministic review: **PASS — local desktop rendered review,
  1440 browser coverage, and existing 1920 layout regression coverage;
  comprehensive wide-screen/manual review remains Level 3**
- auth and ownership isolation regression: **PASS — 37/37 focused; all 15
  migrations, 7 pgTAP files/410 assertions, and 8 concurrency families pass**
- provider and Evaluate regression: **PASS — provider 153/153 unit and 9/9
  browser; Evaluate 58/58 unit and 4/5 browser with the established Windows
  download-stream failure**
- full unit/browser baseline: **806/809 unit with three established unrelated
  failures; 93 passed, 11 established failures, 6 intentional skips in the
  full browser suite**
- PWA cache boundary: **PASS — denylist, request checks, and manifest identity
  continuity reviewed; deployed worker lifecycle remains Level 3**
- typecheck/build/secret: **PASS — 89 generated routes/pages; secret audit
  passed across 720 source and browser-asset files**
- lint: **PASS at baseline — 0 errors and 3 established unrelated warnings**
- Level 3/deployed verification: **NOT PERFORMED**

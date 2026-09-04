# Synthetic Scenario Validation

Validated locally on 2026-07-28. Every organization, artifact, version, and
customer statement below is fictional. No live Deepgram, AI-provider, email,
upload, repository-sharing, or customer-system action occurred.

## Release evidence

- `npx playwright test tests/unit/solution-deliverables.spec.ts --config playwright.unit.config.ts`: 23/23 compiler and artifact-validation tests passed.
- `npm run test:deliverables`: 5/5 Chromium workflow tests passed, including
  Northstar, blocked Lighthouse, mobile layout, semantic commands, downloads,
  and capability truth.
- `npm test`: 306 unit tests and 40 configured browser regressions passed.
- Every final PPTX passed Open XML, slide-count, title, typography, bounded
  content, no-truncation, native-architecture, external-relationship, local-path,
  and secret checks.
- Representative Northstar Letter and Lighthouse A4 PDFs were rendered and
  visually reviewed. Final PDFs for all five fixtures were then re-generated
  and programmatically verified as non-empty, exactly one page, within bounds,
  source-grounded, and free of secret patterns.

## Scenario results

| Scenario | Expected outcome | Actual outcome | Artifact validation | Claim-safety result | Test result | Known limitation |
| --- | --- | --- | --- | --- | --- | --- |
| Northstar Appointments | Customer-ready booking architecture; browser capture and server authorization separated; unsafe credential evidence excluded; confirmation and idempotency retained | `customer-ready`; accepted five-node booking flow | Strict Mermaid and sanitized SVG; one-page PDF; 6-slide editable PPTX; source manifest; checksum-valid Solution Pack ZIP | Unsafe browser-key evidence excluded; accepted booking safeguards remain sourced | Passed | Temporary authorization and booking are synthetic boundaries, not live account validation |
| Harbor Contact Center | Media mismatch identified without assigning unsupported SDK blame; input alignment or explicit transcoding required | `customer-ready`; observed 8 kHz telephony/configuration conflict remains evidence-backed | Media-path Mermaid/SVG; one-page PDF; 6-slide PPTX; source manifest; valid ZIP | Observed formats, recommendation, and validation plan remain distinct | Passed | Audio-quality and latency results are planned measurements, not production results |
| Atlas Developer Platform | Prefer the observed SDK-generation mismatch over an unconfirmed release hypothesis | `customer-ready`; minimal repair and scoped validation path selected | Strict Mermaid/SVG; one-page PDF; 7-slide technical PPTX; source manifest; valid ZIP | No confirmed Deepgram defect is claimed; fictional release evidence remains qualified | Passed | Installed version and possible release match are intentionally fictional |
| Crescent Retail | Regional multilingual flow, lookup/mutation separation, confirmation, PII boundary, seasonal-scale qualification, and human fallback | `customer-ready`; accepted five-node regional retail flow | Regional Mermaid/SVG; one-page PDF; 6-slide executive PPTX; source manifest; valid ZIP | Capacity remains a validation assumption; mutation and privacy boundaries remain explicit | Passed | Language/model/region/account availability still requires current customer-specific verification |
| Lighthouse Financial | Customer Ready blocked; draft output only; no unsupported self-hosted model/release claim | `blocked` by retention contradiction and missing deployment evidence | Proposed Mermaid/SVG and one-page draft PDF validate; 6-slide draft/internal-review PPTX validates; customer PPTX and final Solution Pack downloads remain disabled | Proposed architecture stays proposed; unresolved retention, release, driver, and model evidence remains visible | Passed | Requires release identifier, driver/runtime evidence, model availability, retention resolution, and security approval |

## Artifact and browser observations

For every scenario, automated validation checked source IDs, safe Mermaid
directives, accessible sanitized SVG, one-page PDF parsing and bounds, PPTX Open
XML structure and expected slide titles, no external media relationships, safe
ZIP paths, required pack entries, SHA-256 manifest checksums, safe filenames,
and secret/local-path exclusion. The four customer-ready cases produced valid
customer Solution Packs; Lighthouse intentionally did not.

The production build was also inspected in the in-app browser with synthetic
Northstar and Lighthouse data. Northstar generated all 14 local artifacts and
exposed the validated customer pack. Lighthouse stayed visibly blocked while
allowing a labeled one-page draft. The 390 px browser regression reported no
horizontal overflow. No automatic API execution or external share occurred.

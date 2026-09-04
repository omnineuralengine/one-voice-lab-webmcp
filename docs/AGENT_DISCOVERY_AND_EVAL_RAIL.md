# Agent Discovery + Evaluation Rail V1

Last verified: 2026-08-19

## Purpose

The rail gives six client classes public views of the same provider and evaluation evidence:

- human users;
- normal search engines;
- AI search systems;
- accessibility-tree/browser agents;
- public API clients; and
- explicitly connected MCP clients.

It does not turn anonymous access into a provider execution surface, and it does not make this community project an official product of any listed provider.

```text
Human browser        Search / browser agent        MCP / API client
      \                       |                          /
       canonical provider + evaluation evidence layer
                              |
                 deterministic evaluation engine
                              |
                    evidence and provenance
```

The provider public records are projections of the typed provider manifests. Evaluation public records are projections of the existing Applied Voice deterministic scenario registry. Pages, public JSON, OpenAPI, and MCP do not maintain independent provider or evaluation IDs.

## Discovery plane

- Canonical URLs come from `NEXT_PUBLIC_CANONICAL_URL`, with the current Vercel deployment as a safe fallback.
- `/robots.txt` allows `OAI-SearchBot` and normal crawlers while disallowing `GPTBot`.
- `/sitemap.xml` includes the important static routes and every provider/evaluation record.
- `/llms.txt` and `/llms-full.txt` are public, generated summaries. `llms.txt` is an emerging convention, not a guaranteed discovery or ranking mechanism.
- Public pages have unique metadata, canonical links, Open Graph/Twitter summaries, server-rendered text, and real links.

To opt into GPTBot later, change the GPTBot rule in `src/app/robots.ts` from `disallow: "/"` to `allow: "/"`, run the SEO tests, review the generated `/robots.txt`, and redeploy. Search discovery and model-training crawling are independent choices.

## Evidence plane

- Semantic provider pages: `/providers` and `/providers/[provider]`.
- Semantic evaluation pages: `/evals` and `/evals/[eval]`.
- Method: `/methodology`.
- Agent guide: `/for-agents`.
- JSON-LD uses `WebApplication`/`SoftwareApplication`, `Dataset`, and `TechArticle` only where the visible content supports those types.
- Structured data contains no ratings, reviews, prices, awards, licenses, or benchmark claims that the repository does not support.

The public provider records are derived from the typed provider manifests, and the public evaluation records are derived from the typed deterministic scenario registry. UI pages, public JSON, OpenAPI, and MCP therefore share stable provider/evaluation IDs rather than maintaining separate truth sources.

The evidence vocabulary preserves distinct claim boundaries:

- **Repository verified**: implementation evidence exists in this repository. It does not prove account behavior, latency, accuracy, quality, compliance, or production readiness.
- **Provider documentation verified**: a dated official provider documentation reference supports the claim; it is not a Lab measurement.
- **Measured**: a dated observation made under a disclosed fixture, configuration, and environment.
- **Assumption**: a proposition requiring validation, not an established fact.
- **Experimental**: a bounded exploration that is not a production-readiness claim.
- **Simulated**: a deterministic local fixture, not a provider measurement.

Only providers and capabilities present in the canonical repository registry are published. Planned extension points are not described as implemented integrations.

## Interaction plane

Public API:

- `GET /api/public/v1/lab`
- `GET /api/public/v1/providers`
- `GET /api/public/v1/providers/[provider]`
- `GET /api/public/v1/evals`
- `GET /api/public/v1/evals/[eval]`
- `POST /api/public/v1/evals/[eval]/run`
- `GET /api/public/v1/methodology`
- `GET /openapi.json`

Read responses are short-cache, versioned JSON envelopes validated with Zod. The synthetic run is `no-store`, accepts no body, and selects only a repository-owned fixture by stable slug.

Remote MCP is mounted at `/mcp` with the official TypeScript server package and stateless HTTP handling. It exposes:

- `voice_lab.list_providers`
- `voice_lab.get_provider`
- `voice_lab.list_evals`
- `voice_lab.get_eval`
- `voice_lab.get_methodology`
- `voice_lab.compare_providers`
- `voice_lab.run_synthetic_eval`

The compare tool reports registry evidence and integration state; it does not rank quality. The synthetic tool accepts only an existing evaluation ID. MCP provides standardized interaction once connected; it does not guarantee universal automatic agent discovery.

The discovery rail uses native links, buttons, headings, lists, tables, details/summary, status regions, meaningful accessible names, and visible focus styling. Navigation and the synthetic action are keyboard-operable and deterministic. The existing command-palette, keyboard-shortcut, and keyboard shortcuts keyboard-shortcut systems remain intact where applicable; the browser remains authoritative and keyboard shortcuts hardware is never required.

These accessibility choices also make browser-agent interaction more deterministic through roles and accessible names. They do not claim universal compatibility with every browser agent.

## Evaluation plane

The existing Applied Voice scenarios provide stable fixtures, expected behavior, deterministic rules, and marked human-review criteria. V1 publishes fixture version/hash, environment, task, eligibility, configuration, metrics, limitations, evidence, dates, and provenance where defensible.

The public runner returns assertion outcomes and a trace summary without raw audio. It deliberately publishes no provider measurement because no equivalent cross-provider run exists.

Interpretation rules:

1. One fixture cannot prove universal superiority.
2. Comparisons require equivalent inputs, configurations, and acceptance criteria.
3. Results are point-in-time observations.
4. Latency depends on the client, network, region, buffering, orchestration, and provider environment.
5. Transcript quality and business-outcome quality are not equivalent.
6. Synthetic results do not prove production behavior.
7. Production decisions require representative customer testing and human review.

## Safety plane

- `DEEPGRAM_API_KEY` stays in server-only environment settings and existing guarded routes.
- Public provider projections expose only a configuration boolean, never variable names or values.
- Public API, OpenAPI, MCP metadata, JSON-LD, sitemap, and agent documents contain no credential values.
- No anonymous rail route imports or invokes provider adapters.
- No public route accepts arbitrary uploads, remote URLs, code, customer content, prompts, or transcripts.
- Live and billable provider actions remain outside the discovery rail and are controlled separately by the existing Open Lab/provider switches and browser confirmation flows.
- Environment-variable names may be documented, but secret values must never be written to the repository.

The rail itself cannot cause provider spend. The wider Open Lab intentionally permits anonymous live-provider use when both Open Lab mode and the Deepgram execution switch are enabled. Existing browser flows make execution explicit to a human, but the server routes do not universally authenticate that a request originated from the visible browser confirmation. Rate, concurrency, and same-origin controls also vary by route. Treat those as current operational limits, not as comprehensive public-abuse protection.

If public live evaluation is ever introduced, add authentication, explicit authorization, rate limits, hard budgets, provider quotas, concurrency limits, request-size limits, timeouts, cancellation, a kill switch, audit trails, SSRF protection, content bounds, and privacy/consent controls before exposing it.

## Privacy-conscious provenance analytics

Vercel Analytics continues to collect normal aggregate page views, including recognized referral and UTM attribution supported by Vercel. The rail adds a single `agent_rail_view` browser event with only a surface category and stable public record ID. Public API and MCP events contain only an operation category and are sent without request headers. No raw prompt, transcript, URL query, credential, IP-derived custom property, or fingerprint is added.

To review likely AI-search traffic without personal profiling, compare aggregate referrer domains, landing pages, and intentionally assigned UTM campaign values. Use source-level totals rather than attempting to identify individual people or agents.

## Current status

Implemented now:

- Canonical helper, metadata, robots, sitemap, public semantic routes, JSON-LD, agent documents.
- Shared public provider/evaluation projections and methodology.
- Versioned public API and OpenAPI.
- Stateless read-oriented MCP plus deterministic synthetic evaluation.
- Keyboard/browser-agent journey and focused consistency/security tests.
- Privacy-limited view/API/MCP event categories.

Tested now:

- On 2026-08-19, 12 focused Agent Rail unit/security tests, two keyboard/browser-agent tests, 11 provider registry/dispatch tests, four provider browser tests, and 30 Open Lab tests passed without live provider traffic. Typecheck and the production build passed. The repository secret audit passed across 414 source and browser-asset files.
- Lint completed with no errors and three warnings in pre-existing Live Solution Studio files outside this release diff.
- The 2026-08-19 release review traced public rail imports and added a regression assertion that the rail does not import the Deepgram executor, provider adapters, or the permanent-key environment lookup.
- The same review bounded lengthless/chunked MCP request bodies at 128 KiB; the original implementation enforced this limit only when `Content-Length` was present.

Production configuration:

Required variable names:

```text
DEEPGRAM_API_KEY
OPEN_LAB_MODE
OPEN_LAB_DEEPGRAM_ENABLED
NEXT_PUBLIC_CANONICAL_URL
```

The intended non-secret Production settings are:

```text
OPEN_LAB_MODE=true
OPEN_LAB_DEEPGRAM_ENABLED=true
NEXT_PUBLIC_CANONICAL_URL=https://one-voice-lab.vercel.app
```

Do not read, print, or write the value of `DEEPGRAM_API_KEY` into repository files. `one-voice-lab.vercel.app` is the canonical Vercel hostname; the prior hostname is retained only as a permanent continuity redirect.

A read-only Vercel CLI inspection on 2026-08-19 reported `DEEPGRAM_API_KEY`, `OPEN_LAB_MODE`, and `OPEN_LAB_DEEPGRAM_ENABLED` as present for Production and Preview. It did not read their values. `NEXT_PUBLIC_CANONICAL_URL` was not visible in that inspection, so its configured presence and scope still require manual confirmation in the Vercel dashboard before release.

Configuration still required outside the repository:

- Repair or confirm the GitHub Login Connection and Vercel project/team access for the intended commit-author account. The Preview for `f6a05e3` was blocked because GitHub mapped its author to a different account that Vercel did not recognize as having project access.
- Obtain a successful Preview, review it, and then explicitly approve a merge to the configured Vercel production branch. No Production deployment is recorded by this document.
- Confirm `NEXT_PUBLIC_CANONICAL_URL` exists in the intended Vercel scopes and uses the current HTTPS hostname.
- Complete custom-domain, Search Console, and indexing work when a custom domain is selected.
- Connect an MCP client explicitly to the deployed `/mcp` URL if MCP use is desired.

Dependency review on 2026-08-19:

- The clean install initially reported eight package-level advisories: five high and three moderate.
- Narrow compatible lockfile updates remediated the `brace-expansion`, `js-yaml`, `nanoid`, and `postcss` findings without a framework upgrade.
- Two high package-level advisories remain in the production tree: `image-size`, and direct dependent `pptxgenjs`. No patched `image-size` release was available during the review. The repository's current PowerPoint generator uses shapes and text and does not invoke the affected image decoders, so the vulnerable path was not found reachable in current runtime code. The advisories still exist and must remain visible in release decisions.
- No advisory originated in the MCP dependency tree.

Future work:

- Add founding provider adapters only after repository evidence and execution controls exist.
- Add equivalent provider fixtures/configurations and dated measured results before cross-provider quality claims.
- Add production live-eval controls only behind authentication, budgets, quotas, consent, and human authorization.
- Consider IndexNow after a custom domain and publication cadence are established.

## Custom-domain migration checklist

1. Add the custom domain to the Vercel project.
2. Set `NEXT_PUBLIC_CANONICAL_URL` to the final HTTPS origin in Vercel Production.
3. Configure the Vercel deployment domain as the appropriate redirect or alias.
4. Verify HTTPS and certificate issuance.
5. Inspect canonical tags on the home, provider, evaluation, methodology, and agent pages.
6. Verify every URL in `/sitemap.xml` uses the custom origin.
7. Add and verify the site in Google Search Console.
8. Submit `/sitemap.xml`.
9. Request indexing for the primary pages.
10. Configure Bing Webmaster Tools and optionally IndexNow if useful.
11. Preserve redirects so old Vercel URLs resolve to equivalent canonical pages.
12. Test that OAI-SearchBot can fetch public HTML and required CSS/JavaScript resources.

None of the DNS, Search Console, Bing, or indexing steps are completed by this repository change.

## Claim boundaries

- **Implemented** means the repository contains the described route, registry projection, tool, or deterministic evaluator.
- **Tested** means the focused rail tests, build, and repository secret audit exercised the committed implementation.
- **Configuration required** covers deployment linkage, explicit MCP client setup, search-engine registration, and later domain ownership work.
- **Future/experimental** covers additional provider adapters, equivalent cross-provider measurements, production live-eval controls, and optional IndexNow integration.

This repository does not claim universal search indexing, guaranteed AI-search discovery, automatic MCP connection, provider superiority, production readiness for experimental features, or capabilities for providers absent from the canonical registry.

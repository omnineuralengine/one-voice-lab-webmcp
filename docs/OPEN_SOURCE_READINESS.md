# Open-Source Readiness

Status date: 2026-08-14

## Current-tree privacy status

**Pass for the deployable working tree.** Person-specific reviewer routes, API handlers, registries, assets, packages, scripts, tests, and documentation were removed. The retired page and API paths are covered only by negative tests that require them to remain unavailable. Known reviewer-name, strong phone-number, legacy-path, and non-reserved email scans found no deployable-tree findings. Synthetic email fixtures use reserved example domains.

## Git-history privacy status

**Blocked for public release.** Deleting current files does not remove prior Git objects. Legacy reviewer material remains reachable in history under the sanitized path family `share/<redacted-reviewer-package>/**` and related retired documentation or scripts. A retired public-profile context also remains in historical source/test objects.

Affected commits identified by the path/content audit:

- `f6017b4c206c357088cd1424b97a5c0c6d6f9b26`
- `8e31c3fc0912dc96799e764660feb9899bb87c93`
- `7b56c9afd3d3498bc9fe822feea6217c0f1ded1d`
- `2df61df0c4428639fe869dd3781c27c47b76d52d`
- `0f54501b248b2137bab52142c1ec77ca1720e7b8`

Repository visibility must remain private until a coordinated history cleanup and clean-clone verification are complete.

## Secret-audit status

- `.env.local` is ignored, untracked, unstaged, and absent from Git history.
- No non-example environment file was found in Git history.
- Current-tree secret auditing passes when run through `npm run audit:secrets`.
- Historical obvious-secret-format matches were confined to deliberate sanitizer test fixtures; documented provider-key assignments had placeholder shape. No active credential was identified by this audit.
- If any future manual review identifies a real historical credential, revoke or rotate it before any deployment or visibility change. Do not rely on history removal alone.

No values, fragments, lengths, fingerprints, prefixes, or suffixes are recorded here.

## Third-party asset status

No provider logo was added for the Provider Rolodex; providers use text labels. Person-specific reviewer assets are absent from the deployable tree. Existing third-party product names and previously documented sample provenance do not imply endorsement or brand approval and still require owner review before public release.

## Provider-claim status

Deepgram is the Featured Provider and deepest current integration. Its capability states are tied to current repository evidence and do not establish production readiness or account entitlement. ElevenLabs and Fish Audio have bounded, unequal Partial API Studio prototypes for normalized catalogs, prerecorded STT, and TTS behind server-only credentials and explicit actions. Mocked tests do not establish live account entitlement, quality, latency, pricing, compliance, availability, or production readiness. Fish Audio remains configuration-required until its key and a deliberate live smoke test are completed.

## License status

No open-source license is present. The repository may be source-visible without a license, but it is not meaningfully open source because reuse rights have not been granted. License selection requires explicit owner approval.

## Remaining blockers

1. Preserve a private backup and coordinate a maintenance window with every collaborator.
2. Build an explicit `git filter-repo` path/content removal specification for the legacy reviewer path families and validate it against a disposable mirror clone.
3. Obtain owner approval before rewriting shared history. This change must not be performed automatically.
4. Force-push rewritten refs only as a coordinated owner action, then require fresh clones and invalidate stale forks or cached artifacts where possible.
5. Repeat privacy, secret, asset, and claim audits from a clean clone across every retained ref.
6. Select a license only with explicit owner approval.
7. Keep GitHub visibility private until all gates pass.

## Recommended next action

Keep the repository private. Review this report with the owner, prepare and test the history-rewrite specification in a disposable mirror, and schedule the coordinated cleanup. A private deployment may continue when the current deployable tree is clean and no active credential is known to have been exposed.

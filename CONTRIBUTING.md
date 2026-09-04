# Contributing

Thank you for improving the community-built Applied Voice Lab. This repository values small, evidence-backed changes that preserve user agency, local operation, and credential isolation.

## Before changing code

1. Read `AGENTS.md`, `README.md`, `SECURITY.md`, and the relevant module documentation.
2. Use the existing package lock and run `npm ci` for a clean checkout.
3. Keep permanent provider credentials in ignored local or deployment secret stores. Never place them in Git, browser code, tests, examples, URLs, logs, or screenshots.
4. Treat the status vocabulary as product truth: Working, Prototype, Demo-only, Partial, or Planned.

## Implementation expectations

- Prefer focused typed modules and explicit policy over broad abstractions.
- Preserve compatibility routes unless a separately reviewed migration removes them.
- Keep live or billable actions explicit. Automated tests must use fixtures or mocks.
- Add provider capabilities only when repository evidence supports them. Follow [Adding a Provider](docs/ADDING_A_PROVIDER.md).
- Do not add third-party personal information or assets without a clear purpose, authorization, and provenance.
- Do not describe the Lab as an official product or provider roadmap.

## Validation

Run the checks relevant to the change, then the full gates before requesting review:

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm test
npm run build
npm run audit:secrets
```

Document any manual or live-provider validation separately. A passing build is not production certification.

## Pull requests

Keep commits scoped, describe evidence and limitations factually, and identify any deployment or data-migration requirement. Never bypass required reviews or branch protection. This repository currently has no open-source license; contributions do not change that status.

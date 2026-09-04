# Adding a Provider

The user-facing **Provider Rolodex** is backed by an internal typed **Provider Registry**. Execution is implemented through capability-specific provider adapters. Do not create a single lowest-common-denominator provider interface.

## Smallest safe implementation

1. Add a stable provider ID to `src/lib/providers/types.ts`.
2. Add a manifest under `src/lib/providers/<provider>/manifest.ts`.
3. Register the parsed manifest in `src/lib/providers/registry.ts`.
4. Keep the provider Planned, live-disabled, and adapter-free until one bounded capability is implemented and tested.
5. Add only the capability-specific adapter and fixed server route required for that slice.

## Manifest requirements

A manifest may contain safe metadata only:

- stable ID and display name;
- one approved status: Working, Prototype, Demo-only, Partial, or Planned;
- neutral description and explicit limitations;
- capabilities supported by current repository evidence;
- relevant Lab modules;
- server environment-variable names, never values;
- evidence state;
- live-execution and adapter-presence booleans.

Being listed does not mean configured, adapter-backed, live-enabled, generally available, equivalent to another provider, or production-ready.

## Adapter contracts

Define a narrow interface for the capability, such as TTS. The server dispatcher must resolve a registered provider, verify the requested capability and adapter, confirm registry execution policy, and only then invoke the adapter. Unknown, Planned, disabled, or unavailable providers fail closed with a typed sanitized error. No route may accept an arbitrary upstream URL or Authorization header.

For the Evaluate workspace, a TTS adapter also declares a stable adapter version, accepts an optional caller `AbortSignal`, and returns monotonic first-audio/completion durations plus exact UTC request, first-chunk, and stream-completion anchors captured at the same server adapter boundary. Optional `checkHealth` and `estimateCost` seams are available; omit cost unless the pricing source, effective date, formula, and units are reviewed and versioned. Provider-specific validation remains inside the adapter. The comparison executor owns bounded concurrency, timeouts, independent result states, evidence construction, and partial-failure preservation.

When the provider supports the Phase 1 standardized target, request signed 16-bit little-endian mono PCM at 24 kHz and validate it before the shared WAV wrapper. If that format or another setting cannot be matched honestly, declare the limitation and keep the control in provider-optimized mode. Do not silently transcode an unsupported request and call it equivalent.

A catalog is either discovered through an official adapter endpoint or supplied as an explicit versioned allowlist grounded in current official documentation. Fixture catalogs must be labeled as fixture data and cannot imply current account entitlement. Merely opening Evaluate must never trigger provider traffic.

## Credentials and configuration

Permanent credentials are server-only and must never use `NEXT_PUBLIC_*`. Add placeholder names to `.env.example` only when an implementation reads them. Never put values or fragments in manifests, responses, client props, browser storage, generated code, tests, snapshots, logs, or documentation.

Configuration detection returns only:

```ts
{ providerId: "registered-id", configured: true }
```

Do not return a suffix, prefix, length, fingerprint, or other recoverable signal.

## Routes and failure behavior

- Accept only allowlisted provider IDs.
- Preserve established provider-specific compatibility routes when practical.
- Reuse existing validation, request limits, timeouts, explicit-run gates, and inspector sanitization.
- Do not silently fall back from a selected provider to another provider.
- A Planned provider returns `provider_not_implemented` without network activity.
- Missing configuration fails safely without disclosing variable values.

## Evidence and claims

Every capability, model, language, lifecycle, latency, pricing, availability, quality, compliance, or production claim needs appropriate current evidence. Fixtures prove application behavior only. Provider documentation does not prove account entitlement or deployed behavior. If evidence is absent, omit the claim and keep the capability Planned or unavailable.

## Required tests

- registry IDs are unique and status values are valid;
- the intended provider is registered with truthful metadata;
- unknown and unavailable providers fail closed;
- Planned providers never invoke the network;
- configuration output is boolean-only;
- serialized metadata contains no credential value;
- adapter dispatch remains allowlisted and bounded;
- compatibility routes still work with provider calls mocked;
- validation and request-size limits remain active;
- Authorization data is redacted;
- Rolodex status, actions, keyboard access, mobile layout, and limitation copy are truthful.
- adapter version, cancellation propagation, first non-empty audio timing, and malformed/oversized audio behavior are deterministic;
- Evaluate fixture mode cannot reach the network;
- one provider failure does not erase another provider's evidence;
- exported evidence contains the exact provider/model/voice/configuration but no credential, header, cookie, internal URL, raw payload, or embedded audio.

Before moving a provider from Planned to Working, complete the manifest, one reviewed adapter, fixed server routing, configuration documentation, non-billable automated coverage, an explicit manual validation record where needed, security review, and deployment verification. The change must not imply parity or provider endorsement.

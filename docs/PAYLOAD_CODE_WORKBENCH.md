# Payload & Code Workbench

Payload & Code Workbench is a collapsible technical-evidence surface inside Live Solution Studio at `/live-solution-studio`. It accepts JSON, JSONL, cURL, JavaScript/TypeScript, Python, raw HTTP, API responses, errors, and logs without executing them.

## Data and safety boundary

- Detection, parsing, formatting, redaction, endpoint matching, validation, and code-variant generation are deterministic and run locally in the browser.
- The unredacted paste is held only in ephemeral React state. It is never written to local storage, session storage, a URL, analytics, exports, or API Lab handoff state.
- Session persistence validates the artifact schema and stores `rawInput: null` plus redacted representations only.
- Copy and export actions default to redacted content. Redaction is deliberately described as requiring human review rather than infallible.
- Local file references are identified by filename but are never opened. Code, shell commands, URLs, audio, and API requests are never executed automatically.
- API Lab receives a one-use, schema-validated handoff containing only fields supported by the selected endpoint registry entry. Authentication is replaced with `${DEEPGRAM_API_KEY}` and the existing API Lab confirmation remains authoritative.

## Detection and analysis

Structural parsers run before heuristic signals. Valid JSON and JSONL are parsed directly; request-like artifacts are normalized into method, URL, path, headers, query, body, content type, environment-variable references, and local-file references. Deepgram endpoint families and supported fields come from the existing endpoint registry rather than a second catalog.

The analysis keeps four concepts separate:

- observed values from the artifact;
- deterministic validation findings;
- inferred request shape or intent;
- recommendations that still require confirmation.

The user can override detected type or language. Suggested repairs and generated variants are separate from the original and are never silently applied.

## Official documentation

Documentation search is explicit. The workbench constructs a bounded technical query from the redacted normalized request, confirmed problem, selected lanes, stack, and technical constraints. It never submits the raw artifact or transcript. The existing server-only Deepgram Docs provider performs retrieval and returns validated official evidence or an honestly labeled curated fallback.

The user sees the exact outgoing query before choosing **Search official docs**. Only HTTPS pages on the supported official Deepgram documentation host are attached to an artifact.

## Session, export, and API Lab integration

Attached artifacts live on the existing `StudioProblem` record and are included in the existing field-brief Markdown/print flow only when **Include in export** is enabled. Exported technical evidence contains the redacted example, observed method/endpoint/model, deterministic validation, optional takeaway, and attached official references. Customer context, private notes, the original paste, credentials, and hidden UI state are excluded.

**Send redacted request to API Lab** transfers supported normalized parameters through session storage and internal router navigation. Unsupported headers, shell variables, file references, and ambiguous fields remain visible as “Not transferred.” The action never runs the request, starts a microphone, creates a token, uploads a file, or bypasses Demo Mode and billable-action confirmation.

## Extension points

Add deterministic formats in `src/lib/payload-code-workbench.ts`, extend the Zod contract in `src/types/payload-code-workbench.ts`, and reuse endpoint/code-generation registries for provider-specific behavior. Keep original material ephemeral, preserve redacted-only serialization, and add a regression test for every new secret pattern or transferable field.

# Solution Deliverables Studio

`/deliverables` compiles the active `live-solution-case-v1` into validated
`solution-deliverables-v1` artifacts. It is deterministic by default. Generation
does not call an AI provider, a Deepgram API, an email service, or an external
sharing service.

## Readiness is separate from generation

The readiness engine reports `exploratory`, `draft`, `reviewable`,
`customer-ready`, or `blocked`. A technically successful generation never
promotes readiness.

Customer-facing profiles use active, non-superseded items that are explicitly
approved for customer export. Private-only and do-not-claim content is excluded.
Accepted decisions take precedence; proposed decisions stay proposed. Validation
results remain scoped to their tested environment, and possible release findings
retain qualified wording.

Blocked cases may produce an internal review draft. They cannot produce a valid
customer Solution Pack or a misleading customer-ready presentation.

## Generated artifacts

- strict Mermaid source and a sanitized SVG representation;
- a one-page Letter or A4 PDF and Markdown brief;
- an editable PPTX with an embedded architecture asset;
- presentation storyboard and speaker/source notes in Markdown;
- a profile-aware source and provenance manifest;
- a concise internal reviewer brief;
- a checksum-bearing customer Solution Pack ZIP; and
- an optional, redacted case export that is off by default.

Binary generation runs in the Node-only
`/api/deliverables/generate` route with system fonts and no remote images. The
route validates PDF page count and layout, PPTX Open XML structure, ZIP paths and
checksums, filenames, Mermaid safety, claim safety, secret patterns, and local
path patterns before marking an artifact valid. Download controls remain
disabled for unavailable, stale, or invalid artifacts.

## Manual edits and provenance

The Studio supports bounded edits to the artifact title, executive summary,
section wording, slide titles, slide takeaways, open questions, next actions,
and Mermaid source. It preserves the source-generated content separately and
marks edited output as user-edited. Every generation re-runs the edit audit,
secret scan, Mermaid validation, claim audit, and artifact validation.

A newly written substantive statement does not become evidence. Unsupported
manual wording remains a qualified user-edited draft, while secret-shaped or
local-path content blocks generation.

## Export history

The History tab stores only local generation metadata: timestamp, profile,
readiness, source case revision, and artifact count. It does not store customer
names, artifact text, transcripts, source excerpts, or generated binaries. The
operator can clear this metadata explicitly.

## Solution Pack boundary

The customer ZIP contains only selected validated artifacts. It does not contain
transcripts, raw audio, environment files, credentials, hidden files, Git data,
or internal reviewer material. The optional case export uses an allowlisted,
recursively redacted projection rather than serializing the active browser
bundle.

## Current limitations

- PDF text is selectable and structurally organized, but the file is not a
  tagged PDF/UA document.
- PNG architecture export is not offered.
- Editing is bounded; the browser is not a free-form slide-layout editor.
- Generation works without an external network or AI provider, but PDF, PPTX,
  and ZIP creation requires the local or hosted Next.js server route.
- Browser download is explicit; the Studio does not email, upload, publish, or
  externally share artifacts.
- Synthetic validation does not prove live Deepgram account behavior, customer
  acceptance, or production deployment readiness.

# Nova-3 Language Workbench

Language Explorer turns a supported-language catalog into an executable configuration workflow: select a language, inspect the exact parameters, compare alternatives, and carry the configuration into another module.

The workbench answers four practical questions: which verified language code to start with, what exact Nova-3 configuration it produces, when the repository's verified multilingual mode is a relevant alternative, and which existing lab workflow can accept the configuration.

## Verified data boundary

The source of truth is `src/lib/deepgram-languages.ts`. Its catalog records the exact language codes already verified for this project, compatible model/transport metadata, the internal verification date, and the official documentation URL used during that verification. The workbench does not fetch or infer additional support at runtime.

The repository currently verifies multilingual mode only for the language list exported as `DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES`. A language outside that list is not silently replaced with `multi`. Regional values such as `en-US`, `en-GB`, and `fr-CA` remain distinct configuration values.

## Workbench behavior

- Search matches verified display names, exact or partial codes, base-language names, and stored regional labels.
- The selected-language panel explains model, mode, compatible lab workflows, regional relationship, cautious recommendations, and current data caveats.
- Query, JSON, TypeScript, Python, and binary-audio cURL snippets use `YOUR_DEEPGRAM_API_KEY`, never a real credential.
- The explicit-versus-multilingual section is configuration guidance, not a benchmark result. It makes no accuracy guarantee.
- Applied Engineering notes describe a validation plan based on representative recordings, regional audio, domain terms, latency, and observed error patterns.

Recently used state contains at most five `{ code, usedAt }` records in browser local storage. Last-applied state contains only a code, destination, and timestamp. Neither store accepts audio, transcripts, request bodies, tokens, or credentials.

## Reviewed sample text

The initial curated fixture set covers English, Italian, Spanish, French, German, and Portuguese. Each sentence is short, neutral, project-authored text with a plain-English meaning. It is reviewed for this lab fixture but is not presented as native-speaker or certified translation evidence. Other supported languages remain fully usable and display “Reviewed sample text not yet included.” A sample-text handoff appears only when the project also has an approved matching Aura voice; Portuguese remains copy-only because the current local Aura catalog does not expose a Portuguese voice.

## Accessibility and safety

The search input is labelled and supports Arrow Up/Down, Enter, and Escape. Language choices expose full names and codes through their accessible labels, and selected state includes text as well as styling. Copy results use a live status. All handoffs and generation actions remain available as visible buttons.

No language selection, snippet copy, sample-text handoff, or module handoff runs a Deepgram request, requests microphone permission, uploads audio, or starts playback.

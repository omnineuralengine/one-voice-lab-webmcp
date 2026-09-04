# Language Configuration Handoff

Language handoffs are small, local state transitions. They carry only the verified Nova-3 model and language code, navigate after a visible user action, and leave execution to the destination's existing Run or Start control.

| Destination | Applied state | Explicitly not performed |
|---|---|---|
| Transcribe URL | `model=nova-3`, selected language, manual language mode | No transcription |
| Upload Audio | selected language, known-language mode | No file selection, upload, or transcription |
| Live Mic | selected language or verified `multi` mode | No permission request, token request, socket, or capture |
| API Studio | verified `stt-prerecorded` operation, `model=nova-3`, selected language | No request validation or execution |
| Text to Speech sample | reviewed text and the existing approved Aura default for that base language | No TTS request or playback |

Each destination shows an “applied” message that also states that nothing ran. API Studio merges the two applied parameters into its existing endpoint defaults. If current metadata says a target transport is incompatible, the handoff is blocked instead of substituting another endpoint or language.

## Multilingual mode

`language=multi` is carried only as the verified configuration already present in the project. The workbench does not construct undocumented parameter combinations. Use explicit language codes when the primary language is known; consider `multi` for mixed or unknown inputs only within the repository's verified multilingual boundary. Validate both choices against representative recordings before adopting a production default.

## Persistence and privacy

Handoff state does not contain credentials, Authorization values, audio, transcript text, or raw requests. Recent-language storage is capped at five code/timestamp records. Target modules keep their existing server credential isolation, reviewer gates, and explicit execution controls.

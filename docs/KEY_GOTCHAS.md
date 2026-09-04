# Key Gotchas

## Realtime authentication

The permanent `DEEPGRAM_API_KEY` remains server-only. `/api/deepgram/token` calls Deepgram's official `/v1/auth/grant` endpoint with server-side `Authorization: Token …` and returns only `access_token` and `expires_in`.

Browser WebSockets authenticate a temporary token with two ordered subprotocol values:

```text
["bearer", "<temporary access_token>"]
```

Do not combine these into one string, add an Authorization header from browser JavaScript, log either credential, or reuse a token from a previous Start.

## Protocol sequencing

- `onopen` must fire before any Settings, Configure, or text/config message is sent.
- Voice Agent waits for `SettingsApplied` before requesting microphone access.
- Flux waits for `ConfigureSuccess` before requesting microphone access.
- TTS and Voice Agent playback waits for binary audio data.
- A new Start owns one socket and one session event list. Duplicate Start is disabled while active.
- Stop and failure paths close sockets, tracks, input contexts, and output contexts explicitly.

## Diagnostics

- A browser error event contains little detail. Preserve the event type, socket readyState, close code/reason, and last successful state.
- Code 1006 does not prove authentication failure. Treat the root cause as unknown unless a server diagnostic or Deepgram event supplies evidence.
- A request ID is useful correlation data and safe to retain. A token is not.
- Automated fixtures must replace the token route and WebSocket. They must never contact Deepgram.

# Realtime Event Model

API Studio uses `RealtimeSessionState` from `src/lib/api-studio/realtime-session.ts` for Live STT, Flux, Streaming TTS, and Voice Agent. A new Start creates a new session ID and an empty event list, preventing events from a previous socket from contaminating the next session.

## Canonical milestones

The complete vocabulary is:

1. Token requested
2. Token received
3. Socket opening
4. Socket opened
5. Settings sent
6. Settings accepted
7. Audio started
8. First transcript
9. Agent response
10. Playback started
11. Playback completed
12. Stop requested
13. Socket closing
14. Socket closed
15. Failure

The reducer blocks out-of-order milestones. For example, Voice Agent and Flux cannot record Audio started until Settings accepted or Configure accepted has been recorded. Raw protocol events do not advance the state machine.

## Protocol differences

| Protocol | Configuration milestone | Audio milestone | Transcript/response | Playback |
| --- | --- | --- | --- | --- |
| Live STT | Not applicable | First microphone chunk sent | First non-empty transcript | Not applicable |
| Flux | Configure sent / Configure accepted | Capture after ConfigureSuccess | First transcript; turn messages remain raw events | Not applicable |
| Streaming TTS | Text/config sent; acceptance is not applicable | First binary audio received | Not applicable | Starts only after binary audio exists |
| Voice Agent | Settings sent / Settings accepted | Capture after SettingsApplied | First user transcript, then agent response | Starts only after binary audio exists |

Non-applicable categories are displayed as **Not applicable**. They are never inserted as successful events.

## Last successful state

Only a canonical milestone with `status: "success"` advances `lastSuccessfulState`. Active, informational, warning, raw, close-1006, and failure records do not overwrite it. This keeps the last confirmed boundary visible after a later error.

Each record includes an ISO timestamp, source, protocol, status, summary, optional request ID, and optional close diagnostics. Resource snapshots track socket readyState, microphone activity, and playback activity; the failure record retains the pre-cleanup snapshot while the current status returns resources to idle after cleanup.

## Flux Conversation Observatory event model

The standalone `/flux-observatory` route does not overload API Studio's generic
milestone state. It uses `flux-observatory-v1`, a typed provider/local event
union, and a connection-generation-safe reducer shared by Synthetic Replay and
Live Provider Mode.

Provider messages normalized by this pipeline are `Connected`,
`ConfigureSuccess`, `ConfigureFailure`, `Error`/fatal error, warning, and
`TurnInfo` with `Update`, `StartOfTurn`, `EagerEndOfTurn`, `TurnResumed`, or
`EndOfTurn`. Unknown and malformed messages become sanitized inspectable events
without changing turn state. Duplicate messages are suppressed and late events
from an obsolete connection generation are ignored.

Configure request, success, and failure are separate records. The active
configuration changes only after an acknowledgement; rejection keeps the prior
acknowledged configuration. Local lifecycle records cover credential, socket,
microphone/audio, queue measurement, expiry, reconnect, stop, close, and
cleanup boundaries, but do not pretend to be provider events.

See [Flux Conversation Observatory](FLUX_CONVERSATION_OBSERVATORY.md).

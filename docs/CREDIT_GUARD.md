# Observatory Credit Guard

Credit Guard keeps live demonstrations deliberate and bounded at browser and local-server boundaries.

## Enforced defaults

- Concurrent Observatory Deepgram operations: 1
- Live STT: 60 seconds
- Voice Agent if enabled later: 120 seconds
- Uploaded audio: five minutes when browser metadata is available; 64 MB fallback
- TTS: 500 characters
- Voice Loop: 200 characters and one sequential run
- Automatic inference retry: disabled
- Background polling, scheduling, hidden prefetch, request loops, and load testing: unavailable

Live activation alone executes nothing. Every operation displays its model/configuration, expected input, billable-request count, and local limit before **Run live demo** becomes the final confirmation.

## Stop contract

Stop invalidates the active run, stops microphone tracks and `MediaRecorder`, closes WebSockets, aborts fetches, stops playback, clears the hard-stop and delayed-cost timers, and prevents work from the stopped run. Generated TTS audio is explicitly deleted; the existing five-minute server TTL remains a fallback.

## Cost lookup

When read-only Management access is enabled, a completed request receives at most one immediate cost lookup and one delayed five-second retry when accounting is pending. Further lookup is manual. This release does not calculate local price estimates or subtract from a hardcoded balance.

# API Studio Learning Path

Work through the console from low-risk discovery toward realtime systems. Every billable step requires an explicit click.

1. **Verify the boundary.** Open API Studio and run “Check API key status.” Confirm configured, authenticated, server-isolated, browser exposure clear, project/capabilities, global region, and live execution state.
2. **Discover models.** Run “List Public Models.” Inspect the resolved URL, response headers, request ID, and raw JSON. Open the same request in Code Lab.
3. **Understand prerecorded STT.** Compare remote-URL JSON with local binary upload. Enable one recognition option at a time. Inspect transcript, alternatives, words, channels, metadata, and any intelligence fields only when returned.
4. **Understand synthesis.** Run one short REST TTS request. Inspect audio content type, model/request headers, timing, playback, and local download. Compare encoding/container/sample-rate compatibility in the official reference.
5. **Analyze existing text.** Run `/v1/read` with one feature, then combine summary, topics, intents, and sentiment. Treat absent response fields as absent—not empty successes.
6. **Move to realtime STT.** Use the Streaming STT handoff. The existing Live Mic module owns permission, recorder, socket, temporary-token refresh, retries, stop, and cleanup. Send its events to Live Observatory.
7. **Study turn detection.** Configure Flux's model, raw audio format, thresholds, and repeated keyterms. Review `Connected`, `ConfigureSuccess`/`ConfigureFailure`, `TurnInfo`, and `Error` event shapes before the manual session.

For a turn-by-turn timeline, deterministic replay, dynamic Configure ledger,
local metric sample sizes, and sanitized POC evidence, continue to
`/flux-observatory`. Its Synthetic Replay is not a live Deepgram result, and
the direct live provider path remains manually validated per environment.
8. **Study a complete agent.** Review Voice Agent Settings and expected events, then open the Voice Agent Code Lab workflow. External LLM/TTS providers need their own server-managed credentials; never place them in browser settings or saved experiments.
9. **Explore management read-only.** Resolve a project, then inspect project models, requests, usage, billing, keys, members, invitations, agent configurations, variables, and distribution credential metadata as your role permits.
10. **Review mutations without running them.** Enable Advanced Administration Mode on a Tier 3 entry, read its impact and role, type the phrase, and inspect the exact request. The release keeps execution locked.

## Manual smoke-test sequence

Use a small, disposable sample and your own Deepgram key. Watch account usage while testing.

1. Health/authentication: click “Check API key status”; confirm no credential appears in DevTools HTML, console, or network response.
2. Models: run `models-public-list`; confirm HTTP 200 and inspect the request ID if present.
3. Prerecorded STT: choose a very short audio URL or file, run `stt-prerecorded` once, and confirm transcript plus provenance.
4. REST TTS: synthesize one short sentence with `tts-rest`, play it, inspect content type/timing headers, then revoke/download only through the local UI.
5. Text Intelligence: submit one short paragraph to `text-intelligence` with summary plus one other feature; confirm only returned fields render.
6. Live STT: open the `stt-live` guided handoff, allow microphone access, speak briefly, stop, and confirm tracks/socket close.
7. Flux: configure `flux-general-en`, 16 kHz linear16, and conservative thresholds; run one brief turn and confirm Connected, Configure, TurnInfo, and close/error events.
8. Voice Agent: use a minimal Deepgram listen/speak configuration and a provider setup whose external credentials are already server-managed; converse briefly and stop.
9. Usage: resolve the current project, run `usage-breakdown` over the smallest useful date range, and confirm read-only behavior.

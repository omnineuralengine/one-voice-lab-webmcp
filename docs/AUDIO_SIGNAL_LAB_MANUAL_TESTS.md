# Audio Signal Lab Manual Tests

Automated tests use browser and Deepgram mocks and consume zero credits. These live checks are intentionally separate.

## Exact microphone test

1. Connect the intended microphone/interface and set a safe listening environment; no speaker monitoring is needed.
2. Start the app with `npm run dev:local` and open `http://127.0.0.1:3000` in current Edge or Chrome.
3. Open **Audio Signal Lab**. Confirm no permission prompt appears and **Monitor off** is visible.
4. Select **Live microphone**, click **Refresh devices** if needed, choose the intended device, then click **Start microphone analysis**.
5. Grant browser permission. Confirm the displayed selected device matches the actual track label and the reported constraints/settings are visible.
6. Speak normally for 8–10 seconds. Confirm waveform, RMS, peak, approximate dBFS, signal-present state, browser-derived spectrum, elapsed time, and chunk count update.
7. Pause for 3 seconds. Confirm the silence state/percentage changes without claiming Deepgram endpointing.
8. Use the synthetic clipped fixture for clipping evidence; do not shout or increase monitoring volume.
9. Click **Stop**. Confirm the browser microphone indicator turns off, elapsed/chunk summaries remain inspectable, and no audio plays from speakers.
10. Start again, then navigate to **Overview**. Confirm the microphone indicator turns off. Repeat once with **Reset**.

## Exact guarded STT comparison test

This is billable and must be run by the presenter only when desired.

1. Load a short, non-sensitive fixture and create one labeled offline variant.
2. Preview original and processed audio locally.
3. Set `nova-3`, the known spoken language, and the shared STT options.
4. Click **Compare with Deepgram**. Confirm the dialog says **two billable STT requests**, lists both durations, the model, language, and parameters, and provides Cancel and Run controls.
5. Cancel once and confirm no request occurs.
6. Reopen, review, and click **Run comparison** exactly once.
7. Confirm transcript A/B, diff, request IDs when returned, timing, settings, signal summaries, and sanitized raw responses.
8. Confirm no general accuracy score or WER appears.
9. Enter a trustworthy reference transcript, explicitly confirm it, and verify WER becomes available.
10. Complete the conclusion form and inspect aggregated `audio.experiment.*` events in Live Observatory. Stop; do not loop.

## Exact four-minute presenter sequence

- **0:00–0:25:** Open **Audio Signal Lab → Audio Engineering → Voice AI**. State the thesis and select the Focusrite input; permission occurs only after Start.
- **0:25–1:05:** Speak at a healthy level. Point to waveform, RMS, peak, approximate dBFS, signal-present state, and browser-derived spectrum.
- **1:05–1:35:** Stop and load the synthetic clipped fixture. Explain flattened peaks and why an audio problem can look like a model problem.
- **1:35–2:05:** Inspect the current WebM/Opus or fixture format. Explain container versus codec and why containerized bytes must not receive contradictory raw PCM parameters.
- **2:05–2:45:** Open **Live Mic**, select English or Italian, and run one short explicitly confirmed transcription. Stop immediately after useful evidence appears.
- **2:45–3:25:** Open **Live Observatory Lab**. Show aggregated audio events plus the real STT event/request ID; explain measured versus simulated provenance.
- **3:25–4:00:** Open the DAW bridge or Code Lab. Close with: “My audio-engineering background taught me to trace the complete signal path. In voice AI, that means asking what the model actually received before assuming the model is the problem.”

## Not safe to demonstrate live

- Live input monitoring through speakers; it is intentionally not connected.
- Deliberately shouting, raising hardware gain excessively, or creating acoustic feedback.
- Repeated A/B STT loops or unconfirmed billable requests.
- Treating the telephony filter as a PSTN benchmark, the FFT as a calibrated analyzer, or browser energy as Deepgram VAD.
- Showing `.env.local`, tokens, project/account details, unsanitized customer audio, or raw uploaded audio.

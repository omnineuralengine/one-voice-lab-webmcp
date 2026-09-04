# UI Control Audit

## Learning On trace

The former `Learning On` control followed this path:

1. The top-bar button toggled `learningMode` in the Control Room.
2. The state was stored under `deepgram-voice-lab-learning-mode`.
3. Consumers included Transcribe URL, Browser Mic, Payload Inspector defaults, Overview inspector metadata, Sample Audio Library, and module notes.
4. When enabled, it rendered language examples and live-audio explanations, opened inspectors by default, and added walkthrough notes.
5. It did not change routes, request payloads, Deepgram behavior, difficulty, event logging, analytics, or accessibility policy.

Conclusion: **B — functional but confusing**. The control affected real educational presentation, but “Learning On” did not explain what changed.

## Decision

The control is renamed **Guided Hints**. Its visible description now states that it reveals explanatory callouts, expands inspectors, and adds walkthrough notes without changing API requests.

State and component props were renamed to `guidedHints`. Persistence moved to `deepgram-voice-lab-guided-hints`. On first load, the previous value is read once for migration, written to the new key, and the old key is removed. No route or API feature depends on the old name.

## Keyboard-control audit

Before this change, window-level keyboard listeners existed independently across several workspaces. Global dispatch is now centralized in the keyboard shortcut controller. Dialog-local handlers remain only for behavior scoped to the focused dialog.

Realtime shortcuts target the same visible Start, Stop, Timeline, Raw Events, diagnostic-copy, and Reset controls. Disabled controls provide the command palette with a reason, and billable confirmation dialogs remain mandatory.

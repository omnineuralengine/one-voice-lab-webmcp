# Command Palette

Open the command palette with `Ctrl+K` on Windows/Linux or `Cmd+K` on macOS. The visible header button provides the same action.

## Commands

Navigation commands cover Home, API Studio, Voice Agent, Live Observatory,
Flux Conversation Observatory, Audio Signal Lab, Language Explorer, Applied
Engineering Questline, and Code Lab. **Open Flux Conversation Observatory**
navigates to `/flux-observatory`; it has no automatic microphone, credential,
or provider side effect.

Contextual commands appear only when the current workspace provides the corresponding action:

- Run current request or Start current session
- Stop current session
- Open Timeline
- Open Raw Events
- Copy sanitized diagnostic summary
- Reset current module
- Start Guided Tour
- Open keyboard shortcuts

An action that belongs in the current context but is temporarily disabled remains visible with its reason. Unrelated actions are omitted.

## Interaction

- Search uses ordered fuzzy matching, so `api stu` and abbreviated character sequences work.
- Arrow Up and Arrow Down move selection.
- Enter executes only an enabled command.
- Escape closes and restores focus to the invoking control.
- Tab and Shift+Tab remain trapped inside the dialog.
- Every result has a screen-reader label and shows its platform-aware shortcut when one exists.

The palette delegates to existing controls and application actions. It does not create a second request path or weaken confirmation and billing safeguards.

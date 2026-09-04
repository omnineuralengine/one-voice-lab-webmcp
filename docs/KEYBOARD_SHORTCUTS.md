# Keyboard Shortcuts

The Learning Lab uses one typed registry in `src/lib/keyboard-shortcuts.ts` and one global dispatcher in `src/components/keyboard-shortcuts/KeyboardShortcutController.tsx`.

## Shortcut map

| Area | Windows / Linux | macOS | Action | Availability |
| --- | --- | --- | --- | --- |
| General | `Ctrl K` | `Cmd K` | Open command palette | Outside text-editing surfaces |
| Navigation | `H` | Same | Home | Global; `G`, then `H` remains compatible |
| Navigation | `D` | Same | Deepgram Featured Provider | When no visible diagnostic-copy action is available |
| Navigation | `S` | Same | Simulation Observatory | Global |
| Navigation | `B` | Same | Build index | Global |
| Navigation | `L` | Same | Learn index | Global |
| Navigation | `G`, then `A` | Same | API Studio | Global |
| Navigation | `G`, then `V` | Same | Voice Agent Converse | Global |
| Navigation | `G`, then `O` | Same | Live Observatory | Global |
| Navigation | `G`, then `S` | Same | Audio Signal Lab | Global |
| Navigation | `G`, then `L` | Same | Language Explorer | Global |
| Navigation | `G`, then `Q` | Same | Applied Engineering Questline | Global |
| Navigation | `G`, then `C` | Same | Code Lab | Global |
| Session | `Ctrl Enter` | `Cmd Enter` | Run or start the visible primary action | Only when the same visible action is enabled |
| Session | `Shift Escape` | Same | Stop the active session | Only when an enabled Stop action exists |
| Session | `R` | Same | Reset the current module | Disabled while a request/session is active |
| Audio | `Space` | Same | Native play/pause | Only while a native audio player has focus; the app does not override Space |
| Inspection | `E` | Same | Open Timeline or Events | When the current module exposes it |
| Inspection | `Shift E` | Same | Open Raw Events | When the current module exposes it |
| Inspection | `D` | Same | Copy sanitized diagnostic summary | A visible diagnostic action takes priority over Deepgram navigation |
| Inspection | `/` | Same | Focus search or filter | When the current module exposes a tagged search field |
| General | `?` | Same | Open shortcut help | Outside text-editing surfaces |
| General | `Escape` | Same | Close the topmost overlay | Modal/dialog exception; restores focus for command/help surfaces |
| Tabs | `[` / `]` | Same | Previous / next tab | Only when keyboard focus is inside a semantic tablist |

The `G` prefix expires after 900 ms. Pressing `G` alone never navigates. `Alt+Left` and `Alt+Right` remain browser navigation and are not registered.

## Typing exclusions

Global shortcuts are suppressed in `input`, `textarea`, `select`, `contenteditable`, elements with `role="textbox"`, Monaco, tagged code editors, and command-palette search. Escape is the explicit exception for closing the topmost overlay. Shift+Escape does not stop a session while the user is typing.

## Safety

Shortcut dispatch clicks the same visible enabled controls used by pointer users. It cannot bypass validation, confirmation dialogs, risk-tier policy, or disabled states. Repeated keydown events are ignored for Start and Stop, and a short action lock prevents duplicate socket/request starts.

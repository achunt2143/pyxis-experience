# Terminal makeover: implementation plan

Concept: [Terminal Concept canvas](https://claude.ai/artifact/EM7X1ZQvzZfhiPE76BYkK6) (wide light, wide dark,
narrow, Profile, closing a busy session, and the spec). Written 2026-11-27 against `release/alpha5`.

The concept replaces tabs with **sessions as panes on Remochi's time line**: a Sessions pane on the left,
the live session in front, and a right-hand peek when a job you started in another session finishes. The
chrome is Remochi type and controls only; the screen gets a **Mochi ANSI** palette (`--term-*`), a cursor
that follows window focus, and a bell drawn as light instead of a box.

## Where the code stands

| Piece | Today | Concept needs |
|---|---|---|
| `remochi` | 0.5.1 (npm has 0.6.0) | 0.6.0: `Label`, `RepanelStack` `upcoming` / `keepPast`, `Repanel` `hint` / `sequence` / `peekLabel`, motion modes |
| `@duyojs/duyo` remochi pack | 1.1.3, a hand-listed set of `remochi.*` kinds built for 0.5 | `remochi.Label` and the 0.6 props above on `remochi.RepanelStack` / `remochi.Repanel` |
| Echo `org.geckoOS.terminal` | `Open {cols, rows}`, `Write`, `Resize`, `Close`; `TerminalOutput`, `TerminalClosed {terminalId}` | the session's folder, its foreground job, its exit code, and `Open` taking a starting folder |
| App SDK `createPyxisPacks` | maps every app's accent onto `--mochi-accent` | see decision D2 |
| Terminal app | tabs (`Terminal.Tab`), 7 icon buttons, quick-keys ribbon, Tokyo Night colours hard-coded in `TerminalScreens.tsx`, `defaultTheme: 'dark'` | everything below |

## Decisions to make first

- **D1. Monospace face.** Remochi and Pyxis name none. The concept uses `ui-monospace, "SFMono-Regular", "DejaVu Sans Mono", Menlo, monospace`. Either keep that stack or pick a face to ship (it would need to be added to the identity docs).
- **D2. App accents and "amber means on".** `createPyxisPacks` (`packages/app-sdk/src/duyo/packs.tsx:95`) writes each app's accent onto `--mochi-accent`. From Remochi 0.5, that colours the "on" state of Toggle, Radio and Checkbox, so every app's "on" is its accent, not amber. That breaks a Remochi hard point. Recommendation: the SDK keeps `--px-accent` and stops writing `--mochi-accent`. This changes all eight apps, so it should be its own SDK change. The Terminal concept already keeps its green on its own `--term-accent`.
- **D3. Theme.** `main.tsx` forces `defaultTheme: 'dark'`. The concept follows `pyxis.theme`, light first, as Remochi says. Recommendation: drop the override.
- **D4. When a shell exits.** Today any exit closes the tab, and the last one closes the app. The concept keeps an ended session as a row ("Exited 255", "Press Enter to start it again"). Recommendation: exit code 0 closes the session as now; any other code keeps it. This needs D-Echo's exit code.
- **D5. Where `--term-*` lives.** It starts in the app's `terminal.css`, then moves to Remochi's tokens once it settles.

## Phases

Each phase lands as its own commit and keeps the app working.

### 1. Dependencies (blocks phases 4 and 5)
1. **Duyo:** add `remochi.Label`; pass `upcoming`, `onUpcomingOpen`, `keepPast` on `remochi.RepanelStack` and `hint`, `sequence`, `peekLabel` on `remochi.Repanel`; regenerate `kinds.gen.ts`. Release a Duyo version.
2. **Remochi 0.6.0** at the workspace root and in every app's `package.json`. It's hoisted, so all eight apps move together: run every app's tests and look at Notes, Contacts and Files, which already use `RepanelStack`.
3. **SDK accent (D2)**, if accepted.

### 2. Echo: what a session is doing (geckos repo; Rust tests in `echo/src/services/terminal.rs`)
1. **`TerminalClosed` gains `exitCode`.** It comes from `session.child.wait()` in the reader thread, which already reaps the child.
2. **`TerminalStatus` signal: `{terminalId, cwd, job}`.** `cwd` is read from `/proc/<shell pid>/cwd`. `job` is the foreground process group (`tcgetpgrp` on the master), as `{pid, command}` from `/proc/<pgid>/cmdline`, or `null` when the shell itself is in front. It's emitted only when one of these changes: checked after each read and on a 1 s tick while the session is open.
3. **`Open` takes an optional `cwd`.** It must be a directory the session user can enter. This is used by "Start In" and by the profile's "Start in the last folder".
4. **SDK:** `TERMINAL_SIGNALS.status`, the new payload types and `openTerminal(cols, rows, { cwd })` in `useEcho.ts`. `mockShell.ts` emits the same status, so the dev shell and tests drive the rows.
5. **Later, optional:** OSC 133 shell integration. It gives a per-command exit code, so a finished job can say "Exited 1" instead of just "Done". Until it lands, a finished job reads "Done".

### 3. Model (pure, unit-tested; `packages/apps/terminal/src/model.ts`)
- Replace `TabInfo` with `Session {id, terminalId, name, cwd, job, state, exitCode, bells, unseen, jobStartedAt}`.
- **Name:** the folder's base name, or `user@host` for ssh, from the job's command.
- **State:** `'idle' | 'running' | 'done' | 'exited' | 'ended'`. A job shows "Running" only after `RUNNING_AFTER_MS = 2000`, the same wait Evo uses before a window shows busy.
- **Pure functions:** `nextState(session, status | closed)`, `predictPeek(sessions, activeId)`, `summary(sessions)` ("4 open, 1 running") and `stateWord(session)`.
  - `predictPeek` returns the first session that is `unseen` and `done` and isn't the active one, otherwise nothing.
  - A session becomes unseen when its job ends while it isn't the active session; opening it clears that.
- Shortcuts keep their keys and are renamed to sessions: Ctrl+Shift+T new, Ctrl+Shift+W close, Ctrl+Tab and Ctrl+Shift+Tab cycle, Ctrl +/−/0 for text size.

### 4. Chrome (Duyo views)
- **`TerminalApp.view.json`**, rebuilt as a `remochi.RepanelStack`:
  - **Panel 0, Sessions:** Header and Subheader (the summary), a Repeater of `Terminal.SessionRow`, a Label "Start In" with recent folders, and `( New Session )` at the bottom on the 32px edge.
  - **Panel 1, the active session:** the Header is the session name, with a `( Session ⌄ )` dropdown Button on its baseline. Under it, a Subheader ("~/geckos/evo · bash · 112 × 30") and `Terminal.Screens`.
  - **`upcoming`:** the predicted session's Repanel with `sequence {index, label: 'Done'}` and `peekLabel` ("Open pyxis-experience, npm test done").
  - **Panel 2, Profile:** opened from the Session menu.
- **New kind `Terminal.SessionRow`:** numeral, bold-italic name, caption (job or folder), and on the right a state word, `remochi.Spinner` + "Running", or `remochi.Badge` for bells. `aria-current` marks the active row.
- **Session menu:** a `remochi.PopupPanel` from the Session button, as Files does: Copy, Paste, Clear, Profile, Close Session.
- **Selection menu:** right-click or long press on a selection opens a PopupPanel at the selection with Copy and Paste. "Open in Files" shows only when the selection is a path that exists. That needs a stat call, so it can follow later.
- **Keys:** `remochi.Button`s (Esc, Tab, Ctrl C, the arrows, Ctrl D). They keep `QuickKey`'s `onMouseDown` `preventDefault`. They show by default when the stack is narrow (`useWidthClass`) or the pointer is coarse; otherwise the profile turns them on.
- **Closing a busy session:** a `remochi.Dialog` (confirm, `warning`): "Close geckos?" / "cargo build is still running in this session. Closing the session stops it." / `( Cancel )` `( Close Session )`. It's skipped when the profile's "Ask before closing" is off.
- **Delete:** `TerminalTab.*`, the `.term-tab*`, `.term-newtab`, `.term-mode-badge` and `.term-key` styles, the zoom, copy, paste and clear buttons, and the `lucide-react` imports they used. "Mock shell" moves into the Subheader in place of the shell name.

### 5. Screen (`TerminalScreens.tsx`)
- **Colours:** xterm's `theme` is read from the `--term-*` variables at mount and again when `data-mochi-theme` changes. Take the 32 values and the cursor rules from the concept's `theme.css` and Palette board; nothing is hard-coded in TS.
- **Cursor:** `cursorStyle` follows the profile (block, bar or underline). `cursorInactiveStyle: 'outline'` covers the unfocused window. In light the cursor uses `--mochi-focus-ring`; in dark, `--term-accent`.
- **Selection:** `--term-selection` (`--mochi-primary-soft`).
- **Bell:** replace the amber inset box.
  - In the active session, the front pane's edge lights in `--term-accent`: in over 120 ms, out over 260 ms. It honours `data-motion`; under Off it doesn't animate.
  - In another session, the bell adds to that row's Badge count.
  - With the profile's sound option, it plays the Pyxis notification sound.
- **Font:** `fontFamily` comes from `--term-font`; the size from the profile.

### 6. Profile and persistence
- **Settings:** `terminal.fontSize`, `terminal.cursor`, `terminal.bell`, `terminal.keys`, `terminal.startInLastFolder` and `terminal.askBeforeClose`, through the SDK's settings hooks so they persist and sync.
- **Recent folders:** the last few distinct `cwd`s, kept in app storage.
- **Shell command:** the concept's field is left out until Echo can start a chosen shell from `/etc/shells`, a separate Echo change.

### 7. Widths, motion, accessibility
- **Narrow:** under 768px, one pane at a time with 20px slivers and the keys shown.
- **Motion:** a new session enters from the right and a closed one leaves to the right, on `--mochi-ease-forward` / `--mochi-duration-stack`. Output and typing never animate.
- **Accessibility:** slivers are named buttons; rows are buttons; the Session button gets its `aria-label` the way `TerminalApp.ts` labels Remochi buttons today.
- **Check:** contrast in both themes, in greyscale, and with high contrast on.

### 8. Tests and docs
- **App tests:** rewrite the tabs, toolbar and quick-keys groups in `TerminalApp.test.tsx` for sessions (new and close, cycling, peek, Running after 2 s, Done and Exited rows, the close dialog, the bell count). Keep the PTY lifecycle, island-size and mock-shell groups.
- **Contrast test:** a contract test that every `--term-*` colour is at least 4.5:1 on `--mochi-panel-bg` in both themes, alongside `identityContract`.
- **Docs:** CHANGELOG entries in both repos, a Terminal section in `geckos/docs/identity/pyxis-identity.md` (`--term-*`, cursor, bell), and a note for Remochi to adopt the tokens.

## Order and size

1. Phase 1, then 2 (these can run in parallel; both are in other packages or the other repo).
2. Phase 3 (small).
3. Phase 4 with 5 (the bulk).
4. Phase 6.
5. Phase 7 and 8.

Phases 3 to 5 can start against the mock shell before Echo lands, because the mock emits the same signals.

## Out of scope

Split panes, search in scrollback, profiles per session, the shell picker, and OSC 133 (beyond the note in phase 2).

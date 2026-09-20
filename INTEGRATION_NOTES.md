# Bloom / Echo / Evo integration — current state and scope decision

This note records what was verified and decided in the session that
reconciled Bloom's window model against the target "apps are independent
Wayland clients, Evo composites everything" architecture (see
`../geckos/pyxis-webos-parity-analysis.md` and
`../geckos/nova-runtime-host-plan.md`). Read those two docs first — this file
only covers the concrete, current-code consequences of that design.

## 1. Bridge wiring — verified correct, no changes needed

`src/services/EchoClient.ts` targets the real `window.geckoOS` bridge
(`initialized`, `callService`, `addEventListener`, `geckoOSReady` event),
exactly matching `gecko/bridge/extension/gaia-bridge.js`'s shape. Service name
casing (`appHost`, `appManager`, `notification`) matches what
`echo/src/bin/daemon.rs` registers. The dev/browser mock path
(`window.geckoOS` undefined) is untouched and still fully exercises the UI.

`src/services/useEcho.ts`'s `useAppHost()` ref-mutation pattern
(`echoRef.current = echo` inside a `useEffect`) is correct — the ref is not
mutated during render, so there is no hooks violation here despite an older
note to that effect.

## 2. AppHost signal names/payloads — verified correct, no changes needed

Checked `echo/src/services/apphost.rs` (`emit_lifecycle`, `bind_surface`,
`unbind_surface`) against `useEcho.ts`'s `APPHOST_IFACE`/`APPHOST_SIGNALS`:

- Interface: `org.geckoOS.appHost` — matches.
- Signal names: `AppStarting`, `AppRunning`, `AppStopped`, `AppCrashed`,
  `AppSurfaceMapped`, `AppSurfaceUnmapped` — all match exactly
  (`apphost.rs`'s `transition()`/`bind_surface()`/`unbind_surface()`).
- Payload shape (`AppSession::to_json()`): `sessionId`, `appId`, `pid`,
  `startedAt`, `state`, `surfaces` — matches the `AppSession` TS type in
  `src/types/index.ts` field-for-field.

**Important finding: Evo's own signals are a separate, lower-level channel
that Bloom does not need to consume directly.** Evo registers its own Echo
service (`org.geckoOS.evo`) with compositor-level signals
(`WindowCreated`/`WindowClosed`/`WindowFocusChanged`/`WindowMinimized`/
`WindowMaximized`/`WorkspaceChanged`/etc. — see
`evo/src/enhancements/echo_ipc.rs`'s `create_service_interface()`). Bloom does
not subscribe to these, and per this session's reading of
`evo/src/state.rs` (`map_window`/`remove_window_from_workspace`, lines
~1502-1581), it doesn't need to: **every Wayland toplevel Evo maps — whether
launched via AppHost's `LaunchApp` or a raw XWayland client like the
glxgears test case — gets bound into AppHost in-process** via
`geckoOS_echo::AppHost::global().bind_surface(&app_id, id, None, None)` on
map, and `unbind_surface(id)` on unmap. `AppHost::bind_surface` synthesizes a
foreign-process session (`AppRunning` + `AppSurfaceMapped`) when no session
already exists for that `app_id`, so **any real compositor window — including
ones Bloom/Nova never launched — already surfaces correctly through the
existing `useAppHost()` subscription** (this is exactly the "orphan session"
path already implemented in `BottomDock.tsx` and `LeftLauncher.tsx`).
Conclusion: no new Evo-signal listener is needed in Bloom for this pass.

## 3. Scope decision: pseudo-apps vs. real Wayland clients

**Decision: keep the four React "system pseudo-apps" (`TerminalApp`,
`FilesApp`, `SettingsApp`, `BrowserApp` in `src/apps/`) as in-DOM content for
now**, rather than migrating them to real spawned processes this pass. This
is a legitimate, common shell pattern (built-in panels), and a full migration
requires two prerequisites that don't exist yet: Nova (manifest/launch
composition — design-only, see `nova-runtime-host-plan.md`) and the
from-source `pyxis-webapp` Gecko kiosk build (a separate, parallel
workstream, see `pyxis-gecko-embedding-plan.md`).

What **was** done to make the two models coexist correctly instead of
conflicting, per the task's suggested middle ground:

- `DesktopWindow.tsx`'s `WaylandSurfaceView` placeholder was already replaced
  (prior to this session) with `AppCardMetadata`, a chrome-only status card
  (title/state/pid/surface count) for any window that has a live compositor
  surface but no bound React component — i.e. exactly the real-client case.
- `BottomDock.tsx` and `LeftLauncher.tsx` already derive their live state
  (running/starting/crashed dots, orphan-session icons) from
  `useAppHost().sessions`, which — per finding #2 above — already reflects
  *real* Evo-composited windows via the `bind_surface` bridge, not just
  pseudo-app sessions. No changes were needed here; this was verified, not
  built, this session.
- Net effect: a pseudo-app (e.g. Terminal) shows as an in-DOM window backed
  by a real (stub) AppHost session; a real native/XWayland client (e.g.
  glxgears) shows as a dock/launcher entry with live lifecycle state and, if
  opened as a "window" via `createWindow`, would render as chrome-only
  `AppCardMetadata` rather than fake content. Both paths go through the same
  `useAppHost()` state.

## 4. App manifests (`../geckos/apps/{files,settings,terminal,browser}/`)

`apps/{files,settings,terminal}/manifest.json` + `launch` scripts were
already intentionally-documented no-op placeholders — the `launch` scripts
exist purely so AppHost's `spawn()`/PID-tracking/crash-detection has a real
process to track for each pseudo-app, matching decision #3 above. Their
comments already explained this (see `apps/terminal/launch`).

**Gap found and fixed:** `apps/browser/` had no manifest at all, even though
`BrowserApp` is one of the four pseudo-apps and `Desktop.tsx` calls
`echo.launchAppHost('browser')` when it's opened. Added
`apps/browser/manifest.json` and `apps/browser/launch` mirroring the other
three, so `AppHost::list_manifests()` (`echo/src/services/apphost.rs`) can
discover it and `LaunchApp` for `browser` actually creates a tracked session
instead of silently 404-ing against the real daemon (the `Desktop.tsx` call
site already swallows the error with `.catch(() => {})`, so this wasn't
crashing anything — just silently not tracking Browser sessions).

Deferred, pending Nova: pointing these `launch` scripts at real binaries
(e.g. a real terminal emulator + PTY bridge, a real file manager). Tracked
already in `apps/terminal/launch`'s own comment and in the roadmap's item 2.

## 5. Serving Bloom inside the booted VM (interim measure)

Nothing previously bound an HTTP listener to Bloom's built assets inside the
VM, and no browser process loads them — `create-rootfs.sh`'s
`stage_userspace_apps` copies `gaia/static/` (which `make pyxis-build`
populates from `pyxis-experience/dist`) to
`/usr/share/geckoOS/static/pyxis/`, but that was as far as it went.

**Considered and rejected:** reviving `gaia/src/ui_server.rs` (actix-web) as
a running service. Gaia is mid-retirement (`gaia` crate is lib-only now —
no `[[bin]]` target, no systemd unit, nothing calls `UIServer::new/start`
anywhere) — standing it back up would mean writing a new bin entrypoint and
service wiring for code that's being deleted, which is a bigger lift than
"pragmatic reachability now" warrants.

**What was done instead:** wired BusyBox's built-in `httpd` applet (already
compiled into the rootfs for the initramfs) to serve
`/usr/share/geckoOS/static/pyxis` on `127.0.0.1:8080`, started from
`geckoOS-boot` (`scripts/create-rootfs.sh`) right after `evo` comes up. This
required also explicitly enabling `CONFIG_HTTPD`/`CONFIG_FEATURE_HTTPD_RANGES`
in `scripts/busybox-install.sh` (usually on by default via `make defconfig`,
now pinned) and added to the post-build applet-presence check. No new Rust
code, no new dependency — reuses the existing BusyBox build step and boot
script mechanism (`start_daemon`) already used for every other service.

This makes Bloom's built UI reachable (e.g. via a browser inside the VM
pointed at `http://127.0.0.1:8080`, or via QEMU port forwarding from the
host) for manual verification against the live Echo/Evo stack, ahead of the
real `pyxis-webapp` kiosk launcher landing. It is explicitly an interim
testing aid, not the production app-serving path — that remains
`pyxis://<app-id>` + `pyxis-webapp --app=<id>` per
`pyxis-scheme-and-kiosk-plan.md`, still blocked on the from-source Gecko
build.

**Still not done, deliberately out of scope this pass:** actually launching
a browser process against `http://127.0.0.1:8080` from inside the booted
system (would need either the in-progress Gecko kiosk build, or a stopgap
XWayland browser launch from `geckoOS-boot` — the latter would just be
throwaway work once the real kiosk mode lands, so it wasn't added).

## 6. Remochi rework + standalone app documents (2026-07-07 session)

Supersedes part of §3: the four pseudo-apps are no longer all in-DOM. The
shell and every app were rebuilt on the `remochi` UI kit (npm, v0.2.1;
Enyo-Mochi-styled components + `ThemeWrapper` CSS variables), and each app
is now its own HTML entry / document — a separate process from Bloom —
generalizing the pattern `terminal.html` established:

- Entries: `terminal|browser|notes|settings|contacts|tasks.html`, each
  mounting via `src/apps/shell/mountApp.tsx` (`AppShell` = remochi
  `ThemeWrapper` + persisted theme). `src/apps/registry.ts` is the single
  source of truth (id/icon/entry/pinned/size); `useWindows`, the launcher,
  drawer, and dock all derive from it. Only `FilesApp` remains an in-DOM
  component.
- `DesktopWindow` embeds `entryHtml` apps by URL (`?windowId=…`); apps
  request close cooperatively via `postMessage('pyxis:app-close')`. Under
  the future pyxis-webapp kiosk the same pages run as real Wayland clients
  and the embed path is replaced by Evo compositing.
- New PIM apps (Notes/Contacts/Tasks) persist JSON docs through the real
  `org.geckoOS.filesystem` service (`~/.local/share/geckoos/pim/<app>.json`,
  see `src/services/appStorage.ts`); Settings + theme + wallpaper go through
  `org.geckoOS.settings` (`src/services/settingsBus.ts`, changes fanned out
  cross-document via BroadcastChannel). EchoClient's dev mock answers both
  services from localStorage. Mock iface matching was made case-insensitive
  (the old `endsWith('Network')` never matched `org.geckoOS.network`, so
  network status always rendered undefined fields).
- `apps/{notes,contacts,tasks}/` manifests + launch stubs added on the
  geckos side, mirroring `apps/terminal`.
- Known cosmetic follow-up: remochi 0.2.1 leaks `variant`/`active` props to
  the DOM (styled-components warnings in console) — fix belongs in the
  remochi repo, not here.

## 7. Apps extracted into independent packages (2026-07-07 session)

Supersedes §6's "each app is now its own HTML entry / document" — that was
true but they were still all compiled by Bloom's own `vite build` and lived
inside Bloom's `src/` tree. This pass physically moved every built-in app
(including `FilesApp`, the last in-DOM holdout) out of `pyxis-experience`
into its own independent npm-workspaces package, each with its own
`package.json`/`vite.config.ts`/`dist`. Deliberately **out of scope**: the
real `pyxis://` + Nova wiring — `entryHtml` in `registry.ts` currently
points at each package's local dev server, not a `pyxis://<id>/` URL.

- New root-level npm workspace (`package.json`'s `"workspaces"` field):
  `packages/app-sdk` (`@pyxis/app-sdk`) + `packages/apps/*`
  (`@pyxis/app-{terminal,browser,files,notes,contacts,tasks,settings}`,
  each on a fixed dev port 5180–5186 — see each package's `vite.config.ts`).
  `npm run dev:all` (root) runs Bloom + all 7 via `concurrently`.
- `@pyxis/app-sdk` is the shared shell/service layer every app **and**
  Bloom's own shell now depend on: `AppShell`/`mountStandaloneApp` (was
  `src/apps/shell/`), `EchoClient`/`useEcho`/`settingsBus`/`appStorage`/
  `safeStorage` (was `src/services/` + `src/utils/`), `usePyxisTheme`, and
  `WALLPAPERS` (pulled out of `SettingsApp.tsx`, since both Bloom's
  `Desktop.tsx` and the Settings package need it). No build step — consumed
  as TS source directly via the workspace symlink, same as Vite already
  does for local files. `src/types/index.ts` re-exports the SDK's
  Echo/AppHost types so existing `from '../types'` imports across Bloom
  didn't all need rewriting.
- `DesktopWindow.tsx`'s `component` fallback (in-DOM pseudo-app path) is
  gone — every app is `entryHtml` now, so `PyxisAppDef`/`DesktopWindowType`
  dropped the field entirely, along with the now-dead `AppEntry` type.
- Gotcha hit and fixed: `remochi/css`'s ambient module declaration
  (`remochi-css.d.ts`) doesn't propagate across a package boundary just
  because a same-directory file that imports it does — each of the 7 app
  packages needed its own copy alongside its `src/`, not just the SDK's.
- Known consequence, not fixed this pass: apps now run on different
  **origins** in local dev (separate ports), so `settingsBus`'s
  BroadcastChannel/localStorage-backed mock (same-origin only) no longer
  live-syncs theme/wallpaper changes between Bloom and an already-open app
  window during `npm run dev:all` — each origin has its own mock store.
  This actually matches the *real* target architecture more closely (Nova's
  plan gives each `pyxis://<id>` its own Gecko profile/storage — origin
  isolation was always the intended end state), so it's arguably correct
  rather than a bug, but it's a live-dev convenience regression from §6's
  same-origin setup worth knowing about if theme changes stop appearing to
  propagate during local testing.

## 8. Remochi 0.3.0 upgrade + Repanel master-detail layouts (2026-07-15 session)

Bumped `remochi` from `^0.2.1` to `^0.3.0` across every package that depends
on it (root, `app-sdk`, and the `browser`/`contacts`/`notes`/`settings`/
`tasks` app packages), added it as a new dependency to `files` (previously
MUI-only), and ran `npm install` so the workspace's hoisted `node_modules`
actually resolves 0.3.0. Reference doc refreshed from upstream:
`docs/remochi-component-guide.md` is now the 0.3.0 guide (fetched from
`achunt2143/remochi`'s `main` branch), which is mostly a dark-mode pass plus
the panel rename below and a `ViewSelectButton` fix — see that repo's
`RELEASE_NOTES.md` for the full changelog.

- **Breaking rename**: `Panel`→`Repanel`, `StackedPanels`/`StackedPanel`→
  `RepanelStack` (single component now; children are plain `Repanel`s). The
  only pre-existing consumers were Bloom's own shell chrome —
  `TopSystemBar.tsx`, `LeftLauncher.tsx`, `BottomDock.tsx` — mechanically
  renamed, no behavior change (same `style`/`width` props).
- **New**: none of the seven apps previously used any remochi panel
  component (Contacts/Notes/Tasks/Settings didn't import from `remochi` at
  all for layout; Files was MUI-only). Rebuilt five of them on
  `RepanelStack` as a genuine master-detail workspace rather than a
  hand-rolled flex/border-right sidebar:
  - **Contacts** / **Notes**: 2-panel stack (list, detail-or-editor).
    `activeIndex` is app state (not `defaultActiveIndex`) so selecting an
    item brings the detail panel back to front even after the user has
    swiped it closed down to list-only.
  - **Settings**: 2-panel stack (section rail, section content) — the
    textbook fit; `SECTIONS` content unchanged.
  - **Tasks**: was previously single-pane with a `ViewSelectButton` filter
    row; that's now a 2-panel stack (All/Active/Done as a filter `List`,
    selected filter's tasks as the detail panel) — `ViewSelectButton` import
    dropped, no longer used here.
  - **Files**: rebuilt as a real Miller-column/Finder-style browser — one
    `Repanel` per open folder depth, all simultaneously mounted and
    independently scrollable (RepanelStack's actual differentiator over a
    2-panel split). Clicking a folder in *any* open column (not just the
    front one) truncates the stack back to that column and opens the new
    folder as the front column; `activeIndex` is controlled as
    `crumbs.length - 1`. Per-path directory contents are now cached in a
    `Record<path, DirState>` (previously a single "current directory"
    state) since every open column needs its own contents rendered at once.
    The old top breadcrumb bar was kept alongside the panels for
    multi-level jumps in one click, rather than only one swipe-back at a
    time.
  - **Browser** and **Terminal** were deliberately left alone — neither has
    a natural list/detail split (a single browsing surface and a single
    scrollback pane, respectively), so forcing a second panel would've been
    a fit-the-tool-to-the-task problem rather than an improvement.
- Verified via `npx tsc --noEmit` in each touched app package (all clean)
  and a live check in Chrome against each app's Vite dev server.

## What remains for a future pass

- Build Nova; use it to replace the `apps/*/launch` stubs with real
  processes launching each package's own build (per the target
  architecture) and wire `registry.ts`'s `entryHtml` to real `pyxis://`
  URLs instead of local dev-server ports.
- Once `pyxis-webapp` exists, replace the interim `busybox httpd` + manual
  browser step with the real `pyxis://` scheme + kiosk launch, and remove the
  interim serving code added in §5.
- `AppDrawer.tsx` is *not* dead code (contrary to an earlier note) — it's
  wired into `LeftLauncher.tsx`'s app-drawer modal and its entries
  (`browser`/`files`/`settings`/`terminal`) all match real components; no
  phantom entries were found in this session, and lint/build are clean with
  zero errors. That earlier "dead code" and "12 lint errors" note appears to
  predate a cleanup pass and can be treated as stale.
- ~~`stage_binaries()` lists a `pyxis` binary with no Cargo target~~ —
  **stale, corrected 2026-08-16.** `vroom/Cargo.toml` defines
  `[[bin]] name = "pyxis"`; the target exists and builds.
- Real cross-origin settings sync for local dev (§7) — if it turns out to
  matter for day-to-day testing, the fix would be something like each app
  polling `getSetting` on window focus rather than trying to resurrect
  cross-origin BroadcastChannel (which the platform doesn't allow).

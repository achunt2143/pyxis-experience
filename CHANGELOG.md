# Changelog

All notable changes to Pyxis Experience: Bloom (the desktop shell and its
overlay), the `@pyxis/app-sdk` package, and the eight built-in apps. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The compositor, bus, Nova, vela patches and image live in the sibling repo; see
[`../geckos/CHANGELOG.md`](../geckos/CHANGELOG.md). Many shell features here
need the matching Evo, Echo and vela bridge entries from that changelog.

## [0.1.0-alpha.5] - 2026-11-16

### Shell (Bloom)

#### Added
- Shell overlay (`src/overlay/`, `src/components/ShellLayer.tsx`, `overlay.html`): all shell UI (bar, launch bar, panels, toasts) is a second Bloom window above apps; reports its input region, work area and keyboard need to Evo (`useOverlayRegion`, `useWorkArea`, `useOverlayKeyboard`); "just type" forwarded from the desktop.
- Alt+Tab and Super+Tab overview (`src/hooks/useSwitcher.ts`, `CardOverview.tsx`): cards fly between grid and each window's frame, real thumbnails from `evo.GetWindowThumbnails` (`overview/thumbnailStore.ts`, `useThumbnailPrefetch`), pure flight maths in `overview/flight.ts`.
- Global shortcut handling (`useGlobalShortcuts`) for launcher, overview, search and show desktop over running apps.
- Visual identity: status strip (`TopSystemBar.tsx`), launch bar at the bottom or left rail (`LaunchBar.tsx`, `launchBarState.ts`), notification dashboard (`NotificationDashboard.tsx`), waterdrop panels for cards, drawer and quick settings, Mochi type, `src/styles/identity.css`.
- `useShellTint` (tint derived from the wallpaper palette, with `--px-ink`, `--px-material`, `--px-edge-material` families) and `useAppIdentity` (sends `SetAppIdentity` to Evo, rasterizing each app's waterdrop icon).
- Lumen on the shell side: dock ripple and dip on `MinimizeLanded` (`DockLanding.tsx`, `useDockLandings.ts`), per-app accent on minimize targets, wallpaper drift on show desktop (`useWallpaperDrift.ts`).
- Daylight wallpaper (sun-elevation palette, WebGL shader with CSS fallback, 10 fps, pauses when covered), Aurora, Sunset, Forest and Mochi presets, and `useWallpaperExposure`.
- Lock screen (`src/lock/`, `useIdleLock`): lens clock, states rest/awake/verify/wrong/wait/unlocking/ambient/no-password, Lock in quick settings.
- Notification centre and toasts fed by `org.geckoOS.notification`, Do Not Disturb, quick-settings volume (`org.geckoOS.audio`).
- Dialogs (`ShellDialog.tsx`): shell scrim around remochi's dialog card for launch errors and Restart/Shut Down; `PrivilegePromptDialog.tsx` for the root-access password prompt.
- `VelaIcon.tsx`, `AppDropIcon.tsx`, `useAppName.ts`.

#### Changed
- App list is dynamic (`useApps`) from Nova's `List`, refreshed on `AppInstalled`/`AppUninstalled`/`RegistryChanged`; `PYXIS_APPS` is now only a presentation overlay.
- Clock uses Echo's `useClock` (zone from Echo, never `Intl`) and `pyxis.clock24h`.
- `AppShell` no longer remounts apps on a theme change.
- The dock/bar no longer shrinks or hides for a maximized app; a fullscreen app hides the shell.
- Contract tests moved to read Rust source (`novaContract`, `novaBridgeContract`, `identityContract`, `sessionContract`, `privilegeContract`).

#### Fixed
- `CompositorWindowsProvider` could lose a window for good when a stale `ListWindows` landed after `WindowCreated`, and kept full-screen windows as `vela-default`, pausing the wallpaper for the run; lists now keep signalled windows and relist while ids are unresolved.
- Settings picked in one app did not reach the shell on a device (BroadcastChannel is same-origin); they now travel on Echo's `SettingChanged`.

#### Removed
- `BottomDock.tsx` (replaced by `LaunchBar.tsx`) and the minimize-before-panel workaround.
- The status bar's Bell and Settings gear.

### SDK (`@pyxis/app-sdk`)

#### Added
- `EchoClient.callMethodStrict` and policy-refusal rethrow (`isPolicyRefusal`, `installErrorText`) so a refused call never falls back to the mock's success.
- New modules: `session`, `accounts`, `privilege`, `services`, `useSession`, `useSetting`/`useBooleanSetting`, `useAudio`, `audio`, `notifications`, `thumbnails`, `overlay`, `clock`/`useLocation`, `identity` (`CORNER`, `waterdrop`, `SPINNER`, `shellTint`), `localDate`.
- Daylight engine (`wallpaper/`, `sun.ts`), `onSettingChange` with de-dupe, and a TS copy of the settings schema (`settingsSchema.ts`).
- `@pyxis/app-sdk/duyo`: `mountDuyoApp`, `pyxis.*` kinds, binders, `wallpaper` kind, ARIA pack, `adaptIsland`.
- Stateful in-memory mocks for browser dev (time, session, settings).

#### Changed
- `useEcho` and `EchoClient` rewritten around the real `window.geckoOS` bridge with typed service helpers.
- Bridge calls that hold for a password get a 150 s timeout.
- Dependencies: `remochi` 0.5.1 (from 0.3), `@duyojs/duyo` 1.1.3.

#### Removed
- `duyo/kinds/events.ts`.

### Apps

#### Added
- Settings: Appearance (theme with Auto, wallpaper thumbnails, Daylight scrubber, launch bar position), Date & Time (zones, location, sunrise/sunset), Sound, Accessibility, Network (with input validation), Users & Lock (profile, password, accounts, lock settings, Lock now), System, and About from `system.getInfo`.
- Vela (Browser) start page, shipped in `packages/apps/browser/public/start/`.
- Installer: declared-permission review (see `README.md`).

#### Changed
- All eight apps (browser, contacts, files, installer, notes, settings, tasks, terminal) are Duyo views: `*.view.json` plus code-behind over `@pyxis/app-sdk/duyo`, with React islands only in an app's own pack.
- Files uses a home scope with an unlockable read-only system scope.

### Tests

#### Added
- Vitest suites for shell components (`src/components/__tests__/`), hooks (`useWindows`, `useAppWindows`), SDK, and every app; contract suites that parse Rust sources so drift fails at the desk.
- `npm run build:all` checks `.view.gen.ts` freshness and TypeScript; ESLint and `npm test` kept green.

#### Fixed
- README is no longer the stock Vite template.

## [0.1.0-alpha.4] - 2026-09-25

Alpha 4 (tag `alpha4`): the app list comes from Nova instead of a hardcoded
array (shared registry store, tolerance for absolute icon paths) and the first
UI test suite landed. See `git log alpha3..alpha4` for details; earlier
releases are in git history.

# Pyxis Experience

The desktop shell (`bloom`), shared Echo IPC SDK (`@pyxis/app-sdk`), and built-in Duyo system applications for **Pyxis OS**.

## Workspace layout

- **`src/` — Bloom (Desktop Shell, Lock Screen & Overlay)**
  - `src/components/`: Launch bar, app drawer, quick settings, notification centre, desktop search, `TopSystemBar` (status strip & active privileged-access indicator), and `PrivilegePromptDialog` (shell overlay password prompt).
  - `src/lock/`: `LockScreen` with Daylight/waterdrop styling, multi-user account picker, and rate-limited unlock.
  - `src/overlay/`: `Alt+Tab` window switcher, card overview, and workspace overlay.
  - `src/hooks/`: Live bindings for `useApps`, `useWindows`, `useSettings`, `useNotifications`, `useSession`, and `useTheme`.
- **`packages/app-sdk/` — `@pyxis/app-sdk`**
  - Typed `EchoClient` over `window.geckoOS` (`org.geckoOS.*` services) with stateful browser-dev mocks when running outside Gecko.
  - Service helpers for `session`, `accounts`, `privilege` (`org.geckoOS.privilege`), `filesystem`, `settings`, `time`, `nova`, `appHost`, `notifications`, `audio`, and `wallpaper`.
  - Shared design tokens, Daylight dynamic wallpaper engine, Mochi/Duyo helpers (`@pyxis/app-sdk/duyo`), and `VelaIcon` / `AppDropIcon` components.
- **`packages/apps/` — Built-in Duyo System Applications**
  - `browser` — **Pyxis Vela** web browser
  - `files` — File manager (home scope + read-only/unlockable system scope)
  - `terminal` — Terminal emulator over `org.geckoOS.terminal`
  - `settings` — System settings (Appearance, Sound, Accessibility, Network, Date & Time, Users & Lock, System & Privileged Access, About)
  - `installer` — `.ipk` package installer with declared-permission review
  - `notes`, `contacts`, `tasks` — PIM suite

## Scripts

```sh
# Install workspace dependencies
npm install

# Run Bloom + all built-in app dev servers in parallel (with browser Echo mocks)
npm run dev:all

# Regenerate Duyo .view.gen.ts bindings from .view.json specs
npm run views

# Build SDK, all apps, and Bloom (checks .view.gen.ts freshness and TypeScript)
npm run build:all

# Run ESLint across the workspace
npm run lint

# Run all Vitest unit and contract suites
npm test
```

## Echo IPC & Native Bridge

When running inside Gecko on Pyxis OS, `@pyxis/app-sdk` talks to `window.geckoOS`, which is backed by `PyxisBridgeParent.sys.mjs` and `echo-daemon` over Unix-domain sockets. Sensitive actions (`privilege.Authenticate`, `session.lock`/`unlock`, window management, cross-app notifications) are capability-gated at the bridge so only trusted shell components can invoke them. Outside Gecko (`npm run dev` / Vitest), `EchoClient` automatically uses deterministic in-memory mocks.

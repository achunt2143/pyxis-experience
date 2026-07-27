// True when Bloom itself is running as a real pyxis:// app (i.e. composited
// by Evo, with real Wayland-client apps alongside it) rather than a plain
// dev browser tab. Checked via location.protocol (fixed at page load) rather
// than echoClient.isNative() so it can't race the bridge's async attachment.
//
// This is the single switch between two legitimate, deliberately different
// UI models:
//   - IN_COMPOSITOR: apps are separate Nova-launched vela processes that Evo
//     composites and decorates directly, in their own real xdg-toplevels.
//     Bloom must not draw its own window chrome/frame for them at all — a
//     second, DOM-drawn "window" around an app that already has a real,
//     separately-composited, Evo-decorated window is exactly the double
//     decoration / phantom-empty-window bug this switch exists to prevent
//     (see pyxis-webos-parity-analysis.md's "surfaces — a myth to retire").
//   - !IN_COMPOSITOR: local dev/design preview with no compositor running.
//     Apps are embedded by iframe so the shell still renders real app UI for
//     iteration; DesktopWindow's draggable/decorated frame is legitimate
//     there since there is no second, real window to conflict with.
export const IN_COMPOSITOR =
  typeof location !== 'undefined' && location.protocol === 'pyxis:';

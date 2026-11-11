import type { Component } from '@duyojs/duyo';

/**
 * Shows or hides `node`, and carries `attributes` only while it is shown. The old React app
 * rendered these elements only when they applied (an error line, the Auto note), and suites and
 * tests look for `[data-settings-error]` and the like by presence.
 */
export function present(node: Component, shown: boolean, attributes: Record<string, string | number | boolean> = {}): void {
  node.setShowing(shown);
  node.setAttributes(shown ? attributes : {});
}

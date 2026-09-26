import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NOTIFICATION_SIGNALS,
  clearNotifications,
  dismissNotification,
  listNotifications,
  onNotificationClosed,
  onNotificationShown,
  showNotification,
  type NotificationEntry,
} from '@pyxis/app-sdk';

/**
 * Notification contract tests.
 *
 * This is the nova contract suite's pattern applied to
 * org.geckoOS.notification. The mock in EchoClient.ts used to answer every
 * notification call with the same canned "System Ready" entry. So the
 * shell's centre "worked" in `npm run dev`, while on a device it called a
 * `list` method nothing had registered, and every notification vanished
 * into a `notify-send` that isn't installed. Each shape below is read out of
 * the Rust source, not restated here, so a field added to the store without
 * teaching the mock fails at the desk.
 */

const NOTIFICATION_RS = resolve(__dirname, '../../../../geckos/echo/src/services/notification.rs');
const DAEMON_RS = resolve(__dirname, '../../../../geckos/echo/src/bin/daemon.rs');
const haveRust = existsSync(NOTIFICATION_RS) && existsSync(DAEMON_RS);

/** Field names of `pub struct Notification`, camelCased as serde renames them. */
function rustNotificationFields(source: string): string[] {
  const at = source.indexOf('pub struct Notification {');
  if (at < 0) throw new Error('pub struct Notification not found in notification.rs');
  const body = source.slice(at, source.indexOf('\n}', at));
  return [...body.matchAll(/^\s+pub (\w+):/gm)].map((m) =>
    m[1].replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  );
}

function rustConst(source: string, name: string): string {
  const m = source.match(new RegExp(`pub const ${name}: &str = "([^"]+)";`));
  if (!m) throw new Error(`${name} not found in notification.rs`);
  return m[1];
}

afterEach(async () => {
  await clearNotifications();
});

describe('notification mock matches the Rust store', () => {
  it.runIf(haveRust)('carries every field the store serializes', async () => {
    const expected = rustNotificationFields(readFileSync(NOTIFICATION_RS, 'utf8'));
    // A parser that matched nothing must not pass vacuously.
    expect(expected).toEqual(expect.arrayContaining(['id', 'title', 'appId', 'timestamp']));

    await showNotification('hello', { body: 'world' });
    const [entry] = await listNotifications();
    expect(Object.keys(entry).sort()).toEqual([...expected].sort());
  });

  it.runIf(haveRust)('uses the store\'s signal names', () => {
    const rust = readFileSync(NOTIFICATION_RS, 'utf8');
    expect(NOTIFICATION_SIGNALS.shown).toBe(rustConst(rust, 'SIGNAL_SHOWN'));
    expect(NOTIFICATION_SIGNALS.closed).toBe(rustConst(rust, 'SIGNAL_CLOSED'));
  });

  it.runIf(haveRust)('calls only methods echo-daemon registers', () => {
    const daemon = readFileSync(DAEMON_RS, 'utf8');
    // The handlers register as `NOTIFICATION_IFACE, "<method>"`.
    const registered = [...daemon.matchAll(/NOTIFICATION_IFACE,\s*"(\w+)"/g)].map((m) => m[1]);
    expect(registered.sort()).toEqual(['close', 'closeAll', 'list', 'show']);
  });
});

describe('notification lifecycle', () => {
  it('lists newest first and signals show and close', async () => {
    const shown: NotificationEntry[] = [];
    const closed: string[] = [];
    const offShown = onNotificationShown((n) => shown.push(n));
    const offClosed = onNotificationClosed((id) => closed.push(id));

    const first = await showNotification('first');
    const second = await showNotification('second', { urgency: 'critical', timeout: 3000 });
    expect((await listNotifications()).map((n) => n.id)).toEqual([second, first]);
    expect(shown.map((n) => n.title)).toEqual(['first', 'second']);
    // As in the store: critical notifications stay until dismissed.
    expect(shown[1].timeout).toBe(0);

    expect(await dismissNotification(first!)).toBe(true);
    expect(await dismissNotification(first!)).toBe(false);
    expect(closed).toEqual([first]);

    expect(await clearNotifications()).toBe(1);
    expect(closed).toEqual([first, second]);
    expect(await listNotifications()).toEqual([]);

    offShown();
    offClosed();
  });
});

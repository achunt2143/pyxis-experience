import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import {
  SETTING_KEYS,
  createAccount,
  echoClient,
  getSessionState,
  lock,
  onLockChanged,
  setSetting,
  unlock,
  type NotificationEntry,
  type SessionState,
} from '@pyxis/app-sdk';
import { resetMockSession } from '../../../packages/app-sdk/src/sessionMock';
import { MotionContext, type MotionApi } from '../../useMotion';
import { LockScreen } from '../LockScreen';

/**
 * The lock screen as a page: its states by the selectors the device suite
 * uses, what it asks Echo, and what it shows of notifications. The walk
 * itself is lockMachine.test.ts; this is the wiring around it.
 */

const wallpaperProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock('@pyxis/app-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pyxis/app-sdk')>()),
  // The real wallpaper draws on a canvas jsdom doesn't have; what matters here is what the lock tells it.
  DynamicWallpaper: (props: Record<string, unknown>) => {
    wallpaperProps.last = props;
    return <div data-wallpaper-stub="" data-paused={String(props.paused)} data-motion={String(props.motion)} />;
  },
}));
vi.mock('../../hooks/useApps', () => {
  const apps = [
    { id: 'tasks', name: 'Tasks', category: 'pim' },
    { id: 'notes', name: 'Notes', category: 'pim' },
  ];
  return { useApps: () => ({ apps, loading: false, error: null, byId: (id: string) => apps.find((a) => a.id === id) }) };
});
vi.mock('../../components/AppIcon', () => ({ AppIcon: () => null }));

// remochi's Button measures its label on a canvas; jsdom has no 2d context.
HTMLCanvasElement.prototype.getContext = (() => ({
  font: '',
  measureText: (text: string) => ({ width: text.length * 8 }),
})) as unknown as HTMLCanvasElement['getContext'];

const motion = (mode: MotionApi['mode']): MotionApi => ({ mode, tr: (t) => t, to: (t) => t });
const withMotion = (mode: MotionApi['mode'], ui: React.ReactElement) => (
  <MotionContext.Provider value={motion(mode)}>{ui}</MotionContext.Provider>
);

const session = (over: Partial<SessionState> = {}): SessionState => ({
  locked: true,
  user: 'geckouser',
  display_name: 'Andrew',
  accent: '#7c6cf0',
  has_password: true,
  attempts_left: 5,
  retry_at_ms: null,
  ...over,
});

const note = (id: string, appId: string | null, title: string, body = ''): NotificationEntry => ({
  id,
  appId,
  title,
  body,
  timestamp: Date.now(),
});

const state = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-lock-screen]')!.dataset.lockState;
const key = (k: string) => fireEvent.keyDown(window, { key: k });
const type = (text: string) => [...text].forEach(key);

beforeEach(() => {
  localStorage.clear();
  resetMockSession();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('resting', () => {
  it('shows the clock, the day in two voices, the hint and whose screen it is', () => {
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    expect(state(container)).toBe('rest');
    expect(container.querySelector('[data-lock-clock]')?.textContent).toMatch(/^\d{1,2}:\d{2}$/);
    expect(container.querySelector('.lock-date b')?.textContent).toMatch(/^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day$/);
    expect(screen.getByText('Just type to unlock')).toBeTruthy();
    expect(container.querySelector('.lock-mini')?.textContent).toBe('AAndrew');
    // No field until something wakes it.
    expect(container.querySelector('[data-lock-field]')).toBeNull();
  });

  it('draws the lens as a lightened gradient where there is no -moz-element', () => {
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    const lens = container.querySelector<HTMLElement>('[data-lock-clock]')!;
    expect(lens.dataset.lens).toBe('gradient');
    expect(lens.style.backgroundImage).toContain('radial-gradient');
    // Its own wallpaper sits behind the digits, under the id the lens would borrow.
    expect(container.querySelector('#lock-wallpaper [data-wallpaper-stub]')).toBeTruthy();
  });

  it('honours pyxis.clock24h', async () => {
    await setSetting(SETTING_KEYS.clock24h, true);
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    await waitFor(() => expect(container.querySelector('[data-lock-clock]')?.textContent).toMatch(/^\d{2}:\d{2}$/));
  });
});

describe('waking and typing', () => {
  it('the waking key is the first character of the password, and the field reports where Clear opens from', async () => {
    const calls = vi.spyOn(echoClient, 'callMethod');
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    key('p');
    expect(state(container)).toBe('awake');
    const field = container.querySelector('[data-lock-field]');
    expect(field).toBeTruthy();
    expect(field!.querySelectorAll('.lock-dot')).toHaveLength(1);
    type('yx');
    expect(field!.querySelectorAll('.lock-dot')).toHaveLength(3);
    key('Backspace');
    expect(field!.querySelectorAll('.lock-dot')).toHaveLength(2);

    // jsdom has no layout, so the origin is the field's usual place; what matters is that Evo is told.
    const origin = calls.mock.calls.find((c) => c[2] === 'SetLockOrigin');
    expect(origin).toBeTruthy();
    expect(origin![3]).toEqual({ x: window.innerWidth / 2, y: Math.round(window.innerHeight * 0.565) });
  });

  it('a click wakes it; Escape puts it back to sleep', () => {
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    fireEvent.pointerDown(container.querySelector('[data-lock-screen]')!);
    expect(state(container)).toBe('awake');
    key('Escape');
    expect(state(container)).toBe('rest');
  });

  it('a chord is not a password character, while AltGr, dead-key composition, and Ctrl+V paste work cleanly', async () => {
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'l', metaKey: true });
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.keyDown(window, { key: 'Super' });
    fireEvent.keyDown(window, { key: 'l', altKey: true });
    expect(state(container)).toBe('rest');

    // AltGr composition (@ via Ctrl+Alt+AltGraph) enters password buffer.
    fireEvent.keyDown(window, { key: '@', ctrlKey: true, altKey: true, modifierAltGraph: true });
    expect(state(container)).toBe('awake');
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(1);

    // Dead-key composition (Dead followed by composed é with isComposing) enters password buffer.
    fireEvent.keyDown(window, { key: 'Dead' });
    fireEvent.keyDown(window, { key: 'é', isComposing: true });
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(2);

    // IME compositionstart / compositionend commits exactly once.
    fireEvent(window, new CompositionEvent('compositionstart'));
    fireEvent.keyDown(window, { key: 'a', isComposing: true });
    fireEvent(window, new CompositionEvent('compositionend', { data: 'á' }));
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(3);

    // Ctrl+V + native paste appends characters cleanly (stripping newlines).
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
      clipboardData: { getData: (t: string) => string };
    };
    pasteEvent.clipboardData = { getData: () => 'xy\n' };
    fireEvent(window, pasteEvent);
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(5);

    // Ctrl+V clipboard API fallback when native paste doesn't fire.
    const origClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue('z') },
    });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    await waitFor(() => expect(container.querySelectorAll('.lock-dot')).toHaveLength(6));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: origClipboard });
  });

  it('shows live Caps Lock indicator when typing password and hides when released', () => {
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    expect(container.querySelector('[data-lock-caps]')).toBeNull();

    fireEvent.keyDown(window, { key: 'A', modifierCapsLock: true });
    expect(state(container)).toBe('awake');
    expect(container.querySelector('[data-lock-caps]')?.textContent).toContain('Caps Lock is on');

    fireEvent.keyUp(window, { key: 'CapsLock', modifierCapsLock: false });
    expect(container.querySelector('[data-lock-caps]')).toBeNull();
  });
});

describe('trying a password', () => {
  it('a wrong one shakes, burns, says so, and the field is ready again', async () => {
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    type('nope');
    key('Enter');
    await waitFor(() => expect(state(container)).toBe('wrong'));
    const field = container.querySelector<HTMLElement>('[data-lock-field]')!;
    expect(field.dataset.wrong).toBe('true');
    expect(field.querySelectorAll('.lock-dot[data-bad="true"]')).toHaveLength(4);
    expect(screen.getByText('Not quite. Try again.')).toBeTruthy();
    await waitFor(() => expect(state(container)).toBe('awake'), { timeout: 2000 });
    expect(field.querySelectorAll('.lock-dot')).toHaveLength(0);
  });

  it('the right one is accepted, and Clear starts when LockChanged says so', async () => {
    await lock();
    const changes: boolean[] = [];
    const off = onLockChanged((c) => changes.push(c.locked));
    const { container, rerender } = render(
      withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />)
    );
    type('pyxis');
    key('Enter');
    await waitFor(() => expect(changes).toEqual([false]));
    // Echo has answered; the screen waits for the layer to say Clear has begun.
    expect(state(container)).toBe('verify');
    rerender(withMotion('off', <LockScreen session={session({ locked: false })} notifications={[]} unlocking />));
    expect(state(container)).toBe('unlocking');
    off();
  });

  it('shows the spinner while checking, not before', async () => {
    const { container } = render(withMotion('full', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    type('x');
    expect(container.querySelector('.lock-spin')).toBeNull();
    key('Enter');
    expect(state(container)).toBe('verify');
    expect(container.querySelector('.lock-spin')).toBeTruthy();
    const login = container.querySelector<HTMLButtonElement>('.lock-login')!;
    expect(login.getAttribute('data-busy')).toBe('true');
    expect(login.disabled).toBe(true);
    expect(login.getAttribute('aria-label')).toBe('Checking');
    // Typing is shut out while it checks.
    type('zz');
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(1);
  });

  it('clicking the remochi Login button submits the password', async () => {
    await lock();
    const changes: boolean[] = [];
    const off = onLockChanged((c) => changes.push(c.locked));
    const { container } = render(
      withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />)
    );
    type('pyxis');
    expect(container.querySelector('[data-lock-field] button')).toBeNull();
    const login = screen.getByRole('button', { name: 'Login' }) as HTMLButtonElement;
    expect(login.classList.contains('lock-login')).toBe(true);
    expect(login.querySelector('.mochi-bracket-left')?.textContent).toBe('(');
    expect(login.querySelector('.mochi-bracket-right')?.textContent).toBe(')');
    expect(login.textContent).toContain('Login');
    fireEvent.click(login);
    await waitFor(() => expect(changes).toEqual([false]));
    expect(state(container)).toBe('verify');
    off();
  });
});

describe('the rate limit', () => {
  it('the fifth wrong try starts a wait: a ring counts down round the avatar, from Echo’s retry_at_ms', async () => {
    for (let i = 0; i < 4; i++) await unlock('bad');
    const { container } = render(
      withMotion('off', <LockScreen session={(await getSessionState()) && session({ attempts_left: 1 })} notifications={[]} unlocking={false} />)
    );
    type('bad');
    key('Enter');
    await waitFor(() => expect(state(container)).toBe('wait'), { timeout: 3000 });
    expect(screen.getByText(/^Try again in 0:(30|29)$/)).toBeTruthy();
    const ring = container.querySelector('.lock-wait-ring')!;
    expect(ring).toBeTruthy();
    expect(Number(ring.getAttribute('data-wait-fraction'))).toBeGreaterThan(0.9);
    // No typing during a wait.
    type('abc');
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(0);
  });

  it('a screen that wakes mid-wait goes to the wait, counts down, and frees the field at the end', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(1_700_000_000_000);
    const retry = Date.now() + 30_000;
    const { container } = render(
      withMotion('off', <LockScreen session={session({ attempts_left: 0, retry_at_ms: retry })} notifications={[]} unlocking={false} />)
    );
    key('a');
    expect(state(container)).toBe('wait');
    expect(screen.getByText('Try again in 0:30')).toBeTruthy();
    expect(container.querySelector('.lock-wait-ring')!.getAttribute('data-wait-fraction')).toBe('1.000');

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    // The ring's text lags its clock by a tick at most.
    expect(screen.getByText(/^Try again in 0:(15|14)$/)).toBeTruthy();
    const half = Number(container.querySelector('.lock-wait-ring')!.getAttribute('data-wait-fraction'));
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);

    act(() => {
      vi.advanceTimersByTime(15_100);
    });
    expect(state(container)).toBe('awake');
    expect(container.querySelector('.lock-wait-ring')).toBeNull();
  });
});

describe('no password set', () => {
  it('is press-to-enter: says how to protect the screen, shows no field, and Enter unlocks', async () => {
    resetMockSession(null);
    await lock();
    const changes: boolean[] = [];
    const off = onLockChanged((c) => changes.push(c.locked));
    const { container } = render(
      withMotion('off', <LockScreen session={session({ has_password: false })} notifications={[]} unlocking={false} />)
    );
    expect(state(container)).toBe('no-password');
    expect(screen.getByText('Press Enter to unlock')).toBeTruthy();
    expect(screen.getByText('Set a password in Settings → Users to protect this screen')).toBeTruthy();
    expect(container.querySelector('[data-lock-field]')).toBeNull();

    // Typing and clicking don't unlock a screen that has nothing to type into.
    type('abc');
    fireEvent.pointerDown(container.querySelector('[data-lock-screen]')!);
    expect(state(container)).toBe('no-password');
    expect(changes).toEqual([]);

    key('Enter');
    await waitFor(() => expect(changes).toEqual([false]));
    off();
  });

  it('Clear from press-to-enter opens from the field’s usual place, since there never was a field', () => {
    const { container } = render(
      withMotion('off', <LockScreen session={session({ has_password: false })} notifications={[]} unlocking />)
    );
    expect(state(container)).toBe('unlocking');
    expect(container.querySelector('[data-lock-screen]')!.getAttribute('data-field-on')).toBe('false');
    expect(container.querySelector('[data-lock-field]')).toBeNull();
  });
});

describe('ambient', () => {
  it('after 30 s untouched the wallpaper stops and the clock thins to an outline; a key wakes it', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(1_700_000_000_000);
    const { container } = render(withMotion('full', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    expect(container.querySelector<HTMLElement>('[data-wallpaper-stub]')!.dataset.paused).toBe('false');

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(state(container)).toBe('ambient');
    const wall = container.querySelector<HTMLElement>('[data-wallpaper-stub]')!;
    expect(wall.dataset.paused).toBe('true');
    expect(wall.dataset.motion).toBe('still');
    // The outline has no lens fill, and there is no glow under it.
    expect(container.querySelector<HTMLElement>('[data-lock-clock]')!.style.backgroundImage).toBe('none');
    expect(container.querySelector('.lock-lens-glow')).toBeNull();

    key('q');
    expect(state(container)).toBe('awake');
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(1);
    expect(container.querySelector<HTMLElement>('[data-wallpaper-stub]')!.dataset.paused).toBe('false');
  });
});

describe('notifications on the lock screen (pyxis.lock.notifications)', () => {
  const stored = [
    note('1', 'tasks', 'Standup in 10 min', 'Launch bar offsets for bridge-deny'),
    note('2', 'tasks', 'Review due', 'Evo frost lane'),
    note('3', 'notes', 'Groceries', 'Lemons, rye, oat milk'),
  ];
  const draw = () =>
    render(withMotion('off', <LockScreen session={session()} notifications={stored} unlocking={false} />)).container;

  it('counts only by default: who has something and how many, never the text', async () => {
    const container = draw();
    await waitFor(() => expect(container.querySelector('[data-lock-notes="count"]')).toBeTruthy());
    const chips = [...container.querySelectorAll<HTMLElement>('[data-lock-note]')];
    expect(chips.map((c) => [c.dataset.lockNote, c.dataset.count])).toEqual([
      ['tasks', '2'],
      ['notes', '1'],
    ]);
    expect(container.textContent).toContain('Tasks');
    expect(container.textContent).toContain('2 new');
    for (const secret of ['Standup', 'bridge-deny', 'Review due', 'Groceries', 'Lemons']) {
      expect(container.textContent).not.toContain(secret);
    }
  });

  it('full shows titles and bodies', async () => {
    await setSetting(SETTING_KEYS.lockNotifications, 'full');
    const container = draw();
    await waitFor(() => expect(container.querySelector('[data-lock-notes="full"]')).toBeTruthy());
    expect(container.textContent).toContain('Standup in 10 min');
    expect(container.textContent).toContain('Launch bar offsets for bridge-deny');
    expect(container.textContent).toContain('Lemons, rye, oat milk');
  });

  it('hidden shows nothing at all', async () => {
    await setSetting(SETTING_KEYS.lockNotifications, 'hidden');
    const container = draw();
    await waitFor(() => expect(container.querySelector('[data-lock-screen]')!.getAttribute('data-lock-notes-mode')).toBe('hidden'));
    expect(container.querySelector('[data-lock-notes]')).toBeNull();
    expect(container.querySelector('[data-lock-note]')).toBeNull();
    expect(container.textContent).not.toContain('Tasks');
    expect(container.textContent).not.toContain('new');
  });

  it('no notifications, no chips; a quiet screen shows one dim drop per app, with no text', async () => {
    const empty = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />)).container;
    expect(empty.querySelector('[data-lock-notes]')).toBeNull();
    cleanup();

    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={stored} unlocking={false} />));
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    const dots = container.querySelector('[data-lock-notes="ambient"]')!;
    expect(dots.querySelectorAll('.lock-notes-dot')).toHaveLength(2);
    expect(dots.textContent).toBe('');
  });
});

describe('motion modes', () => {
  it('says which one it draws in, for the stylesheet (reduced fades only, off is instant)', () => {
    for (const mode of ['full', 'reduced', 'off'] as const) {
      const { container } = render(withMotion(mode, <LockScreen session={session()} notifications={[]} unlocking={false} />));
      expect(container.querySelector('[data-lock-screen]')!.getAttribute('data-motion')).toBe(mode);
      cleanup();
    }
  });

  it('the stylesheet stops the halo, the orb and the drip in reduced and everything in off', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '../LockScreen.css'), 'utf8');
    expect(css).toMatch(/\[data-motion='reduced'\] \*,[\s\S]*?animation: none !important/);
    expect(css).toMatch(/\[data-motion='off'\] \*,[\s\S]*?transition: none !important/);
    // Reduced fades are at most 150 ms.
    for (const m of css.matchAll(/transition: opacity ([0-9.]+)s linear/g)) expect(Number(m[1])).toBeLessThanOrEqual(0.15);
  });
});

describe('multi-user waterdrop picker', () => {
  it('shows the waterdrop picker row when multiple accounts exist and unlocks as the selected user', async () => {
    await createAccount({
      user: 'maya',
      display_name: 'Maya',
      accent: '#EC4899',
      password: 'secret',
    });
    await lock();

    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    fireEvent.pointerDown(container.querySelector('[data-lock-screen]')!);
    await waitFor(() => expect(container.querySelector('[data-lock-users]')).toBeTruthy());

    const mayaBtn = container.querySelector<HTMLButtonElement>('[data-lock-user="maya"]')!;
    expect(mayaBtn.getAttribute('data-selected')).toBe('false');
    fireEvent.click(mayaBtn);

    await waitFor(() => {
      const selected = container.querySelector('[data-lock-user="maya"]')!;
      expect(selected.getAttribute('data-selected')).toBe('true');
    });
    expect(container.querySelector('.lock-name')?.textContent).toBe('Maya');

    type('secret');
    key('Enter');
    await waitFor(async () => {
      const s = await getSessionState();
      expect(s?.locked).toBe(false);
      expect(s?.user).toBe('maya');
    });
  });

  it('clears typed password dots when switching to another user', async () => {
    await createAccount({
      user: 'maya',
      display_name: 'Maya',
      accent: '#EC4899',
      password: 'secret',
    });
    await lock();

    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    await waitFor(() => expect(container.querySelector('[data-lock-users]')).toBeTruthy());

    type('abc');
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(3);

    const mayaBtn = container.querySelector<HTMLButtonElement>('[data-lock-user="maya"]')!;
    fireEvent.click(mayaBtn);

    await waitFor(() => {
      expect(container.querySelector('[data-lock-user="maya"]')?.getAttribute('data-selected')).toBe('true');
    });
    expect(container.querySelectorAll('.lock-dot')).toHaveLength(0);
  });

  it('keeps Tab from jumping focus to peer selector buttons or Login button', async () => {
    await createAccount({
      user: 'maya',
      display_name: 'Maya',
      accent: '#EC4899',
      password: 'secret',
    });
    await lock();

    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    await waitFor(() => expect(container.querySelector('[data-lock-users]')).toBeTruthy());

    const mayaBtn = container.querySelector<HTMLButtonElement>('[data-lock-user="maya"]')!;
    const loginBtn = container.querySelector<HTMLButtonElement>('.lock-login')!;
    expect(mayaBtn.tabIndex).toBe(-1);
    expect(loginBtn.tabIndex).toBe(-1);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(document.body);
  });
});

describe('unlock grace timeout verification', () => {
  it('does not fake unlocking if LockChanged never arrived and Echo still reports locked', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(echoClient, 'callMethodStrict').mockImplementation(async (_svc, _iface, method) => {
      if (method === 'unlock') return { ok: true };
      if (method === 'getState') {
        return {
          locked: true,
          user: 'geckouser',
          display_name: 'Andrew',
          accent: '#7c6cf0',
          has_password: true,
          attempts_left: 5,
          retry_at_ms: null,
        };
      }
      return { users: [] };
    });

    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    type('pyxis');
    key('Enter');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(state(container)).toBe('verify');

    // The verify minimum (0 ms when motion is off) lets the result land and
    // arms the grace timer; then the grace runs out and Echo is asked.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    // Must stay interactive instead of faking 'unlocking' while locked.
    expect(state(container)).toBe('awake');
    expect(container.querySelector('[data-lock-message]')?.textContent).toContain('Could not confirm unlock');
  });

  it('transitions to unlocking after grace timeout if getSessionState confirms unlocked', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(echoClient, 'callMethodStrict').mockImplementation(async (_svc, _iface, method) => {
      if (method === 'unlock') return { ok: true };
      if (method === 'getState') {
        return {
          locked: false,
          user: 'geckouser',
          display_name: 'Andrew',
          accent: '#7c6cf0',
          has_password: true,
          attempts_left: 5,
          retry_at_ms: null,
        };
      }
      return { users: [] };
    });

    const { container } = render(withMotion('off', <LockScreen session={session()} notifications={[]} unlocking={false} />));
    type('pyxis');
    key('Enter');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(state(container)).toBe('verify');

    // The verify minimum (0 ms when motion is off) lets the result land and
    // arms the grace timer; then the grace runs out and Echo is asked.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(state(container)).toBe('unlocking');
  });

  it('CSS truncates long usernames and wraps/scrolls multi-user lists', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '../LockScreen.css'), 'utf8');
    expect(css).toMatch(/\.lock-name\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.lock-mini-name\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.lock-users\s*\{[\s\S]*?flex-wrap:\s*wrap[\s\S]*?overflow-y:\s*auto/);
  });
});

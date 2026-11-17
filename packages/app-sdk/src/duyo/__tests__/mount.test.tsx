// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kind } from '@duyojs/duyo';
import { adapt, createPack } from '@duyojs/duyo/react';

vi.mock('../../usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));


import { mountDuyoApp, type DuyoApp } from '../mount';

// A root with a published windowId, a remochi.Button that closes it, and a plain Control.
kind({
  name: 'MountTest.App',
  kind: 'duyo.Control',
  published: { windowId: '' },
  events: { onClose: '' },
  components: [
    { kind: 'remochi.Button', name: 'closeButton', content: 'Close', ontap: 'close' },
    { name: 'plain', content: 'hello' },
  ],
  close() {
    this.doClose();
  },
});

// Closes by bubbling from a descendant, and vetoes through a kind-level handler.
kind({
  name: 'MountTest.Veto',
  kind: 'duyo.Control',
  handlers: { onClose: 'veto' },
  components: [{ kind: 'remochi.Button', name: 'closeButton', content: 'Close', ontap: 'close' }],
  close() {
    this.$.closeButton!.bubble('onClose');
  },
  veto() {
    return true;
  },
});

// No windowId declared.
kind({ name: 'MountTest.Bare', kind: 'duyo.Control', content: 'bare' });

// remochi's Button measures its label on a canvas, which jsdom has no 2d context for.
HTMLCanvasElement.prototype.getContext = (() => ({
  font: '',
  measureText: (text: string) => ({ width: text.length * 8 }),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

let host: HTMLElement;
let app: DuyoApp | undefined;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => app?.unmount());
  app = undefined;
  host.remove();
  window.history.replaceState(null, '', '/');
  Reflect.deleteProperty(window, 'parent');
  vi.restoreAllMocks();
});

async function mount(root: Parameters<typeof mountDuyoApp>[0], search = '') {
  window.history.replaceState(null, '', `/${search}`);
  await act(async () => {
    app = mountDuyoApp(root, { element: host });
  });
  return app!;
}

const click = (label: string) =>
  fireEvent.click([...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!);

describe('mountDuyoApp', () => {
  it('renders the kind through the packs, in a full-viewport column inside the theme wrapper', async () => {
    await mount('MountTest.App');
    // remochi's Button draws its "( )" caps as text.
    expect(host.querySelector('button')?.textContent).toContain('Close');
    expect(host.textContent).toContain('hello');
    const column = host.querySelector<HTMLElement>('.mochi-theme-light > div');
    expect(column?.style.display).toBe('flex');
    expect(column?.style.flexDirection).toBe('column');
    expect(column?.style.width).toBe('100vw');
  });

  it('takes windowId from the query when the kind declares it', async () => {
    const duyo = await mount('MountTest.App', '?windowId=win-7');
    expect(duyo.root.get('windowId')).toBe('win-7');
  });

  it('defaults windowId to standalone', async () => {
    const duyo = await mount('MountTest.App');
    expect(duyo.root.get('windowId')).toBe('standalone');
  });

  it('accepts a kind definition and a component definition, and skips windowId on a kind without it', async () => {
    const bare = await mount({ name: 'MountTest.Bare' });
    expect(bare.root.kind).toBe('MountTest.Bare');
    expect(bare.root.get('windowId')).toBeUndefined();
    act(() => bare.unmount());

    const duyo = await mount({ kind: 'MountTest.App', name: 'main', windowId: 'explicit' }, '?windowId=ignored');
    expect(duyo.root.name).toBe('main');
    expect(duyo.root.get('windowId')).toBe('explicit');
  });

  it('posts pyxis:app-close to the parent when framed', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { value: { postMessage }, configurable: true });
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    await mount('MountTest.App', '?windowId=win-3');
    click('Close');
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'pyxis:app-close', windowId: 'win-3' }, '*');
    expect(close).not.toHaveBeenCalled();
  });

  it('calls window.close when it is the top-level document', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const postMessage = vi.spyOn(window, 'postMessage');
    await mount('MountTest.App');
    click('Close');
    expect(close).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('closes on an onClose bubbled from anywhere in the tree, and a handler can veto it', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const duyo = await mount('MountTest.App');
    duyo.root.$.plain!.bubble('onClose');
    expect(close).toHaveBeenCalledOnce();
    act(() => duyo.unmount());

    await mount('MountTest.Veto');
    click('Close');
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not close when a remochi Dialog dismisses itself (onClose stays local, onDismiss bubbles)', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const events: string[] = [];
    kind({
      name: 'MountTest.WithDialog',
      kind: 'duyo.Control',
      components: [
        {
          kind: 'remochi.Dialog',
          name: 'dialog',
          open: true,
          dialogType: 'confirm',
          cancelText: 'Cancel',
          onClose: 'dialogClosed',
          onDismiss: 'dialogDismissed',
        },
      ],
      dialogClosed() {
        events.push('close');
        return true;
      },
      dialogDismissed() {
        events.push('dismiss');
        return true;
      },
    });
    await mount('MountTest.WithDialog');
    const cancel = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Cancel'))!;
    act(() => {
      fireEvent.click(cancel);
    });
    expect(events).toEqual(['close', 'dismiss']);
    expect(close).not.toHaveBeenCalled();
  });

  it('installs and draws the app’s own packs', async () => {
    const island = adapt({
      name: 'MountTest.Island',
      component: ({ label }: { label: string }) => <em>{label}</em>,
      published: { label: '' },
      props: (node) => ({ label: node.get('label') }),
    });
    kind({ name: 'MountTest.WithIsland', kind: 'duyo.Control', components: [{ kind: 'MountTest.Island', label: 'from the island' }] });
    await act(async () => {
      app = mountDuyoApp('MountTest.WithIsland', { element: host, packs: [createPack('mount-test', [island])] });
    });
    expect(host.querySelector('em')?.textContent).toBe('from the island');
  });

  it('unmount removes the tree and destroys the root', async () => {
    const duyo = await mount('MountTest.App');
    act(() => duyo.unmount());
    expect(host.innerHTML).toBe('');
    expect(duyo.root.destroyed).toBe(true);
  });

  it('can be mounted twice in one document without a registration clash', async () => {
    const a = await mount('MountTest.App');
    const second = document.createElement('div');
    document.body.appendChild(second);
    await act(async () => {
      const b = mountDuyoApp('MountTest.App', { element: second });
      b.unmount();
    });
    second.remove();
    expect(a.root.destroyed).toBe(false);
  });
});

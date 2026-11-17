import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AppHostProvider, waterdrop } from '@pyxis/app-sdk';
import { appHue } from '../../apps/registry';
import { STATUS_STRIP_HEIGHT } from '../../components/TopSystemBar';

/**
 * Lane C of the visual identity (geckos/docs/internal/
 * pyxis-visual-identity-plan.md): the overview's cards, the app drawer and
 * quick settings in the waterdrop corner, the tinted material and Mochi
 * type. These pin the look's structure; behaviour is covered elsewhere
 * (switcher.test.tsx for the overview, flight.test.ts for its maths).
 */

const { views } = vi.hoisted(() => ({
  views: [
    // A window wider than its preview: the preview's top corners shrink with it.
    { appId: 'terminal', sessionId: 's-t', state: 'running', windows: [{ windowId: 1, x: 60, y: 60, width: 900, height: 600 }], windowId: 1, focused: true, minimized: false, starting: false, crashed: false },
    { appId: 'files', sessionId: 's-f', state: 'running', windows: [{ windowId: 2, x: 90, y: 90, width: 900, height: 600 }], windowId: 2, focused: false, minimized: false, starting: false, crashed: false },
    // No accent of its own.
    { appId: 'com.example.plain', sessionId: 's-p', state: 'running', windows: [{ windowId: 3 }], windowId: 3, focused: false, minimized: false, starting: false, crashed: false },
  ],
}));
vi.mock('../../utils/environment', () => ({ IN_COMPOSITOR: true }));
vi.mock('../../hooks/useAppWindows', () => ({ useAppWindows: () => ({ views }) }));
vi.mock('../../hooks/useApps', () => {
  const apps = [
    { id: 'terminal', name: 'Terminal', category: 'system' },
    { id: 'files', name: 'Files', category: 'system' },
    { id: 'notes', name: 'Notes', category: 'pim' },
  ];
  return {
    useApps: () => ({
      apps,
      loading: false,
      error: null,
      byId: (id: string) => apps.find((a) => a.id === id) ?? { id, name: id },
    }),
  };
});
vi.mock('../../components/AppIcon', () => ({ AppIcon: () => null }));

afterEach(() => cleanup());

// remochi's Toggle and Button measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// remochi's Slider draws its value bubble on a canvas; jsdom has none, so a
// context whose every member is a no-op stands in.
const noop2d: unknown = new Proxy(() => {}, {
  get: (_t, key) => (key === 'measureText' ? () => ({ width: 0 }) : noop2d),
  set: () => true,
  apply: () => noop2d,
});
HTMLCanvasElement.prototype.getContext = (() => noop2d) as unknown as HTMLCanvasElement['getContext'];

describe('overview cards', () => {
  async function draw(selected: number) {
    const { default: CardOverview } = await import('../../components/CardOverview');
    return render(
      <CardOverview
        isOpen
        switcher={{ order: [1, 2, 3], selected, committed: null }}
        onClose={() => {}}
        windows={[]}
        onSelectWindow={() => {}}
        onCloseWindow={() => {}}
      />
    );
  }
  const card = (root: HTMLElement, app: string) => root.querySelector<HTMLElement>(`[data-app="${app}"]`)!;
  const plate = (root: HTMLElement, app: string) => card(root, app).querySelector<HTMLElement>('[data-card-plate]')!;

  it('cards, their plates and their strips take the waterdrop corner', async () => {
    const { container } = await draw(1);
    for (const app of ['terminal', 'files', 'com.example.plain']) {
      expect(card(container, app).style.borderRadius).toBe('var(--px-corner)');
      expect(plate(container, app).style.borderRadius).toBe('var(--px-corner)');
      const strip = card(container, app).querySelector<HTMLElement>('[data-card-strip]')!;
      expect(strip.style.borderRadius).toBe('var(--px-corner-tl) var(--px-corner-tr) 0 0');
    }
  });

  it('the picture is clipped to the frame’s own corners, shrunk, and to the card’s at the bottom', async () => {
    const { container } = await draw(1);
    // A 900x600 window gets a 255 px preview: scale 900/255. Evo's corners are
    // 16 and 4 (one px more, so no black fringe), divided by that.
    const preview = card(container, 'terminal').querySelector<HTMLElement>('[data-preview]')!;
    expect(preview.style.overflow).toBe('hidden');
    expect(preview.style.borderRadius).toBe('4.82px 1.42px var(--px-corner-br) var(--px-corner-bl)');
  });

  it('the chosen card is ringed in its own accent, 4 px out; the others are not', async () => {
    const { container } = await draw(2);
    const chosen = plate(container, 'files');
    expect(card(container, 'files').dataset.selected).toBe('true');
    expect(chosen.style.outline).toContain(appHue('files')!);
    expect(chosen.style.outlineOffset).toBe('4px');
    expect(chosen.style.border).toBe('');
    expect(plate(container, 'terminal').style.outline).toContain('transparent');
  });

  it('an app with no accent is ringed in the Pyxis accent', async () => {
    const { container } = await draw(3);
    expect(plate(container, 'com.example.plain').style.outline).toContain('var(--color-primary');
  });

  it('the heading is CARDS in display type, on the material’s strip tint', async () => {
    const { container } = await draw(1);
    const heading = container.querySelector<HTMLElement>('[data-overview-heading]')!;
    expect(heading.textContent).toBe('Cards');
    expect(heading.className).toContain('px-display');
    const strip = card(container, 'terminal').querySelector<HTMLElement>('[data-card-strip]')!;
    expect(strip.textContent).toContain('Terminal');
    expect(strip.querySelector('.px-ui')?.textContent).toBe('Terminal');
  });
});

describe('app drawer', () => {
  async function draw() {
    const { default: AppDrawer } = await import('../../components/AppDrawer');
    return render(
      <AppHostProvider>
        <AppDrawer isOpen onClose={() => {}} />
      </AppHostProvider>
    );
  }

  it('is the strong material in the waterdrop corner, headed APPLICATIONS in display type', async () => {
    const { container } = await draw();
    const drawer = container.querySelector<HTMLElement>('[data-app-drawer]')!;
    expect(drawer.style.background).toBe('var(--px-material-strong)');
    expect(drawer.style.color).toBe('var(--px-material-ink)');
    expect(drawer.parentElement!.style.borderRadius).toBe('var(--px-corner)');
    const heading = container.querySelector<HTMLElement>('[data-drawer-heading]')!;
    expect(heading.textContent).toBe('Applications');
    expect(heading.className).toContain('px-display');
  });

  it('keeps a search box and four category tabs, and draws icons as 56 px waterdrops', async () => {
    const { container } = await draw();
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['All', 'PIM', 'Utilities', 'System']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    const tiles = [...container.querySelectorAll<HTMLElement>('button > div')].filter(
      (d) => d.style.width === '56px'
    );
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) expect(tile.style.borderRadius).toBe(waterdrop(56));
  });
});

describe('quick settings', () => {
  async function draw() {
    const { default: QuickSettingsMenu } = await import('../../components/QuickSettingsMenu');
    return render(<QuickSettingsMenu isOpen onOpenChange={() => {}} onLaunchApp={() => {}} />);
  }

  it('hangs 8 px under the strip and 14 px from the right edge, where the device suite looks', async () => {
    const { container } = await draw();
    const panel = container.ownerDocument.querySelector<HTMLElement>('[data-quick-settings]')!;
    expect(panel.style.top).toBe(`${STATUS_STRIP_HEIGHT + 8}px`);
    expect(panel.style.right).toBe('14px');
    expect(panel.style.borderRadius).toBe('var(--px-corner)');
    expect(panel.style.background).toBe('var(--px-material-strong)');
    const heading = panel.querySelector<HTMLElement>('[data-qs-heading]')!;
    expect(heading.textContent).toBe('Quick settings');
    expect(heading.className).toContain('px-display');
  });

  it('draws the toggles as tiles, each switch still remochi’s, Do Not Disturb in the right column', async () => {
    const { container } = await draw();
    const panel = container.ownerDocument.querySelector<HTMLElement>('[data-quick-settings]')!;
    const tiles = [...panel.querySelectorAll<HTMLElement>('[data-qs-tile]')];
    expect(tiles.map((t) => t.dataset.qsTile)).toEqual(['wifi', 'dnd', 'theme', 'battery-percent']);
    for (const tile of tiles) {
      expect(tile.className).toBe('px-qs-tile');
      expect(tile.style.borderRadius).toBe('var(--px-corner-40)');
    }
    // Wi-Fi is a status, not a control.
    expect(tiles[0].querySelector('[role="switch"]')).toBeNull();
    for (const tile of tiles.slice(1)) expect(tile.querySelectorAll('[role="switch"]')).toHaveLength(1);
  });

  it('keeps both sliders inside the quick-settings slider scope with remochi’s round thumb', async () => {
    const { container } = await draw();
    const scope = container.ownerDocument.querySelector<HTMLElement>('.px-qs-sliders')!;
    expect(scope.querySelectorAll('[role="slider"]')).toHaveLength(2);
    const volumeSlider = scope.querySelector<HTMLElement>('[data-qs-slider="volume"] [role="slider"]')!;
    expect(volumeSlider).not.toBeNull();
    const thumb = volumeSlider.querySelector<HTMLElement>(':scope > div > div:last-child')!;
    expect(getComputedStyle(thumb).borderRadius).toBe('50%');
  });
});

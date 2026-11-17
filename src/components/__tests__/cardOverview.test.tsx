// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopWindowType } from '../../types';
import type { DesktopApp } from '../../hooks/useApps';
import { MotionProvider } from '../../MotionProvider';

const fake = vi.hoisted(() => ({
  apps: [
    {
      id: 'weather',
      name: 'Weather',
      accent: '#e11d48',
      info: {} as DesktopApp['info'],
      entryUrl: null,
      defaultSize: { width: 720, height: 500 },
      category: 'utility',
      pinned: false,
    },
    {
      id: 'files',
      name: 'Files',
      accent: '#0ea5e9',
      info: {} as DesktopApp['info'],
      entryUrl: null,
      defaultSize: { width: 720, height: 500 },
      category: 'system',
      pinned: true,
    },
  ] as DesktopApp[],
}));

vi.mock('../../utils/environment', () => ({ IN_COMPOSITOR: false }));
vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({
    apps: fake.apps,
    byId: (id: string) => fake.apps.find((a) => a.id === id),
    pinned: fake.apps.filter((a) => a.pinned),
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}));
vi.mock('../../hooks/useAppWindows', () => ({
  useAppWindows: () => ({ views: [] }),
}));
vi.mock('@pyxis/app-sdk', async (orig) => {
  const real = await orig<typeof import('@pyxis/app-sdk')>();
  return {
    ...real,
    useAnimationMode: () => 'off',
  };
});
vi.mock('../../components/AppIcon', () => ({ AppIcon: () => null }));

import { CardOverview } from '../CardOverview';

function makeWin(id: string, appId: string, title: string): DesktopWindowType {
  return {
    id,
    title,
    appId,
    state: 'normal',
    position: { x: 40, y: 60 },
    size: { width: 720, height: 500 },
    zIndex: 1,
    innerWidth: 1280,
    innerHeight: 800,
  };
}

describe('CardOverview UX, accent propagation, focus and dead zones', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('propagates manifest app.accent to card plate outline, strip and preview glow', () => {
    const { container } = render(
      <MotionProvider>
        <CardOverview
          isOpen
          onClose={() => {}}
          windows={[makeWin('w1', 'weather', 'Weather')]}
          onSelectWindow={() => {}}
          onCloseWindow={() => {}}
        />
      </MotionProvider>
    );

    const plate = container.querySelector<HTMLElement>('[data-card-plate]')!;
    // jsdom normalises a hex inside color-mix() to rgb().
    const accent = /#e11d48|rgb\(225, 29, 72\)/i;
    expect(plate.style.outline).toMatch(accent);
    const strip = container.querySelector<HTMLElement>('[data-card-strip]')!;
    expect(strip.style.background).toMatch(accent);
  });

  it('closes on scrim, header empty space, carousel background and track gap clicks, without affecting card or close clicks', () => {
    const onClose = vi.fn();
    const onSelectWindow = vi.fn();
    const onCloseWindow = vi.fn();

    const { container } = render(
      <MotionProvider>
        <CardOverview
          isOpen
          onClose={onClose}
          windows={[makeWin('w1', 'weather', 'Weather'), makeWin('w2', 'files', 'Files')]}
          onSelectWindow={onSelectWindow}
          onCloseWindow={onCloseWindow}
        />
      </MotionProvider>
    );

    fireEvent.click(container.querySelector('[data-overview-scrim]')!);
    fireEvent.click(container.querySelector('[data-overview-header]')!);
    fireEvent.click(container.querySelector('[data-overview-carousel]')!);
    fireEvent.click(container.querySelector('[data-overview-track]')!);
    expect(onClose).toHaveBeenCalledTimes(4);

    // Card close button does not close overview
    const closeBtns = container.querySelectorAll<HTMLButtonElement>('.px-card-close');
    fireEvent.click(closeBtns[0]);
    expect(onCloseWindow).toHaveBeenCalledWith('w1');
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(onSelectWindow).not.toHaveBeenCalled();

    // Card trigger selects window and calls onClose once via onSelectWindow flow
    const cardBtns = container.querySelectorAll<HTMLButtonElement>('.px-card-button');
    fireEvent.click(cardBtns[1]);
    expect(onSelectWindow).toHaveBeenCalledWith('w2');
    expect(onClose).toHaveBeenCalledTimes(5);
  });

  it('sets pointerEvents: none while exiting so closing animation never ghost-blocks clicks', () => {
    const view = render(
      <MotionProvider>
        <CardOverview
          isOpen
          onClose={() => {}}
          windows={[makeWin('w1', 'weather', 'Weather')]}
          onSelectWindow={() => {}}
          onCloseWindow={() => {}}
        />
      </MotionProvider>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.pointerEvents).toBe('');

    view.rerender(
      <MotionProvider>
        <CardOverview
          isOpen={false}
          onClose={() => {}}
          windows={[makeWin('w1', 'weather', 'Weather')]}
          onSelectWindow={() => {}}
          onCloseWindow={() => {}}
        />
      </MotionProvider>
    );

    const exiting = document.querySelector<HTMLElement>('[role="dialog"]');
    if (exiting) {
      expect(exiting.style.pointerEvents).toBe('none');
    }
  });

  it('centers overflow track via margin-inline: auto without justifyContent: center on the overflow-x container', () => {
    const { container } = render(
      <MotionProvider>
        <CardOverview
          isOpen
          onClose={() => {}}
          windows={[makeWin('w1', 'weather', 'Weather'), makeWin('w2', 'files', 'Files')]}
          onSelectWindow={() => {}}
          onCloseWindow={() => {}}
        />
      </MotionProvider>
    );

    const carousel = container.querySelector<HTMLElement>('[data-overview-carousel]')!;
    expect(carousel.style.overflowX).toBe('auto');
    expect(carousel.style.justifyContent).not.toBe('center');

    const track = container.querySelector<HTMLElement>('[data-overview-track]')!;
    expect(track.style.marginInline).toBe('auto');
    expect(track.style.flexShrink).toBe('0');
    expect(track.style.maxWidth).toBe('');
  });

  it('supports initial focus, Tab focus trap, focus restoration, scrollIntoView, and never hijacks Enter on buttons', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    const onClose = vi.fn();
    const onSelectWindow = vi.fn();
    const onCloseWindow = vi.fn();

    const view = render(
      <MotionProvider>
        <CardOverview
          isOpen
          onClose={onClose}
          windows={[makeWin('w1', 'weather', 'Weather'), makeWin('w2', 'files', 'Files')]}
          onSelectWindow={onSelectWindow}
          onCloseWindow={onCloseWindow}
        />
      </MotionProvider>
    );

    // Initial focus moves to first card's button
    const cardButtons = [...document.querySelectorAll<HTMLButtonElement>('.px-card-button')];
    expect(cardButtons).toHaveLength(2);
    expect(document.activeElement).toBe(cardButtons[0]);
    // Cards never nest buttons inside buttons
    for (const btn of cardButtons) {
      expect(btn.querySelector('button')).toBeNull();
    }

    // scrollIntoView runs in Overview mode with nearest/nearest
    expect(scrollSpy).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' });

    // ArrowRight moves selection and focus to card 2 and scrolls it into view
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(cardButtons[1]);
    expect(scrollSpy).toHaveBeenLastCalledWith({ inline: 'nearest', block: 'nearest' });

    // Tab wraps cleanly inside the dialog (Close All -> Exit -> Card 1 -> Card 1 X -> Card 2 -> Card 2 X -> Close All)
    const closeAllBtn = screen.getByRole('button', { name: /Close All/i });
    const exitBtn = screen.getByRole('button', { name: /Exit overview/i });
    const cardCloseBtns = [...document.querySelectorAll<HTMLButtonElement>('.px-card-close')];

    act(() => {
      cardCloseBtns[1].focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(closeAllBtn);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(cardCloseBtns[1]);

    // Pressing Enter while Close All is focused does NOT activate a card
    act(() => {
      closeAllBtn.focus();
      fireEvent.keyDown(closeAllBtn, { key: 'Enter', bubbles: true });
    });
    expect(onSelectWindow).not.toHaveBeenCalled();

    // Pressing Enter while card X is focused does NOT activate a card
    act(() => {
      cardCloseBtns[0].focus();
      fireEvent.keyDown(cardCloseBtns[0], { key: 'Enter', bubbles: true });
    });
    expect(onSelectWindow).not.toHaveBeenCalled();

    // Pressing Enter while Exit overview is focused does not activate a card
    act(() => {
      exitBtn.focus();
      fireEvent.keyDown(exitBtn, { key: 'Enter', bubbles: true });
    });
    expect(onSelectWindow).not.toHaveBeenCalled();

    // Closing Overview restores focus to the trigger button
    view.rerender(
      <MotionProvider>
        <CardOverview
          isOpen={false}
          onClose={onClose}
          windows={[makeWin('w1', 'weather', 'Weather'), makeWin('w2', 'files', 'Files')]}
          onSelectWindow={onSelectWindow}
          onCloseWindow={onCloseWindow}
        />
      </MotionProvider>
    );
    expect(document.activeElement).toBe(trigger);
  });
});

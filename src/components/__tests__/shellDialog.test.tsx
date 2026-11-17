import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ShellDialog, ShellPill } from '../ShellDialog';

/**
 * ShellDialog: remochi's dialog card and caps Buttons inside the shell's own
 * scrim, for the Launch Error and the Restart / Shut Down confirm. What a device suite and the overlay lean on is pinned here: the
 * selectors, the keys, the region marker and the click-outside rule.
 */

afterEach(() => cleanup());

function power(over: Partial<React.ComponentProps<typeof ShellDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ShellDialog
      open
      id="shutdown"
      title="Shut Down Pyxis"
      confirmLabel="Shut Down"
      confirmKind="destructive"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    >
      Are you sure you want to shut down your computer?
    </ShellDialog>
  );
  return { ...view, onConfirm, onCancel };
}

const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;

describe('ShellDialog', () => {
  it('renders the title, body and both actions as a modal', () => {
    power();
    const panel = q('[data-shell-dialog="shutdown"]')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(q('[data-shell-dialog-title]')!.textContent).toBe('Shut Down Pyxis');
    expect(q('[data-shell-dialog-title]')!.className).toContain('mochi-dialog-title');
    expect(q('[data-shell-dialog-body]')!.textContent).toContain('shut down your computer');
    expect(q('[data-dialog-action="cancel"]')!.textContent).toBe('(Cancel)');
    expect(q('[data-dialog-action="confirm"]')!.textContent).toBe('(Shut Down)');
    // The panel is named by its title.
    expect(panel.getAttribute('aria-labelledby')).toBe(q('[data-shell-dialog-title]')!.id);
  });

  it("is remochi's dialog card with remochi Buttons (caps), of the right variant", () => {
    power();
    const panel = q('[data-shell-dialog="shutdown"]')!;
    expect(panel.className).toContain('mochi-dialog');
    expect(panel.querySelector('.mochi-dialog-header')).not.toBeNull();
    expect(panel.querySelector('.mochi-dialog-actions')).not.toBeNull();
    const confirm = q('[data-dialog-action="confirm"]')!;
    const cancel = q('[data-dialog-action="cancel"]')!;
    for (const b of [confirm, cancel]) {
      expect(b.className).toContain('mochi-button--caps');
    }
    expect(confirm.getAttribute('data-kind')).toBe('destructive');
    expect(cancel.getAttribute('data-kind')).toBe('secondary');
    // Named by the word, not by the caps' brackets.
    expect(cancel.getAttribute('aria-label')).toBe('Cancel');
  });

  it('the primary action is the default kind', () => {
    power({ confirmKind: undefined });
    expect(q('[data-dialog-action="confirm"]')!.getAttribute('data-kind')).toBe('primary');
  });

  it('marks its scrim for the overlay region, so a click outside reaches it', () => {
    power();
    const scrim = q('[data-shell-dialog-scrim]')!;
    expect(scrim.hasAttribute('data-shell-region')).toBe(true);
    expect(scrim.style.position).toBe('fixed');
  });

  it('puts focus on the safe button', async () => {
    power();
    await waitFor(() => expect(document.activeElement).toBe(q('[data-dialog-action="cancel"]')));
  });

  it('Escape cancels, Enter on Cancel runs Cancel instead of confirming, and Enter on Confirm confirms', async () => {
    const { onConfirm, onCancel } = power();
    await waitFor(() => expect(document.activeElement).toBe(q('[data-dialog-action="cancel"]')));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    // Enter while Cancel has focus MUST NOT trigger destructive confirm; it runs Cancel.
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(2);

    // Tab to Confirm button, then Enter confirms.
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(q('[data-dialog-action="confirm"]'));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('Tab stays inside the panel', async () => {
    power();
    const cancel = q('[data-dialog-action="cancel"]')!;
    const confirm = q('[data-dialog-action="confirm"]')!;
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('buttons and the scrim answer clicks: outside cancels, inside does not', () => {
    const { onConfirm, onCancel } = power();
    fireEvent.click(q('[data-shell-dialog="shutdown"]')!);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(q('[data-shell-dialog-scrim]')!);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(q('[data-dialog-action="cancel"]')!);
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.click(q('[data-dialog-action="confirm"]')!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('an alert has one button, focused, and every way out confirms', async () => {
    const onConfirm = vi.fn();
    render(
      <ShellDialog open id="launch-error" title="Launch Error" tone="error" confirmLabel="OK" onConfirm={onConfirm}>
        Terminal failed to start
      </ShellDialog>
    );
    expect(q('[data-shell-dialog="launch-error"]')!.getAttribute('role')).toBe('alertdialog');
    expect(q('[data-dialog-action="cancel"]')).toBeNull();
    // An error is remochi's red edge on the card.
    expect(q('[data-shell-dialog="launch-error"]')!.className).toContain('mochi-dialog--error');
    const ok = q('[data-dialog-action="confirm"]')!;
    expect(ok.getAttribute('data-kind')).toBe('primary');
    await waitFor(() => expect(document.activeElement).toBe(ok));
    fireEvent.keyDown(ok, { key: 'Escape' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(q('[data-shell-dialog-scrim]')!);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('takes Escape before anything beneath it hears it', () => {
    const beneath = vi.fn();
    window.addEventListener('keydown', beneath);
    const { onCancel } = power();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    window.removeEventListener('keydown', beneath);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(beneath).not.toHaveBeenCalled();
  });

  it('only the newest of two open dialogs answers the keyboard', () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <ShellDialog open title="A" confirmLabel="OK" onConfirm={a}>
        a
      </ShellDialog>
    );
    render(
      <ShellDialog open title="B" confirmLabel="OK" onConfirm={b}>
        b
      </ShellDialog>
    );
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  it('draws nothing when closed, and leaves the document when it closes', async () => {
    const { rerender } = power({ open: false });
    expect(q('[data-shell-dialog]')).toBeNull();
    expect(q('[data-shell-region]')).toBeNull();
    rerender(
      <ShellDialog open id="shutdown" title="T" confirmLabel="Go" onConfirm={() => {}}>
        body
      </ShellDialog>
    );
    expect(q('[data-shell-dialog]')).not.toBeNull();
    rerender(
      <ShellDialog open={false} id="shutdown" title="T" confirmLabel="Go" onConfirm={() => {}}>
        body
      </ShellDialog>
    );
    await waitFor(() => expect(q('[data-shell-dialog]')).toBeNull());
  });

  it('does not answer keys once closed', async () => {
    const { rerender, onConfirm } = power();
    rerender(
      <ShellDialog open={false} title="T" confirmLabel="Go" onConfirm={onConfirm}>
        body
      </ShellDialog>
    );
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('restores focus to the previously active element when closed', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = power();
    await waitFor(() => expect(document.activeElement).toBe(q('[data-dialog-action="cancel"]')));

    rerender(
      <ShellDialog
        open={false}
        id="shutdown"
        title="Shut Down Pyxis"
        confirmLabel="Shut Down"
        confirmKind="destructive"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        Are you sure you want to shut down your computer?
      </ShellDialog>
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('clears data-shell-region and sets pointerEvents: none immediately while exiting', () => {
    const { rerender } = power();
    const scrim = q('[data-shell-dialog-scrim="shutdown"]')!;
    expect(scrim.hasAttribute('data-shell-region')).toBe(true);
    expect(scrim.style.pointerEvents).toBe('auto');

    rerender(
      <ShellDialog
        open={false}
        id="shutdown"
        title="Shut Down Pyxis"
        confirmLabel="Shut Down"
        confirmKind="destructive"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        Are you sure you want to shut down your computer?
      </ShellDialog>
    );
    const exitingScrim = q('[data-shell-dialog-scrim="shutdown"]');
    if (exitingScrim) {
      expect(exitingScrim.style.pointerEvents).toBe('none');
      expect(exitingScrim.hasAttribute('data-shell-region')).toBe(false);
    }
  });
});

describe('ShellPill', () => {
  it('is a remochi caps Button, normal by default, and never submits a form', () => {
    const { getByRole } = render(<ShellPill>Clear</ShellPill>);
    const pill = getByRole('button', { name: 'Clear' });
    expect(pill.getAttribute('data-kind')).toBe('secondary');
    expect(pill.getAttribute('type')).toBe('button');
    expect(pill.className).toContain('mochi-button--caps');
  });
});

describe('the shell no longer uses remochi dialogs', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8');
  it.each(['components/ShellLayer.tsx', 'components/QuickSettingsMenu.tsx'])('%s', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/\bDialog\b[^S]*from 'remochi'|import \{[^}]*\bDialog\b[^}]*\} from 'remochi'/);
    expect(source).toContain("from './ShellDialog'");
  });
  it('the Launch Error and the power confirm keep their texts and ids', () => {
    const layer = read('components/ShellLayer.tsx');
    expect(layer).toContain('title="Launch Error"');
    expect(layer).toContain('id="launch-error"');
    const qs = read('components/QuickSettingsMenu.tsx');
    expect(qs).toContain("'Shut Down Pyxis'");
    expect(qs).toContain("'Restart Pyxis'");
    expect(qs).toContain('your computer?');
  });
});

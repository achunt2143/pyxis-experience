import React, { useEffect, useId, useImperativeHandle, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Button, Divider } from 'remochi';
import { useMotion } from '../useMotion';
import { PANEL_ENTER, PANEL_REST, SCRIM_IN, SCRIM_OUT, TRANSITION } from '../motion';
import './ShellDialog.css';

export const SHELL_DIALOG_Z_INDEX = 1400;

interface ModalEntry {
  key: symbol;
  zIndex: number;
  order: number;
}

/** Open modals ordered by zIndex then newest last: only the top-most answers keys. */
const modalStack: ModalEntry[] = [];
let modalSeq = 0;

// eslint-disable-next-line react-refresh/only-export-components
export function registerModalLayer(zIndex: number): symbol {
  const key = Symbol('modal');
  modalStack.push({ key, zIndex, order: ++modalSeq });
  return key;
}

// eslint-disable-next-line react-refresh/only-export-components
export function unregisterModalLayer(key: symbol): void {
  const idx = modalStack.findIndex((entry) => entry.key === key);
  if (idx >= 0) modalStack.splice(idx, 1);
}

// eslint-disable-next-line react-refresh/only-export-components
export function isTopModalLayer(key: symbol): boolean {
  if (modalStack.length === 0) return false;
  let top = modalStack[0];
  for (let i = 1; i < modalStack.length; i++) {
    const cur = modalStack[i];
    if (cur.zIndex > top.zIndex || (cur.zIndex === top.zIndex && cur.order > top.order)) {
      top = cur;
    }
  }
  return top.key === key;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'summary, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  return [...container.querySelectorAll<HTMLElement>(selector)].filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    const closedDetails = el.closest('details:not([open])');
    if (closedDetails && el.tagName !== 'SUMMARY') return false;
    return true;
  });
}

/** How a pill reads: the Pyxis accent, the spinner's red, or quiet. */
export type ShellPillKind = 'primary' | 'destructive' | 'secondary';

const PILL_VARIANT: Record<ShellPillKind, 'blue' | 'warning' | 'normal'> = {
  primary: 'blue',
  destructive: 'warning',
  secondary: 'normal',
};

/**
 * A remochi Button (its classic caps): ShellDialog's actions, the privilege
 * prompt's and anything else in the overlay that needs a plain button, so the
 * shell's dialogs use the same control as the apps.
 * `kind` picks remochi's variant (primary = blue, destructive = warning).
 * The ref is the rendered `<button>` (remochi's Button takes no ref itself),
 * which is what the dialogs focus.
 */
export const ShellPill = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
    kind?: ShellPillKind;
    type?: 'button' | 'submit' | 'reset';
  }
>(function ShellPill({ kind = 'secondary', type = 'button', ...rest }, ref) {
  const hostRef = useRef<HTMLSpanElement>(null);
  // Read once mounted, when the button exists.
  useImperativeHandle(ref, () => hostRef.current?.querySelector('button') as HTMLButtonElement, []);
  return (
    <span ref={hostRef} style={{ display: 'contents' }}>
      <Button
        type={PILL_VARIANT[kind]}
        htmlType={type}
        data-kind={kind}
        // The caps' brackets are text, so the button's name would be "(OK)":
        // a plain label reads as the word alone.
        aria-label={typeof rest.children === 'string' ? rest.children : undefined}
        {...rest}
      />
    </span>
  );
});

export interface ShellDialogProps {
  open: boolean;
  /** Set in display type (uppercase, tracked, Mochi Light). */
  title: string;
  children?: React.ReactNode;
  /** The confirming action's label ("OK", "Shut Down"). */
  confirmLabel: string;
  /** `destructive` for an action that loses something (shut down, restart). Default `primary`. */
  confirmKind?: 'primary' | 'destructive';
  /**
   * The safe action's label. Leave it out for an alert, which has one
   * button: then Escape and a click outside confirm, since there is nothing
   * else to do.
   */
  cancelLabel?: string;
  onConfirm: () => void;
  /** Cancel, Escape and a click outside. An alert without it calls `onConfirm`. */
  onCancel?: () => void;
  /** `error` puts a spinner-red drop beside the title. */
  tone?: 'default' | 'error';
  /** The `data-shell-dialog` value, for tests and device suites. */
  id?: string;
}

/**
 * A modal dialog built from remochi's: its dialog card (title, divider,
 * content, action row; an error tone is remochi's red edge) and caps Buttons
 * (the confirming one blue, or warning red when destructive), inside the
 * shell's own scrim.
 *
 * Keyboard: Escape cancels. Enter confirms UNLESS focus is currently on the
 * safe Cancel button (which instead runs Cancel so Enter never accidentally
 * triggers Shut Down / Restart). Focus starts on the safe button, or on the
 * only one, and Tab stays inside. Both keys are taken before anything else
 * hears them, so a quick settings panel beneath doesn't close on the Escape
 * that closes its dialog.
 *
 * In the overlay, the scrim is marked `data-shell-region` while open, so while
 * a dialog is up the shell takes the whole screen's clicks (useShellRegion)
 * and a click outside the panel reaches the scrim, which cancels, as
 * remochi's Dialog did. While exiting (`open === false`), `pointerEvents` is
 * `none` and `data-shell-region` is cleared so a fading scrim never captures
 * clicks.
 *
 * Self-contained, portalled to `document.body`, so the Duyo port can wrap
 * it as it is.
 */
interface ShellDialogScrimProps {
  id?: string;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  confirmKind: 'primary' | 'destructive';
  cancelLabel?: string;
  onConfirm: () => void;
  cancel: () => void;
  tone: 'default' | 'error';
  panelRef: React.RefObject<HTMLDivElement | null>;
  safeRef: React.RefObject<HTMLButtonElement | null>;
  titleId: string;
  bodyId: string;
}

function ShellDialogScrim({
  id,
  title,
  children,
  confirmLabel,
  confirmKind,
  cancelLabel,
  onConfirm,
  cancel,
  tone,
  panelRef,
  safeRef,
  titleId,
  bodyId,
}: ShellDialogScrimProps) {
  const { tr, to } = useMotion();
  const isPresent = useIsPresent();

  return (
    <motion.div
      key="scrim"
      data-shell-region={isPresent ? '' : undefined}
      data-shell-dialog-scrim={id ?? ''}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: tr(SCRIM_IN) }}
      exit={{ opacity: 0, transition: tr(SCRIM_OUT) }}
      onClick={(e) => {
        if (isPresent && e.target === e.currentTarget) cancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: SHELL_DIALOG_Z_INDEX,
        background: 'rgba(8, 10, 24, 0.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        pointerEvents: isPresent ? 'auto' : 'none',
      }}
    >
      {/* remochi's dialog card (header, divider, content, actions), inside
          the shell's own scrim: the scrim is what takes the overlay's clicks
          and keyboard, which remochi's own Dialog overlay can't. The card is
          shown by remochi only inside its open overlay (opacity 0
          otherwise), so the resting pose is set here. */}
      <motion.div
        ref={panelRef}
        role={cancelLabel ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        data-shell-dialog={id ?? ''}
        className={`mochi-dialog mochi-dialog-small${tone === 'error' ? ' mochi-dialog--error' : ''}`}
        initial={to(PANEL_ENTER)}
        animate={{ ...to(PANEL_REST), transition: tr(TRANSITION.open) }}
        exit={{ ...to(PANEL_ENTER), transition: tr(TRANSITION.close) }}
        style={{ opacity: 1, y: 0, scale: 1, width: 400 }}
      >
        <div className="mochi-dialog-header">
          <h2 id={titleId} data-shell-dialog-title className="mochi-dialog-title">
            {title}
          </h2>
        </div>
        <Divider />
        {children && (
          <div
            id={bodyId}
            data-shell-dialog-body
            className="mochi-dialog-content"
            style={{ overflowWrap: 'anywhere' }}
          >
            {children}
          </div>
        )}
        <div className="mochi-dialog-actions">
          {cancelLabel && (
            <ShellPill ref={safeRef} kind="secondary" data-dialog-action="cancel" onClick={cancel}>
              {cancelLabel}
            </ShellPill>
          )}
          <ShellPill
            ref={cancelLabel ? undefined : safeRef}
            kind={confirmKind}
            data-dialog-action="confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </ShellPill>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ShellDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmKind = 'primary',
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'default',
  id,
}: ShellDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const cancel = onCancel ?? onConfirm;

  // The latest handlers, for the key listener (which lives as long as the
  // dialog is open, not as long as one render).
  const handlers = useRef({ confirm: onConfirm, cancel, hasCancel: Boolean(cancelLabel) });
  useEffect(() => {
    handlers.current = { confirm: onConfirm, cancel, hasCancel: Boolean(cancelLabel) };
  });

  useEffect(() => {
    if (!open) return;
    const modalKey = registerModalLayer(SHELL_DIALOG_Z_INDEX);
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus the safe button once the panel is in the document.
    const focusTimer = window.setTimeout(() => safeRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopModalLayer(modalKey)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handlers.current.cancel();
      } else if (e.key === 'Enter' && !e.isComposing && !e.altKey && !e.ctrlKey && !e.metaKey) {
        // preventDefault stops a focused button from also triggering a duplicate native click.
        e.preventDefault();
        e.stopPropagation();
        if (handlers.current.hasCancel && document.activeElement === safeRef.current) {
          handlers.current.cancel();
        } else {
          handlers.current.confirm();
        }
      } else if (e.key === 'Tab') {
        const currentPanel = panelRef.current;
        if (!currentPanel) return;
        const focusables = getFocusableElements(currentPanel);
        if (focusables.length === 0) return;
        const at = focusables.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey
          ? at <= 0
            ? focusables.length - 1
            : at - 1
          : at < 0 || at === focusables.length - 1
            ? 0
            : at + 1;
        e.preventDefault();
        e.stopPropagation();
        focusables[next].focus();
      }
    };
    // Capture on window: the first listener there is, so the keys are ours.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown, true);
      unregisterModalLayer(modalKey);
      if (previous && previous.isConnected && !panel?.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <ShellDialogScrim
          id={id}
          title={title}
          confirmLabel={confirmLabel}
          confirmKind={confirmKind}
          cancelLabel={cancelLabel}
          onConfirm={onConfirm}
          cancel={cancel}
          tone={tone}
          panelRef={panelRef}
          safeRef={safeRef}
          titleId={titleId}
          bodyId={bodyId}
        >
          {children}
        </ShellDialogScrim>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default ShellDialog;

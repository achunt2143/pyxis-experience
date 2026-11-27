import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  useEcho,
  TERMINAL_IFACE,
  TERMINAL_SIGNALS,
  type TerminalClosedPayload,
  type TerminalStatusPayload,
} from '@pyxis/app-sdk';
import { startMockShell } from './mockShell';
import type { TerminalHub } from './terminalHub';
import { matchTerminalShortcut, type CursorShape, type TabInfo, type TerminalMode } from './model';
import { readTerminalFont, readTerminalTheme, watchTheme } from './terminalTheme';

/** What a session's shell reports: its folder, and its foreground job (null: the shell itself). */
export type ScreenStatus = Omit<TerminalStatusPayload, 'terminalId'>;

interface SingleTerminalProps {
  tabId: string;
  /** Where the session's first shell starts (and where Enter restarts an ended one). */
  cwd?: string;
  isActive: boolean;
  fontSize: number;
  cursor: CursorShape;
  hub: TerminalHub | null;
  /** The shell ended; `exitCode` null when Echo didn't say. The chrome decides whether the session stays. */
  onCloseTab: (id: string, exitCode: number | null) => void;
  onSetTitle: (id: string, title: string) => void;
  onSetMode: (id: string, mode: TerminalMode) => void;
  onStatus: (id: string, status: ScreenStatus) => void;
  onBell: (id: string) => void;
  /** Right-click (or a long press) on a selection: where to point the selection menu. */
  onSelectionMenu: (id: string, rect: { left: number; top: number; width: number; height: number }) => void;
}

/**
 * SingleTerminal — manages one xterm.js instance and its PTY session (or dev mock shell).
 *
 * This is the old React component nearly as it was: the imperative widget, its I/O wiring
 * (Echo's `TerminalOutput`/`TerminalClosed` signals written straight into `term.write`,
 * `term.onData` into `Write`) and its focus handling. What changed is only where its
 * callbacks go: the registration of the live terminal now goes to the hub, and the two
 * events reach the Duyo chrome through the island's events.
 */
const SingleTerminal: React.FC<SingleTerminalProps> = ({
  tabId,
  cwd,
  isActive,
  fontSize,
  cursor,
  hub,
  onCloseTab,
  onSetTitle,
  onSetMode,
  onStatus,
  onBell,
  onSelectionMenu,
}) => {
  const echo = useEcho();
  const startCwdRef = useRef(cwd);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const mockInputRef = useRef<((data: string) => void) | null>(null);
  const [mode, setMode] = useState<TerminalMode>('connecting');
  const [bellActive, setBellActive] = useState(false);

  const syncPtySize = useCallback(
    (force = false) => {
      const tid = terminalIdRef.current;
      const term = termRef.current;
      if (term) hub?.reportSize(tabId, term.cols, term.rows);
      if (!tid || !term) return;
      const prev = lastSizeRef.current;
      if (force || !prev || prev.cols !== term.cols || prev.rows !== term.rows) {
        lastSizeRef.current = { cols: term.cols, rows: term.rows };
        void echo.resizeTerminal(tid, term.cols, term.rows);
      }
    },
    [echo, hub, tabId]
  );

  useEffect(() => {
    if (termRef.current) termRef.current.options.cursorStyle = cursor;
  }, [cursor]);

  // Update font size when changed from toolbar
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      try {
        fitRef.current?.fit();
        syncPtySize(false);
      } catch {
        /* ignore */
      }
    }
  }, [fontSize, syncPtySize]);

  // When tab becomes active, fit, sync PTY dimensions if changed, and focus
  useEffect(() => {
    if (!isActive || !termRef.current) return;
    const timer = setTimeout(() => {
      try {
        fitRef.current?.fit();
        syncPtySize(false);
        termRef.current?.focus();
      } catch {
        /* ignore */
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive, syncPtySize]);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const term = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      fontFamily: readTerminalFont(containerEl),
      fontSize,
      cursorStyle: cursor,
      // Filled while the window has focus, an outline when it doesn't, like the window controls.
      cursorInactiveStyle: 'outline',
      theme: readTerminalTheme(containerEl),
      convertEol: true,
    });
    const stopWatchingTheme = watchTheme(containerEl, () => {
      term.options.theme = readTerminalTheme(containerEl);
    });

    // Defer app-level shortcuts to TerminalApp's keydown listener instead of letting xterm emit control chars.
    term.attachCustomKeyEventHandler?.((ev) => !matchTerminalShortcut(ev));

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerEl);
    try {
      fit.fit();
    } catch {
      /* ignore */
    }
    term.focus();
    termRef.current = term;
    fitRef.current = fit;
    hub?.registerTerm(tabId, term);
    hub?.reportSize(tabId, term.cols, term.rows);

    // A selection's own menu, pointed at where the pointer is.
    const onContextMenu = (e: MouseEvent) => {
      if (!term.hasSelection?.()) return;
      e.preventDefault();
      onSelectionMenu(tabId, { left: e.clientX, top: e.clientY, width: 1, height: 1 });
    };
    containerEl.addEventListener('contextmenu', onContextMenu);

    let disposed = false;
    let bellTimer: ReturnType<typeof setTimeout> | undefined;
    const bellDisposable = term.onBell?.(() => {
      if (disposed) return;
      onBell(tabId);
      setBellActive(true);
      if (bellTimer) clearTimeout(bellTimer);
      bellTimer = setTimeout(() => {
        if (!disposed) setBellActive(false);
      }, 220);
    });

    /** The shell ended with a code the chrome kept the session for: Enter starts it again. */
    let ended = false;

    // Subscribe before opening a shell, so nothing it says first is missed. A session may
    // open several shells over its life (Enter after one ends), all into this one view.
    const unsubOutput = echo.onSignal(TERMINAL_IFACE, TERMINAL_SIGNALS.output, (raw) => {
      const data = raw as { terminalId?: string; data?: string };
      if (data.terminalId === terminalIdRef.current && typeof data.data === 'string') {
        term.write(data.data);
      }
    });
    const unsubStatus = echo.onSignal(TERMINAL_IFACE, TERMINAL_SIGNALS.status, (raw) => {
      const data = raw as TerminalStatusPayload;
      if (data.terminalId === terminalIdRef.current) onStatus(tabId, { cwd: data.cwd, job: data.job ?? null });
    });
    const unsubClosed = echo.onSignal(TERMINAL_IFACE, TERMINAL_SIGNALS.closed, (raw) => {
      const data = raw as TerminalClosedPayload;
      if (data.terminalId !== terminalIdRef.current) return;
      terminalIdRef.current = null;
      const code = typeof data.exitCode === 'number' ? data.exitCode : null;
      if (code !== null && code !== 0) {
        ended = true;
        term.writeln(`\r\n\x1b[2mThe shell ended with code ${code}. Press Enter to start it again.\x1b[0m`);
      } else {
        term.writeln('\r\n\x1b[2mThe shell ended.\x1b[0m');
      }
      onCloseTab(tabId, code);
    });

    const openShell = async (cwd?: string) => {
      let opened: { terminalId: string } | null = null;
      try {
        opened = await echo.openTerminal(term.cols, term.rows, cwd ? { cwd } : {});
      } catch {
        opened = null;
      }
      if (disposed) {
        if (opened?.terminalId) void echo.closeTerminal(opened.terminalId);
        return;
      }
      if (opened && opened.terminalId) {
        terminalIdRef.current = opened.terminalId;
        lastSizeRef.current = { cols: term.cols, rows: term.rows };
        setMode('pty');
        onSetMode(tabId, 'pty');
      } else {
        // Dev / browser: no Echo shell, so the mock one.
        setMode('mock');
        onSetMode(tabId, 'mock');
        mockInputRef.current = startMockShell(
          term,
          tabId,
          onSetTitle,
          (code) => {
            // As a PTY's TerminalClosed: a nonzero code keeps the session for Enter to restart.
            mockInputRef.current = null;
            if (code !== 0) {
              ended = true;
              term.writeln(`\x1b[2mThe shell ended with code ${code}. Press Enter to start it again.\x1b[0m`);
            }
            onCloseTab(tabId, code);
          },
          (dir, job) => onStatus(tabId, { cwd: dir, job })
        );
      }
    };

    // What is typed goes to the PTY, or restarts an ended shell; the mock shell reads the
    // view's keystrokes itself. The keys row (`sendInput`) reaches all three.
    const typed = (data: string) => {
      if (terminalIdRef.current) {
        void echo.writeTerminal(terminalIdRef.current, data);
        return true;
      }
      if (ended) {
        if (data.includes('\r')) {
          ended = false;
          term.writeln('');
          void openShell(startCwdRef.current);
        }
        return true;
      }
      return false;
    };
    const sendInput = (data: string) => {
      if (!typed(data)) mockInputRef.current?.(data);
    };
    const dataDisposable = term.onData(typed) as unknown as { dispose?: () => void };
    hub?.registerSendInput(tabId, sendInput);

    void openShell(startCwdRef.current);

    const onResize = () => {
      if (!isActiveRef.current) return;
      try {
        fit.fit();
        syncPtySize(true);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onResize);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (!isActiveRef.current) return;
            try {
              fit.fit();
              syncPtySize(true);
            } catch {
              /* ignore */
            }
          })
        : null;
    resizeObserver?.observe(containerEl);

    return () => {
      disposed = true;
      stopWatchingTheme();
      containerEl.removeEventListener('contextmenu', onContextMenu);
      if (bellTimer) clearTimeout(bellTimer);
      bellDisposable?.dispose?.();
      dataDisposable?.dispose?.();
      unsubStatus();
      hub?.registerTerm(tabId, null);
      hub?.registerSendInput(tabId, null);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      unsubOutput();
      unsubClosed();
      if (terminalIdRef.current) {
        void echo.closeTerminal(terminalIdRef.current);
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={bellActive ? 'term-screen term-bell-active' : 'term-screen'}
      data-terminal-mode={mode}
      data-bell={bellActive ? 'active' : 'idle'}
      style={{
        display: isActive ? 'block' : 'none',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        aria-label={`terminal-tab-${tabId}`}
      />
    </div>
  );
};

export interface TerminalScreensProps {
  tabs: readonly TabInfo[];
  activeId: string;
  fontSize: number;
  cursor: CursorShape;
  hub: TerminalHub | null;
  onCloseTab: (id: string, exitCode: number | null) => void;
  onSetTitle: (id: string, title: string) => void;
  onSetMode: (id: string, mode: TerminalMode) => void;
  onStatus: (id: string, status: ScreenStatus) => void;
  onBell: (id: string) => void;
  onSelectionMenu: (id: string, rect: { left: number; top: number; width: number; height: number }) => void;
}

/**
 * Every tab's terminal view, the active one shown. A tab's view mounts once, when the tab
 * appears, and lives until the tab goes (an xterm instance can't be rebuilt without losing
 * its scrollback and its shell), so the chrome only changes `activeId`.
 *
 * The island is re-rendered by every change anywhere in the Duyo tree, with fresh callbacks
 * each time, and a view's effect reads its callbacks once, at mount. They are therefore
 * stable functions that read the latest props through a ref (the old app captured the
 * first render's, which left the wrong tab active when a shell exited).
 */
export const TerminalScreens: React.FC<TerminalScreensProps> = ({
  tabs,
  activeId,
  fontSize,
  cursor,
  hub,
  onCloseTab,
  onSetTitle,
  onSetMode,
  onStatus,
  onBell,
  onSelectionMenu,
}) => {
  const latest = useRef({ onCloseTab, onSetTitle, onSetMode, onStatus, onBell, onSelectionMenu });
  useEffect(() => {
    latest.current = { onCloseTab, onSetTitle, onSetMode, onStatus, onBell, onSelectionMenu };
  });
  const selectionMenu = useCallback(
    (id: string, rect: { left: number; top: number; width: number; height: number }) => latest.current.onSelectionMenu(id, rect),
    []
  );
  const closeTab = useCallback((id: string, code: number | null) => latest.current.onCloseTab(id, code), []);
  const setStatus = useCallback((id: string, status: ScreenStatus) => latest.current.onStatus(id, status), []);
  const bell = useCallback((id: string) => latest.current.onBell(id), []);
  const setTitle = useCallback((id: string, title: string) => latest.current.onSetTitle(id, title), []);
  const setMode = useCallback((id: string, mode: TerminalMode) => latest.current.onSetMode(id, mode), []);

  return (
    <>
      {tabs.map((tab) => (
        <SingleTerminal
          key={tab.id}
          tabId={tab.id}
          cwd={tab.cwd}
          isActive={tab.id === activeId}
          fontSize={fontSize}
          cursor={cursor}
          hub={hub}
          onCloseTab={closeTab}
          onSetTitle={setTitle}
          onSetMode={setMode}
          onStatus={setStatus}
          onBell={bell}
          onSelectionMenu={selectionMenu}
        />
      ))}
    </>
  );
};

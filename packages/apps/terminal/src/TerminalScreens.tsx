import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useEcho, TERMINAL_IFACE, TERMINAL_SIGNALS } from '@pyxis/app-sdk';
import { startMockShell } from './mockShell';
import type { TerminalHub } from './terminalHub';
import { matchTerminalShortcut, type TabInfo, type TerminalMode } from './model';

interface SingleTerminalProps {
  tabId: string;
  isActive: boolean;
  fontSize: number;
  hub: TerminalHub | null;
  onCloseTab: (id: string) => void;
  onSetTitle: (id: string, title: string) => void;
  onSetMode: (id: string, mode: TerminalMode) => void;
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
  isActive,
  fontSize,
  hub,
  onCloseTab,
  onSetTitle,
  onSetMode,
}) => {
  const echo = useEcho();
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
      if (!tid || !term) return;
      const prev = lastSizeRef.current;
      if (force || !prev || prev.cols !== term.cols || prev.rows !== term.rows) {
        lastSizeRef.current = { cols: term.cols, rows: term.rows };
        void echo.resizeTerminal(tid, term.cols, term.rows);
      }
    },
    [echo]
  );

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
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize,
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      convertEol: true,
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

    let disposed = false;
    let bellTimer: ReturnType<typeof setTimeout> | undefined;
    const bellDisposable = term.onBell?.(() => {
      if (disposed) return;
      setBellActive(true);
      if (bellTimer) clearTimeout(bellTimer);
      bellTimer = setTimeout(() => {
        if (!disposed) setBellActive(false);
      }, 220);
    });

    let unsubOutput: (() => void) | undefined;
    let unsubClosed: (() => void) | undefined;
    let dataDisposable: { dispose?: () => void } | undefined;

    const start = async () => {
      // 1. Subscribe to signals before opening terminal to avoid race conditions
      unsubOutput = echo.onSignal(TERMINAL_IFACE, TERMINAL_SIGNALS.output, (raw) => {
        const data = raw as { terminalId?: string; data?: string };
        if (data.terminalId === terminalIdRef.current && typeof data.data === 'string') {
          term.write(data.data);
        }
      });

      unsubClosed = echo.onSignal(TERMINAL_IFACE, TERMINAL_SIGNALS.closed, (raw) => {
        const data = raw as { terminalId?: string };
        if (data.terminalId === terminalIdRef.current) {
          term.writeln('\r\n\x1b[1;33m[process exited]\x1b[0m');
          onCloseTab(tabId);
        }
      });

      let opened: { terminalId: string } | null = null;
      try {
        opened = await echo.openTerminal(term.cols, term.rows);
      } catch {
        opened = null;
      }

      if (disposed) {
        if (opened?.terminalId) {
          void echo.closeTerminal(opened.terminalId);
        }
        return;
      }

      if (opened && opened.terminalId) {
        // Native PTY mode
        const terminalId = opened.terminalId;
        terminalIdRef.current = terminalId;
        lastSizeRef.current = { cols: term.cols, rows: term.rows };
        setMode('pty');
        onSetMode(tabId, 'pty');

        dataDisposable = term.onData((data) => {
          void echo.writeTerminal(terminalId, data);
        }) as unknown as { dispose?: () => void };
      } else {
        // Dev / Browser Mock Shell mode (or fallback if openTerminal failed)
        setMode('mock');
        onSetMode(tabId, 'mock');
        mockInputRef.current = startMockShell(term, tabId, onSetTitle, () => onCloseTab(tabId));
      }

      hub?.registerSendInput(tabId, (data: string) => {
        if (terminalIdRef.current) {
          void echo.writeTerminal(terminalIdRef.current, data);
        } else if (mockInputRef.current) {
          mockInputRef.current(data);
        }
      });
    };

    void start();

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
      if (bellTimer) clearTimeout(bellTimer);
      bellDisposable?.dispose?.();
      dataDisposable?.dispose?.();
      hub?.registerTerm(tabId, null);
      hub?.registerSendInput(tabId, null);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      unsubOutput?.();
      unsubClosed?.();
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
  hub: TerminalHub | null;
  onCloseTab: (id: string) => void;
  onSetTitle: (id: string, title: string) => void;
  onSetMode: (id: string, mode: TerminalMode) => void;
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
  hub,
  onCloseTab,
  onSetTitle,
  onSetMode,
}) => {
  const latest = useRef({ onCloseTab, onSetTitle, onSetMode });
  useEffect(() => {
    latest.current = { onCloseTab, onSetTitle, onSetMode };
  });
  const closeTab = useCallback((id: string) => latest.current.onCloseTab(id), []);
  const setTitle = useCallback((id: string, title: string) => latest.current.onSetTitle(id, title), []);
  const setMode = useCallback((id: string, mode: TerminalMode) => latest.current.onSetMode(id, mode), []);

  return (
    <>
      {tabs.map((tab) => (
        <SingleTerminal
          key={tab.id}
          tabId={tab.id}
          isActive={tab.id === activeId}
          fontSize={fontSize}
          hub={hub}
          onCloseTab={closeTab}
          onSetTitle={setTitle}
          onSetMode={setMode}
        />
      ))}
    </>
  );
};

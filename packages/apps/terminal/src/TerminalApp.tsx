import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useEcho, TERMINAL_IFACE, TERMINAL_SIGNALS } from '@pyxis/app-sdk';

export interface TerminalAppProps {
  windowId: string;
  onClose?: () => void;
}

/**
 * TerminalApp
 * ------------
 * Real PTY-backed shell: opens an actual `/bin/bash` process on the host via
 * `org.geckoOS.terminal` (echo/src/services/terminal.rs — genuine
 * `openpty`/`fork`/`exec`, not a simulated command switch). xterm.js here
 * just renders whatever bytes the real shell writes and forwards keystrokes
 * back verbatim, exactly like a normal terminal emulator talking to a real
 * pty — job control, `$PATH` resolution, tab completion, and command output
 * are the shell's own doing now, not hand-maintained fake logic in this
 * component.
 *
 * Falls back to a clear "unavailable" message (not a fake shell) when
 * running outside the native bridge (e.g. plain browser dev mode), since
 * there is no real process to back a PTY there — see @pyxis/app-sdk's
 * EchoClient.ts, whose mock path returns no `terminalId` for
 * `terminal/Open` on purpose.
 */
export const TerminalApp: React.FC<TerminalAppProps> = ({ windowId, onClose }) => {
  const echo = useEcho();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
      },
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    term.focus();
    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;
    let unsubOutput: (() => void) | undefined;
    let unsubClosed: (() => void) | undefined;

    const start = async () => {
      // Subscribe BEFORE calling openTerminal, not after (real race found
      // via a real report, 2026-07-07): the real shell writes its startup
      // banner/prompt synchronously as part of Echo's Terminal.Open
      // handler — before that method call even returns. Subscribing only
      // after `openTerminal()` resolved meant that first burst of output
      // was reliably emitted (and broadcast — see
      // IPCBus::broadcast_to_all_connections) before this component's
      // subscription had registered, so it was silently dropped
      // (PyxisBridgeParent's gSubscriptions was still empty at that
      // point). JSWindowActor sendAsyncMessage calls from the same actor
      // preserve order, so sending the "Subscribe" message first
      // guarantees the parent processes it before it processes the
      // "CallService" message that actually triggers Open.
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
          // Matches ordinary terminal-emulator behavior: the window closes
          // when the real shell process it hosts exits (e.g. the user ran
          // `exit` or hit Ctrl-D), same as a real terminal app would.
          onClose?.();
        }
      });

      const opened = await echo.openTerminal(term.cols, term.rows);
      if (disposed) return;
      if (!opened) {
        term.writeln(
          '\x1b[1;31mTerminal unavailable\x1b[0m — no native Echo bridge in this context.'
        );
        return;
      }
      const terminalId = opened.terminalId;
      terminalIdRef.current = terminalId;

      // Raw passthrough — the real shell (readline, job control, ANSI
      // rendering) handles everything from here, not this component.
      term.onData((data) => {
        void echo.writeTerminal(terminalId, data);
      });
    };
    void start();

    const onResize = () => {
      try {
        fit.fit();
        if (terminalIdRef.current) {
          void echo.resizeTerminal(terminalIdRef.current, term.cols, term.rows);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
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
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1b26',
        overflow: 'hidden',
        padding: 8,
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        aria-label="terminal"
      />
    </div>
  );
};

export default TerminalApp;

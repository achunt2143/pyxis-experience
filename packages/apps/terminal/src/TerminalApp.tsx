import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Button, ViewSelectButton } from 'remochi';
import { Plus, X, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEcho, TERMINAL_IFACE, TERMINAL_SIGNALS } from '@pyxis/app-sdk';

export interface TerminalAppProps {
  windowId: string;
  onClose?: () => void;
}

interface TabInfo {
  id: string;
  title: string;
}

interface SingleTerminalProps {
  tabId: string;
  isActive: boolean;
  fontSize: number;
  onCloseTab: (id: string) => void;
  onSetTitle: (id: string, title: string) => void;
  onRegisterTerm: (id: string, term: Terminal | null) => void;
}

/**
 * SingleTerminal — manages one xterm.js instance and its PTY session (or dev mock shell).
 */
const SingleTerminal: React.FC<SingleTerminalProps> = ({
  tabId,
  isActive,
  fontSize,
  onCloseTab,
  onSetTitle,
  onRegisterTerm,
}) => {
  const echo = useEcho();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);

  // Update font size when changed from toolbar
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
    }
  }, [fontSize]);

  // When tab becomes active, fit and focus
  useEffect(() => {
    if (isActive && termRef.current) {
      setTimeout(() => {
        try {
          fitRef.current?.fit();
          termRef.current?.focus();
        } catch {
          /* ignore */
        }
      }, 50);
    }
  }, [isActive]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
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

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      /* ignore */
    }
    term.focus();
    termRef.current = term;
    fitRef.current = fit;
    onRegisterTerm(tabId, term);

    let disposed = false;
    let unsubOutput: (() => void) | undefined;
    let unsubClosed: (() => void) | undefined;

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

      const opened = await echo.openTerminal(term.cols, term.rows);
      if (disposed) return;

      if (opened && opened.terminalId) {
        // Native PTY mode
        const terminalId = opened.terminalId;
        terminalIdRef.current = terminalId;

        term.onData((data) => {
          void echo.writeTerminal(terminalId, data);
        });
      } else {
        // Dev / Browser Mock Shell mode
        startMockShell(term, tabId, onSetTitle, () => onCloseTab(tabId));
      }
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
      onRegisterTerm(tabId, null);
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

/**
 * Interactive Mock Unix Shell for Dev / Browser Mode
 */
function startMockShell(
  term: Terminal,
  tabId: string,
  onSetTitle: (id: string, title: string) => void,
  onExit: () => void
) {
  const prompt = '\r\n\x1b[1;32mgeckouser@pyxis\x1b[0m:\x1b[1;34m~\x1b[0m$ ';
  let line = '';
  const history: string[] = [];
  let historyIdx = 0;

  term.writeln('\x1b[1;36mPyxis Terminal\x1b[0m (interactive dev mock shell)');
  term.writeln('Type \x1b[1mhelp\x1b[0m for available commands.\r\n');
  term.write(prompt.trimStart());

  const execute = (cmd: string) => {
    const trimmed = cmd.trim();
    if (trimmed) {
      history.push(trimmed);
      historyIdx = history.length;
    }
    const [command, ...args] = trimmed.split(/\s+/);
    if (command) {
      onSetTitle(tabId, command);
    }

    switch (command) {
      case '':
        break;
      case 'help':
        term.writeln('\r\n\x1b[1;34mAvailable commands:\x1b[0m');
        term.writeln('  help       - Show this help summary');
        term.writeln('  uname -a   - Print system information');
        term.writeln('  whoami     - Print current logged-in user');
        term.writeln('  pwd        - Print current working directory');
        term.writeln('  date       - Display current system date & time');
        term.writeln('  ls         - List files in current directory');
        term.writeln('  cat <file> - Display file content');
        term.writeln('  echo <txt> - Print arguments to terminal');
        term.writeln('  ps         - List active system processes');
        term.writeln('  neofetch   - Display Pyxis OS summary & ASCII logo');
        term.writeln('  clear      - Clear terminal screen');
        term.writeln('  exit       - Close this terminal tab');
        break;
      case 'uname':
        term.writeln('\r\nLinux pyxis 6.6.0-gecko #1 SMP PREEMPT x86_64 GNU/Linux');
        break;
      case 'whoami':
        term.writeln('\r\ngeckouser');
        break;
      case 'pwd':
        term.writeln('\r\n/home/geckouser');
        break;
      case 'date':
        term.writeln(`\r\n${new Date().toUTCString()}`);
        break;
      case 'ls':
        term.writeln('\r\n\x1b[1;34mDesktop  Documents  Downloads  Music  Pictures  Videos  pim\x1b[0m  README.txt');
        break;
      case 'cat':
        if (args[0] === 'README.txt') {
          term.writeln('\r\nWelcome to Pyxis — a Linux distribution inspired by webOS & FirefoxOS.');
          term.writeln('Desktop Shell: Bloom | Compositor: Evo | IPC: Echo | UI: Remochi');
        } else if (args[0]) {
          term.writeln(`\r\ncat: ${args[0]}: No such file or directory`);
        } else {
          term.writeln('\r\nUsage: cat <filename>');
        }
        break;
      case 'echo':
        term.writeln(`\r\n${args.join(' ')}`);
        break;
      case 'ps':
        term.writeln('\r\n  PID TTY          TIME CMD');
        term.writeln('    1 ?        00:00:01 init');
        term.writeln('  102 ?        00:00:02 echo-daemon');
        term.writeln('  105 ?        00:00:03 evo');
        term.writeln('  112 ?        00:00:05 bloom');
        term.writeln('  120 ?        00:00:02 vela');
        term.writeln('  134 pts/0    00:00:00 bash');
        break;
      case 'neofetch':
        term.writeln('\r\n  \x1b[1;36m/\\_____/\\\x1b[0m     \x1b[1;32mgeckouser\x1b[0m@\x1b[1;32mpyxis\x1b[0m');
        term.writeln(' \x1b[1;36m/  o   o  \\\x1b[0m    --------------');
        term.writeln('\x1b[1;36m( ==  ^  == )\x1b[0m   \x1b[1mOS\x1b[0m: Pyxis Linux 0.1.0 x86_64');
        term.writeln(' \x1b[1;36m)         (\x1b[0m    \x1b[1mKernel\x1b[0m: 6.6.0-gecko');
        term.writeln('\x1b[1;36m(           )\x1b[0m   \x1b[1mShell\x1b[0m: bash 5.2.21');
        term.writeln(' \x1b[1;36m( (  m  ) )\x1b[0m    \x1b[1mWM\x1b[0m: Evo (Wayland)');
        term.writeln('  \x1b[1;36m\\_____/\x1b[0m       \x1b[1mDE\x1b[0m: Bloom (Remochi v0.3.0)');
        break;
      case 'clear':
        term.clear();
        term.write(prompt);
        return;
      case 'exit':
        term.writeln('\r\nexit');
        onExit();
        return;
      default:
        term.writeln(`\r\nbash: ${command}: command not found`);
        break;
    }
    term.write(prompt);
  };

  term.onData((e) => {
    switch (e) {
      case '\r': // Enter
        execute(line);
        line = '';
        break;
      case '\u007F': // Backspace
        if (line.length > 0) {
          line = line.slice(0, -1);
          term.write('\b \b');
        }
        break;
      case '\u0003': // Ctrl+C
        term.writeln('^C');
        line = '';
        term.write(prompt);
        break;
      case '\u001b[A': // Up arrow
        if (history.length > 0 && historyIdx > 0) {
          historyIdx--;
          // clear current line
          while (line.length > 0) {
            term.write('\b \b');
            line = line.slice(0, -1);
          }
          line = history[historyIdx];
          term.write(line);
        }
        break;
      case '\u001b[B': // Down arrow
        if (historyIdx < history.length - 1) {
          historyIdx++;
          while (line.length > 0) {
            term.write('\b \b');
            line = line.slice(0, -1);
          }
          line = history[historyIdx];
          term.write(line);
        } else if (historyIdx === history.length - 1) {
          historyIdx = history.length;
          while (line.length > 0) {
            term.write('\b \b');
            line = line.slice(0, -1);
          }
        }
        break;
      default:
        if (e >= ' ' && e <= '~') {
          line += e;
          term.write(e);
        }
        break;
    }
  });
}

/**
 * TerminalApp
 * ------------
 * Enhanced Multi-Tab Terminal Emulator for Pyxis OS with Remochi Tab Bar,
 * font scaling, clear controls, and native/mock shell support.
 */
export const TerminalApp: React.FC<TerminalAppProps> = ({ windowId, onClose }) => {
  const [tabs, setTabs] = useState<TabInfo[]>([
    { id: 'tab-1', title: 'bash 1' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [fontSize, setFontSize] = useState<number>(13);
  const nextTabNum = useRef<number>(2);
  const termsMap = useRef<Record<string, Terminal>>({});

  const handleRegisterTerm = useCallback((id: string, term: Terminal | null) => {
    if (term) {
      termsMap.current[id] = term;
    } else {
      delete termsMap.current[id];
    }
  }, []);

  const handleClearActive = () => {
    termsMap.current[activeTabId]?.clear();
  };

  const handleNewTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    const title = `bash ${nextTabNum.current++}`;
    setTabs((prev) => [...prev, { id, title }]);
    setActiveTabId(id);
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          onClose?.();
          return prev;
        }
        if (activeTabId === id) {
          setActiveTabId(remaining[remaining.length - 1].id);
        }
        return remaining;
      });
    },
    [activeTabId, onClose]
  );

  const handleSetTitle = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  }, []);

  const zoomIn = () => {
    setFontSize((prev) => Math.min(22, prev + 1));
  };

  const zoomOut = () => {
    setFontSize((prev) => Math.max(10, prev - 1));
  };

  return (
    <div
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1b26',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Remochi Mochi-styled Tab & Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-surface, #24283b)',
          borderBottom: '1px solid var(--color-border, #1f2335)',
          paddingLeft: '6px',
          paddingRight: '6px',
          height: '36px',
          userSelect: 'none',
        }}
      >
        {/* Tab Strip via Remochi ViewSelectButton */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            flex: 1,
          }}
        >
          <ViewSelectButton
            items={tabs.map((tab) => ({
              content: tab.title,
              active: tab.id === activeTabId,
            }))}
            onSelect={(_item, index) => setActiveTabId(tabs[index].id)}
            variant="normal"
          />

          <span title="New tab (Ctrl+Shift+T)">
            <Button
              variant="normal"
              onClick={handleNewTab}
            >
              <Plus size={13} style={{ verticalAlign: 'middle' }} />
            </Button>
          </span>

          {tabs.length > 1 && (
            <span title="Close active tab">
              <Button
                variant="normal"
                onClick={() => handleCloseTab(activeTabId)}
              >
                <X size={12} style={{ verticalAlign: 'middle' }} />
              </Button>
            </span>
          )}
        </div>

        {/* Toolbar Tools via Remochi Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span title="Clear terminal screen">
            <Button
              variant="normal"
              onClick={handleClearActive}
            >
              <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
            </Button>
          </span>

          <span title="Zoom Out">
            <Button
              variant="normal"
              onClick={zoomOut}
            >
              <ZoomOut size={13} style={{ verticalAlign: 'middle' }} />
            </Button>
          </span>

          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #565f89)', minWidth: '24px', textAlign: 'center' }}>
            {fontSize}px
          </span>

          <span title="Zoom In">
            <Button
              variant="normal"
              onClick={zoomIn}
            >
              <ZoomIn size={13} style={{ verticalAlign: 'middle' }} />
            </Button>
          </span>
        </div>
      </div>

      {/* Terminal Viewports Container */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '8px',
          position: 'relative',
        }}
      >
        {tabs.map((tab) => (
          <SingleTerminal
            key={tab.id}
            tabId={tab.id}
            isActive={tab.id === activeTabId}
            fontSize={fontSize}
            onCloseTab={handleCloseTab}
            onSetTitle={handleSetTitle}
            onRegisterTerm={handleRegisterTerm}
          />
        ))}
      </div>
    </div>
  );
};

export default TerminalApp;

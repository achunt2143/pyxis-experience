import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalAppProps {
  windowId: string;
  onClose?: () => void;
}

/**
 * TerminalApp
 * ------------
 * Embedded xterm.js shell with a tiny fake interactive command processor.
 * Supported commands: help, clear, echo <text>, ls, whoami, uname, exit.
 *
 * The prompt is GeckoOS-styled: gecko@pyxis:~$
 */
const PROMPT = '\x1b[1;32mgecko@pyxis\x1b[0m:\x1b[1;34m~\x1b[0m$ ';

const FAKE_FILESYSTEM: Record<string, string[]> = {
  '~': ['Documents', 'Downloads', 'Pictures', 'Music', 'README.md', '.bashrc'],
};

export const TerminalApp: React.FC<TerminalAppProps> = ({ windowId, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const bufferRef = useRef<string>('');
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef<number>(-1);
  const [ready, setReady] = useState(false);

  const writePrompt = (term: Terminal) => {
    term.write(`\r\n${PROMPT}`);
  };

  const handleCommand = (term: Terminal, raw: string) => {
    const line = raw.trim();
    if (!line) {
      writePrompt(term);
      return;
    }
    historyRef.current.push(line);
    historyIdxRef.current = historyRef.current.length;

    const [cmd, ...args] = line.split(/\s+/);
    switch (cmd) {
      case 'help':
        term.write(
          '\r\nAvailable commands:\r\n' +
            '  help          Show this message\r\n' +
            '  clear         Clear the screen\r\n' +
            '  echo <text>   Print text\r\n' +
            '  ls            List files in ~\r\n' +
            '  whoami        Show user\r\n' +
            '  uname         Show system\r\n' +
            '  exit          Close the terminal'
        );
        break;
      case 'clear':
        term.clear();
        break;
      case 'echo':
        term.write(`\r\n${args.join(' ')}`);
        break;
      case 'ls': {
        const entries = FAKE_FILESYSTEM['~'] ?? [];
        term.write('\r\n' + entries.join('  '));
        break;
      }
      case 'whoami':
        term.write('\r\ngecko');
        break;
      case 'uname':
        term.write('\r\nGeckoOS 0.1.0 pyxis x86_64');
        break;
      case 'exit':
        term.write('\r\nlogout');
        onClose?.();
        return;
      default:
        term.write(`\r\n${cmd}: command not found`);
    }
    writePrompt(term);
  };

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

    term.writeln('\x1b[1;36mGeckoOS Terminal\x1b[0m  Pyxis 0.1.0');
    term.writeln('Type "help" for available commands.');
    term.write(`\r\n${PROMPT}`);

    term.onData((data) => {
      const code = data.charCodeAt(0);
      if (code === 13) {
        // Enter
        handleCommand(term, bufferRef.current);
        bufferRef.current = '';
      } else if (code === 127) {
        // Backspace
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (code === 27) {
        // Escape sequences (arrow keys)
        if (data === '\x1b[A') {
          // up
          if (historyRef.current.length > 0 && historyIdxRef.current > 0) {
            historyIdxRef.current -= 1;
            const prev = historyRef.current[historyIdxRef.current];
            // erase current input
            term.write('\r\x1b[K' + PROMPT + prev);
            bufferRef.current = prev;
          }
        } else if (data === '\x1b[B') {
          // down
          if (historyIdxRef.current < historyRef.current.length - 1) {
            historyIdxRef.current += 1;
            const next = historyRef.current[historyIdxRef.current];
            term.write('\r\x1b[K' + PROMPT + next);
            bufferRef.current = next;
          } else {
            historyIdxRef.current = historyRef.current.length;
            term.write('\r\x1b[K' + PROMPT);
            bufferRef.current = '';
          }
        }
      } else if (code < 32) {
        // Ignore other control characters
      } else {
        bufferRef.current += data;
        term.write(data);
      }
    });

    termRef.current = term;
    fitRef.current = fit;
    setReady(true);

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      data-window-id={windowId}
      sx={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1b26',
        borderRadius: '8px',
        overflow: 'hidden',
        p: 1,
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        aria-label="terminal"
      />
      {!ready && null}
    </Box>
  );
};

export default TerminalApp;

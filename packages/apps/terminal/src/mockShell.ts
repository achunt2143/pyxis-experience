import type { Terminal } from '@xterm/xterm';

/**
 * Interactive Mock Unix Shell for Dev / Browser Mode.
 *
 * What a page gets when `org.geckoOS.terminal.Open` answers nothing (the dev server): a
 * line editor with a handful of commands, written straight into the xterm view. Moved
 * verbatim from the React app.
 */
export function startMockShell(
  term: Terminal,
  tabId: string,
  onSetTitle: (id: string, title: string) => void,
  onExit: () => void
): (data: string) => void {
  const promptVisible = '\x1b[1;32mgeckouser@pyxis\x1b[0m:\x1b[1;34m~\x1b[0m$ ';
  const prompt = `\r\n${promptVisible}`;
  let chars: string[] = [];
  let cursor = 0;
  const history: string[] = [];
  let historyIdx = 0;

  term.writeln('\x1b[1;36mPyxis Terminal\x1b[0m (interactive dev mock shell)');
  term.writeln('Type \x1b[1mhelp\x1b[0m for available commands.\r\n');
  term.write(promptVisible);

  const redrawLine = () => {
    const line = chars.join('');
    const tail = chars.length - cursor;
    term.write(`\r\x1b[K${promptVisible}${line}${tail > 0 ? `\x1b[${tail}D` : ''}`);
  };

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

  const handleInput = (data: string) => {
    let i = 0;
    while (i < data.length) {
      if (data[i] === '\x1b') {
        const rest = data.slice(i);
        if (rest.startsWith('\x1b[A')) {
          if (history.length > 0 && historyIdx > 0) {
            historyIdx--;
            chars = [...history[historyIdx]!];
            cursor = chars.length;
            redrawLine();
          }
          i += 3;
          continue;
        }
        if (rest.startsWith('\x1b[B')) {
          if (historyIdx < history.length - 1) {
            historyIdx++;
            chars = [...history[historyIdx]!];
            cursor = chars.length;
            redrawLine();
          } else if (historyIdx === history.length - 1) {
            historyIdx = history.length;
            chars = [];
            cursor = 0;
            redrawLine();
          }
          i += 3;
          continue;
        }
        if (rest.startsWith('\x1b[D')) {
          if (cursor > 0) {
            cursor--;
            term.write('\x1b[D');
          }
          i += 3;
          continue;
        }
        if (rest.startsWith('\x1b[C')) {
          if (cursor < chars.length) {
            cursor++;
            term.write('\x1b[C');
          }
          i += 3;
          continue;
        }
        if (rest.startsWith('\x1b[H') || rest.startsWith('\x1b[1~')) {
          if (cursor > 0) {
            cursor = 0;
            redrawLine();
          }
          i += rest.startsWith('\x1b[H') ? 3 : 4;
          continue;
        }
        if (rest.startsWith('\x1b[F') || rest.startsWith('\x1b[4~')) {
          if (cursor < chars.length) {
            cursor = chars.length;
            redrawLine();
          }
          i += rest.startsWith('\x1b[F') ? 3 : 4;
          continue;
        }
        if (rest.startsWith('\x1b[3~')) {
          if (cursor < chars.length) {
            chars.splice(cursor, 1);
            redrawLine();
          }
          i += 4;
          continue;
        }
        // Consume any other CSI escape sequence cleanly without inserting control garbage.
        if (rest.startsWith('\x1b[')) {
          const csi = /^[0-9;?]*[a-zA-Z~]/.exec(rest.slice(2));
          if (csi) {
            i += 2 + csi[0].length;
            continue;
          }
        }
        i += 1;
        continue;
      }

      const cp = data.codePointAt(i);
      if (cp === undefined) break;
      const ch = String.fromCodePoint(cp);
      i += ch.length;

      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && data[i] === '\n') i += 1;
        const cmd = chars.join('');
        chars = [];
        cursor = 0;
        execute(cmd);
        continue;
      }
      if (ch === '\u007F' || ch === '\b') {
        if (cursor > 0) {
          if (cursor === chars.length) {
            chars.pop();
            cursor--;
            term.write('\b \b');
          } else {
            chars.splice(cursor - 1, 1);
            cursor--;
            redrawLine();
          }
        }
        continue;
      }
      if (ch === '\u0003') {
        term.writeln('^C');
        chars = [];
        cursor = 0;
        term.write(prompt);
        continue;
      }
      if (ch === '\u0004') {
        if (chars.length === 0) {
          term.writeln('exit');
          onExit();
          return;
        }
        continue;
      }
      if (ch === '\u000c') {
        term.clear();
        term.write(prompt);
        if (chars.length > 0) {
          term.write(chars.join(''));
          const tail = chars.length - cursor;
          if (tail > 0) term.write(`\x1b[${tail}D`);
        }
        continue;
      }
      if (ch === '\u0001') {
        if (cursor > 0) {
          cursor = 0;
          redrawLine();
        }
        continue;
      }
      if (ch === '\u0005') {
        if (cursor < chars.length) {
          cursor = chars.length;
          redrawLine();
        }
        continue;
      }
      if (ch === '\t') {
        if (chars.join('').startsWith('ca')) {
          chars = [...'cat README.txt'];
          cursor = chars.length;
          redrawLine();
        }
        continue;
      }
      // Accept printable ASCII and all non-control UTF-8 characters.
      if (cp >= 0x20 && cp !== 0x7f && !(cp >= 0x80 && cp <= 0x9f)) {
        if (cursor === chars.length) {
          chars.push(ch);
          cursor++;
          term.write(ch);
        } else {
          chars.splice(cursor, 0, ch);
          cursor++;
          redrawLine();
        }
      }
    }
  };

  term.onData(handleInput);
  return handleInput;
}

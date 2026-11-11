import type { Terminal } from 'xterm';

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

  const handleInput = (e: string) => {
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
      case '\u0004': // Ctrl+D
        if (line.length === 0) {
          term.writeln('exit');
          onExit();
        }
        break;
      case '\u000c': // Ctrl+L (clear)
        term.clear();
        term.write(prompt);
        if (line.length > 0) {
          term.write(line);
        }
        break;
      case '\t': // Tab
        if (line.startsWith('ca')) {
          line = 'cat README.txt';
          term.write('\r\x1b[K' + prompt.trimStart() + line);
        }
        break;
      case '\u001b[A': // Up arrow
        if (history.length > 0 && historyIdx > 0) {
          historyIdx--;
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
  };

  term.onData(handleInput);
  return handleInput;
}

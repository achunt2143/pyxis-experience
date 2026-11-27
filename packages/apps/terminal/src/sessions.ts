/**
 * Sessions: what the Sessions pane says about each shell, as pure functions.
 *
 * A session is one shell. Echo tells the app three things about it: the shell's folder and
 * foreground job (`TerminalStatus`), and its exit code when it ends (`TerminalClosed`). Every
 * word a row shows (Idle, Running, Done, Exited 255) and the right-hand peek come from here,
 * so the views stay dumb and these rules are tested on their own.
 */

/** A job shows as Running only after it has run this long, the same wait Evo uses before a window shows busy. */
export const RUNNING_AFTER_MS = 2000;

/** What Echo's `TerminalStatus` says about a session's foreground job. */
export interface SessionJob {
  pid: number;
  command: string;
}

/** Echo's `TerminalStatus` payload. `job` is null while the shell itself is in front. */
export interface TerminalStatus {
  terminalId: string;
  cwd: string;
  job: SessionJob | null;
}

/**
 * - `idle`: the shell is in front, nothing has finished unseen.
 * - `running`: a job is in front (the row says Running once it has run RUNNING_AFTER_MS).
 * - `done`: a job finished; `exitCode` is set only when the shell reported one.
 * - `ended`: the shell itself exited with a nonzero code; Enter starts it again.
 */
export type SessionState = 'idle' | 'running' | 'done' | 'ended';

export interface Session {
  id: string;
  /** Echo's terminal id, or null for the dev mock shell / before Open answers. */
  terminalId: string | null;
  cwd: string;
  /** The foreground job, or the last one while `done`. */
  job: SessionJob | null;
  state: SessionState;
  exitCode: number | null;
  /** When the current job came to the front (ms since epoch). */
  jobStartedAt: number | null;
  /** Bells rung while this session was not the active one. */
  bells: number;
  /** A job finished here while another session was in front; opening it clears this. */
  unseen: boolean;
  /** True for the dev mock shell (no Echo PTY). */
  mock: boolean;
}

export function newSession(id: string, cwd = '~'): Session {
  return {
    id,
    terminalId: null,
    cwd,
    job: null,
    state: 'idle',
    exitCode: null,
    jobStartedAt: null,
    bells: 0,
    unseen: false,
    mock: false,
  };
}

const HOME_PREFIX = /^\/home\/[^/]+(?=\/|$)/;

/** `/home/andrew/geckos/evo` → `~/geckos/evo`; `/root/x` and others stay as they are. */
export function tidyPath(cwd: string): string {
  return cwd.replace(HOME_PREFIX, '~') || '/';
}

/** `ssh andrew@devbox -p 22` → `andrew@devbox`; anything else → null. */
export function sshTarget(command: string): string | null {
  const words = command.trim().split(/\s+/);
  if (words[0] !== 'ssh' && !words[0]?.endsWith('/ssh')) return null;
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (w.startsWith('-')) {
      // Options that take a value: skip it.
      if (/^-[bcDEeFIiJLlmOopQRSWw]$/.test(w)) i++;
      continue;
    }
    return w;
  }
  return null;
}

/** The session's name, its nameplate: the remote host for ssh, else the folder's own name. */
export function sessionName(s: Session): string {
  const remote = s.job ? sshTarget(s.job.command) : null;
  if (remote) return remote.includes('@') ? remote.split('@')[1]! : remote;
  const path = tidyPath(s.cwd);
  if (path === '~') return 'Home';
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Applies a `TerminalStatus`. `active` is whether this session is the one in front; `now` in ms. */
export function applyStatus(s: Session, status: TerminalStatus, active: boolean, now: number): Session {
  // A status from an `ended` session comes from the shell Enter started again: it is live.
  const next: Session = s.state === 'ended' ? { ...s, cwd: status.cwd, state: 'idle', exitCode: null } : { ...s, cwd: status.cwd };
  const prev = s.state === 'running' ? s.job : null;
  if (status.job) {
    const sameJob = prev && prev.pid === status.job.pid;
    return {
      ...next,
      job: status.job,
      state: 'running',
      exitCode: null,
      jobStartedAt: sameJob ? s.jobStartedAt : now,
    };
  }
  if (prev) {
    // The job left the front: it finished. Seen at once (this session is in front): forget the job. Unseen: keep it, the row and the peek name it.
    return active
      ? { ...next, state: 'idle', job: null, unseen: false, jobStartedAt: null }
      : { ...next, state: 'done', unseen: true, jobStartedAt: null };
  }
  return { ...next, job: s.state === 'done' ? s.job : null };
}

/** Applies a per-command exit code (OSC 133;D), when the shell reports one. */
export function applyCommandExit(s: Session, exitCode: number): Session {
  return s.state === 'done' ? { ...s, exitCode } : s;
}

/**
 * The shell exited. Code 0 (or unknown) closes the session; anything else keeps it as an
 * `ended` row ("Exited 255") that Enter starts again. Returns null when it should close.
 */
export function applyClosed(s: Session, exitCode: number | null): Session | null {
  if (exitCode === null || exitCode === 0) return null;
  return { ...s, state: 'ended', exitCode, job: null, jobStartedAt: null, terminalId: null };
}

/** Opening a session clears what it was holding for you. */
export function markSeen(s: Session): Session {
  if (!s.unseen && s.bells === 0 && s.state !== 'done') return s;
  return { ...s, unseen: false, bells: 0, state: s.state === 'done' ? 'idle' : s.state };
}

export function ringBell(s: Session, active: boolean): Session {
  return active ? s : { ...s, bells: s.bells + 1 };
}

/** Whether the row shows the Spinner: a job that has been in front for RUNNING_AFTER_MS. */
export function showsRunning(s: Session, now: number): boolean {
  return s.state === 'running' && s.jobStartedAt !== null && now - s.jobStartedAt >= RUNNING_AFTER_MS;
}

/** The row's state word. Every state is a word first; colour and the Spinner are a bonus. */
export function stateWord(s: Session, now: number): string {
  switch (s.state) {
    case 'running':
      // A job just started has no word yet: its command is the caption, and Running follows at 2 s.
      return showsRunning(s, now) ? 'Running' : '';
    case 'done':
      return s.exitCode !== null && s.exitCode !== 0 ? `Exited ${s.exitCode}` : 'Done';
    case 'ended':
      return `Exited ${s.exitCode ?? ''}`.trim();
    default:
      return 'Idle';
  }
}

/** Whether the state word is a failure (drawn in the error colour, beside its word). */
export function isFailure(s: Session): boolean {
  return (s.state === 'ended' || s.state === 'done') && s.exitCode !== null && s.exitCode !== 0;
}

/** The row's caption: the running or last job's command, else the folder. */
export function caption(s: Session): string {
  if ((s.state === 'running' || s.state === 'done') && s.job) return s.job.command;
  return tidyPath(s.cwd);
}

/** The Subheader under the active session's Header: folder · what is in front · size. */
export function subheader(s: Session, shell: string, cols: number, rows: number): string {
  const front = s.mock ? 'Mock shell' : s.state === 'running' && s.job ? s.job.command.split(/\s+/)[0]! : shell;
  return `${tidyPath(s.cwd)} · ${front} · ${cols} × ${rows}`;
}

/** "4 open, 1 running". */
export function summary(sessions: readonly Session[], now: number): string {
  const running = sessions.filter((s) => showsRunning(s, now)).length;
  return `${sessions.length} open, ${running} running`;
}

/** Two-digit position in the line of sessions: `01`, `02`… */
export function sequenceNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/**
 * The right-hand peek: the first session whose job finished while you were elsewhere.
 * Nothing when unsure; the right edge belongs to the person's own path.
 */
export function predictPeek(sessions: readonly Session[], activeId: string): Session | null {
  return sessions.find((s) => s.id !== activeId && s.unseen && s.state === 'done') ?? null;
}

/** What the peek's door names (Remochi says "Open …" before it): "pyxis-experience, npm test done". */
export function peekLabel(s: Session): string {
  const job = s.job ? `${s.job.command} ` : '';
  return `${sessionName(s)}, ${job}${stateWord(s, 0).toLowerCase()}`;
}

/** Recent folders for "Start In": newest first, distinct, at most `limit`. */
export function rememberFolder(recent: readonly string[], cwd: string, limit = 5): string[] {
  return [...new Set([cwd, ...recent])].slice(0, limit);
}

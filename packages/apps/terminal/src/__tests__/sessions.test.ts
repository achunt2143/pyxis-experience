import { describe, expect, it } from 'vitest';
import {
  RUNNING_AFTER_MS,
  applyClosed,
  applyCommandExit,
  applyStatus,
  caption,
  isFailure,
  markSeen,
  newSession,
  peekLabel,
  predictPeek,
  rememberFolder,
  ringBell,
  sequenceNumber,
  sessionName,
  showsRunning,
  sshTarget,
  stateWord,
  subheader,
  summary,
  tidyPath,
  type Session,
  type TerminalStatus,
} from '../sessions';

const EVO = '/home/andrew/geckos/evo';

/** A session in a given state, starting from a fresh one in the Evo folder. */
function session(patch: Partial<Session> = {}): Session {
  return { ...newSession('a', EVO), ...patch };
}

/** An Echo `TerminalStatus` for a session, with or without a foreground job. */
function status(cwd: string, job: { pid: number; command: string } | null = null): TerminalStatus {
  return { terminalId: 't1', cwd, job };
}

describe('newSession', () => {
  it('starts idle in the given folder with nothing held for the person', () => {
    const s = newSession('a', EVO);
    expect(s).toMatchObject({ id: 'a', cwd: EVO, state: 'idle', job: null, exitCode: null, bells: 0, unseen: false, mock: false });
    expect(s.terminalId).toBeNull();
  });

  it('starts in the home folder when no folder is given', () => {
    expect(newSession('a').cwd).toBe('~');
  });
});

describe('tidyPath', () => {
  it('shows the home folder as ~', () => {
    expect(tidyPath('/home/andrew')).toBe('~');
  });

  it('shortens a path under home to start at ~', () => {
    expect(tidyPath('/home/andrew/geckos/evo')).toBe('~/geckos/evo');
  });

  it('leaves a path outside home unchanged', () => {
    expect(tidyPath('/root/x')).toBe('/root/x');
    expect(tidyPath('/etc/nginx')).toBe('/etc/nginx');
  });

  it('leaves the filesystem root as /', () => {
    expect(tidyPath('/')).toBe('/');
  });
});

describe('sshTarget', () => {
  it('reads the target of a plain ssh command', () => {
    expect(sshTarget('ssh andrew@devbox')).toBe('andrew@devbox');
  });

  it('skips a trailing option that takes a value', () => {
    expect(sshTarget('ssh andrew@devbox -p 22')).toBe('andrew@devbox');
  });

  it('skips a leading option that takes a value', () => {
    expect(sshTarget('ssh -p 22 andrew@devbox')).toBe('andrew@devbox');
  });

  it('skips the key file given to -i', () => {
    expect(sshTarget('ssh -i ~/.ssh/key.pem devbox')).toBe('devbox');
  });

  it('skips a flag that takes no value', () => {
    expect(sshTarget('ssh -v devbox')).toBe('devbox');
  });

  it('accepts ssh run by its full path', () => {
    expect(sshTarget('/usr/bin/ssh devbox')).toBe('devbox');
  });

  it('is null for a command that is not ssh', () => {
    expect(sshTarget('npm test')).toBeNull();
    expect(sshTarget('sshd -D')).toBeNull();
  });

  it('is null when ssh has no target', () => {
    expect(sshTarget('ssh')).toBeNull();
    expect(sshTarget('ssh -p 22')).toBeNull();
  });
});

describe('sessionName', () => {
  it('names an ssh session by its remote host, without the user', () => {
    const s = session({ job: { pid: 1, command: 'ssh andrew@devbox -p 22' }, state: 'running' });
    expect(sessionName(s)).toBe('devbox');
  });

  it('names an ssh session by the host alone when there is no user', () => {
    const s = session({ job: { pid: 1, command: 'ssh devbox' }, state: 'running' });
    expect(sessionName(s)).toBe('devbox');
  });

  it('names a session in home Home', () => {
    expect(sessionName(session({ cwd: '/home/andrew' }))).toBe('Home');
    expect(sessionName(session({ cwd: '~' }))).toBe('Home');
  });

  it('names a session in a nested folder by that folder', () => {
    expect(sessionName(session({ cwd: '/home/andrew/geckos/evo' }))).toBe('evo');
  });

  it('names a session outside home by its own folder', () => {
    expect(sessionName(session({ cwd: '/root/x' }))).toBe('x');
  });

  it('names the filesystem root /', () => {
    expect(sessionName(session({ cwd: '/' }))).toBe('/');
  });

  it('names a session by its folder when no job is set', () => {
    expect(sessionName(session({ cwd: EVO, job: null }))).toBe('evo');
  });
});

describe('applyStatus', () => {
  it('starts running and records when the job came to the front', () => {
    const next = applyStatus(session(), status(EVO, { pid: 10, command: 'npm test' }), true, 1000);
    expect(next.state).toBe('running');
    expect(next.job).toEqual({ pid: 10, command: 'npm test' });
    expect(next.jobStartedAt).toBe(1000);
    expect(next.exitCode).toBeNull();
  });

  it('keeps the start time when the same job is reported again', () => {
    const started = applyStatus(session(), status(EVO, { pid: 10, command: 'npm test' }), true, 1000);
    const again = applyStatus(started, status(EVO, { pid: 10, command: 'npm test' }), true, 5000);
    expect(again.jobStartedAt).toBe(1000);
  });

  it('restarts the clock when a different job comes to the front', () => {
    const first = applyStatus(session(), status(EVO, { pid: 10, command: 'npm test' }), true, 1000);
    const second = applyStatus(first, status(EVO, { pid: 11, command: 'npm run build' }), true, 5000);
    expect(second.jobStartedAt).toBe(5000);
  });

  it('goes idle when a job ends while this session is in front', () => {
    const running = applyStatus(session(), status(EVO, { pid: 10, command: 'npm test' }), true, 1000);
    const done = applyStatus(running, status(EVO), true, 3000);
    expect(done.state).toBe('idle');
    expect(done.unseen).toBe(false);
    expect(done.jobStartedAt).toBeNull();
  });

  it('is done and unseen when a job ends while another session is in front', () => {
    const running = applyStatus(session(), status(EVO, { pid: 10, command: 'npm test' }), false, 1000);
    const done = applyStatus(running, status(EVO), false, 3000);
    expect(done.state).toBe('done');
    expect(done.unseen).toBe(true);
    expect(done.jobStartedAt).toBeNull();
  });

  it('follows a folder change on its own, without changing the state', () => {
    const moved = applyStatus(session({ cwd: EVO }), status('/home/andrew/geckos/pyxis'), true, 1000);
    expect(moved.cwd).toBe('/home/andrew/geckos/pyxis');
    expect(moved.state).toBe('idle');
    expect(moved.unseen).toBe(false);
  });

  it('keeps a finished job visible while the session is done', () => {
    const done = session({ state: 'done', job: { pid: 10, command: 'npm test' }, unseen: true });
    const next = applyStatus(done, status(EVO), false, 4000);
    expect(next.state).toBe('done');
    expect(next.job).toEqual({ pid: 10, command: 'npm test' });
  });

  it('a job ending while this session is in front leaves no job behind (the job is cleared, not kept as the last one)', () => {
    const running = session({ state: 'running', job: { pid: 20, command: 'ssh andrew@devbox' }, jobStartedAt: 1000 });
    const idle = applyStatus(running, status(EVO), true, 3000);
    expect(idle.state).toBe('idle');
    expect(idle.job).toBeNull();
    expect(sessionName(idle)).toBe('evo');
  });
});

describe('applyCommandExit', () => {
  it('records the exit code of a finished job', () => {
    const done = session({ state: 'done', job: { pid: 10, command: 'npm test' }, unseen: true });
    expect(applyCommandExit(done, 1).exitCode).toBe(1);
  });

  it('does nothing while the session is not done', () => {
    const running = session({ state: 'running', job: { pid: 10, command: 'npm test' } });
    expect(applyCommandExit(running, 1)).toBe(running);
  });
});

describe('applyClosed', () => {
  it('closes the session when the shell exited with 0', () => {
    expect(applyClosed(session(), 0)).toBeNull();
  });

  it('closes the session when the exit code is unknown', () => {
    expect(applyClosed(session(), null)).toBeNull();
  });

  it('keeps a session that exited nonzero as ended with its code', () => {
    const next = applyClosed(session({ state: 'running', job: { pid: 1, command: 'bash' } }), 255);
    expect(next).not.toBeNull();
    expect(next).toMatchObject({ state: 'ended', exitCode: 255, job: null, jobStartedAt: null, terminalId: null });
  });
});

describe('markSeen', () => {
  it('clears the unseen mark and the bells', () => {
    const s = session({ unseen: true, bells: 3, state: 'idle' });
    expect(markSeen(s)).toMatchObject({ unseen: false, bells: 0 });
  });

  it('turns a done session into idle', () => {
    const done = session({ state: 'done', unseen: true, job: { pid: 1, command: 'npm test' }, exitCode: 0 });
    expect(markSeen(done).state).toBe('idle');
  });

  it('leaves a running session running', () => {
    const running = session({ state: 'running', unseen: true, job: { pid: 1, command: 'npm test' }, bells: 1 });
    expect(markSeen(running).state).toBe('running');
  });

  it('returns the same session when there is nothing to clear', () => {
    const s = session();
    expect(markSeen(s)).toBe(s);
  });
});

describe('ringBell', () => {
  it('does not count a bell in the session that is in front', () => {
    const s = session();
    expect(ringBell(s, true)).toBe(s);
    expect(ringBell(s, true).bells).toBe(0);
  });

  it('counts a bell rung in a session that is not in front', () => {
    expect(ringBell(session({ bells: 1 }), false).bells).toBe(2);
    expect(ringBell(session(), false).bells).toBe(1);
  });
});

describe('showsRunning', () => {
  const started = (state: Session['state']) =>
    session({ state, job: { pid: 1, command: 'npm test' }, jobStartedAt: 10_000 });

  it('is false for a job that has only just started', () => {
    expect(showsRunning(started('running'), 10_000 + RUNNING_AFTER_MS - 1)).toBe(false);
  });

  it('is true once the job has run for RUNNING_AFTER_MS', () => {
    expect(showsRunning(started('running'), 10_000 + RUNNING_AFTER_MS)).toBe(true);
  });

  it('is false when the session is not running a job', () => {
    expect(showsRunning(started('idle'), 10_000 + RUNNING_AFTER_MS * 10)).toBe(false);
    expect(showsRunning(session({ state: 'running', jobStartedAt: null }), 99_999)).toBe(false);
  });

  it('uses a two second wait', () => {
    expect(RUNNING_AFTER_MS).toBe(2000);
  });
});

describe('stateWord', () => {
  const NOW = 50_000;

  it('says Idle for an idle session', () => {
    expect(stateWord(session({ state: 'idle' }), NOW)).toBe('Idle');
  });

  it('says nothing for a job that has not yet run long enough to show as Running', () => {
    const s = session({ state: 'running', job: { pid: 1, command: 'npm test' }, jobStartedAt: NOW - 100 });
    expect(stateWord(s, NOW)).toBe('');
  });

  it('says Running for a job that has run long enough', () => {
    const s = session({ state: 'running', job: { pid: 1, command: 'npm test' }, jobStartedAt: NOW - RUNNING_AFTER_MS });
    expect(stateWord(s, NOW)).toBe('Running');
  });

  it('says Done for a finished job with exit 0', () => {
    expect(stateWord(session({ state: 'done', exitCode: 0 }), NOW)).toBe('Done');
  });

  it('says Done for a finished job whose exit code is unknown', () => {
    expect(stateWord(session({ state: 'done', exitCode: null }), NOW)).toBe('Done');
  });

  it('says Exited with the code for a finished job that failed', () => {
    expect(stateWord(session({ state: 'done', exitCode: 2 }), NOW)).toBe('Exited 2');
  });

  it('says Exited with the code for a shell that ended nonzero', () => {
    expect(stateWord(session({ state: 'ended', exitCode: 255 }), NOW)).toBe('Exited 255');
  });

  it('says Exited alone for an ended shell with no code', () => {
    expect(stateWord(session({ state: 'ended', exitCode: null }), NOW)).toBe('Exited');
  });
});

describe('isFailure', () => {
  it('is true for a shell that ended nonzero', () => {
    expect(isFailure(session({ state: 'ended', exitCode: 255 }))).toBe(true);
  });

  it('is true for a finished job that exited nonzero', () => {
    expect(isFailure(session({ state: 'done', exitCode: 1 }))).toBe(true);
  });

  it('is false for a finished job that exited 0 or with no code', () => {
    expect(isFailure(session({ state: 'done', exitCode: 0 }))).toBe(false);
    expect(isFailure(session({ state: 'done', exitCode: null }))).toBe(false);
  });

  it('is false while a job is running or the shell is idle', () => {
    expect(isFailure(session({ state: 'running', exitCode: 1 }))).toBe(false);
    expect(isFailure(session({ state: 'idle', exitCode: null }))).toBe(false);
  });
});

describe('caption', () => {
  it('shows the command of a running job', () => {
    const s = session({ state: 'running', job: { pid: 1, command: 'npm test' } });
    expect(caption(s)).toBe('npm test');
  });

  it('shows the command of a finished job', () => {
    const s = session({ state: 'done', job: { pid: 1, command: 'npm test' }, exitCode: 0 });
    expect(caption(s)).toBe('npm test');
  });

  it('shows the folder when the shell is in front', () => {
    expect(caption(session({ state: 'idle' }))).toBe('~/geckos/evo');
  });

  it('shows the folder for a shell that ended', () => {
    expect(caption(session({ state: 'ended', exitCode: 255, job: null }))).toBe('~/geckos/evo');
  });
});

describe('subheader', () => {
  it('names the mock shell for the dev mock session', () => {
    const s = session({ mock: true });
    expect(subheader(s, 'bash', 80, 24)).toBe('~/geckos/evo · Mock shell · 80 × 24');
  });

  it('names the running job by its program', () => {
    const s = session({ state: 'running', job: { pid: 1, command: 'npm test --watch' } });
    expect(subheader(s, 'bash', 120, 40)).toBe('~/geckos/evo · npm · 120 × 40');
  });

  it('names the shell when the shell is in front', () => {
    expect(subheader(session(), 'bash', 80, 24)).toBe('~/geckos/evo · bash · 80 × 24');
  });
});

describe('summary', () => {
  it('counts the sessions open and the ones showing Running', () => {
    const now = 100_000;
    const sessions = [
      session({ id: 'a', state: 'running', job: { pid: 1, command: 'npm test' }, jobStartedAt: now - RUNNING_AFTER_MS }),
      session({ id: 'b', state: 'running', job: { pid: 2, command: 'npm run dev' }, jobStartedAt: now - 100 }),
      session({ id: 'c', state: 'idle' }),
      session({ id: 'd', state: 'done', job: { pid: 3, command: 'ls' }, exitCode: 0 }),
    ];
    expect(summary(sessions, now)).toBe('4 open, 1 running');
  });

  it('reads 0 open, 0 running when there are no sessions', () => {
    expect(summary([], 0)).toBe('0 open, 0 running');
  });
});

describe('sequenceNumber', () => {
  it('numbers the first session 01', () => {
    expect(sequenceNumber(0)).toBe('01');
  });

  it('pads single digits to two places', () => {
    expect(sequenceNumber(8)).toBe('09');
  });

  it('counts past nine without padding the tens', () => {
    expect(sequenceNumber(9)).toBe('10');
  });
});

describe('predictPeek', () => {
  const finished = (id: string, extra: Partial<Session> = {}) =>
    session({ id, state: 'done', unseen: true, job: { pid: 1, command: 'npm test' }, exitCode: 0, ...extra });

  it('is null when no session finished while the person was elsewhere', () => {
    expect(predictPeek([session({ id: 'a' }), session({ id: 'b' })], 'a')).toBeNull();
  });

  it('is the session whose job finished while the person was elsewhere', () => {
    const b = finished('b');
    expect(predictPeek([session({ id: 'a' }), b], 'a')).toBe(b);
  });

  it('never returns the session that is in front', () => {
    const a = finished('a', { unseen: false });
    expect(predictPeek([a, session({ id: 'b' })], 'a')).toBeNull();
  });

  it('is null when the unseen session is still running rather than done', () => {
    const b = session({ id: 'b', state: 'running', unseen: true, job: { pid: 1, command: 'npm test' }, jobStartedAt: 1 });
    expect(predictPeek([session({ id: 'a' }), b], 'a')).toBeNull();
  });

  it('is the first such session when several finished', () => {
    const b = finished('b');
    const c = finished('c');
    expect(predictPeek([session({ id: 'a' }), b, c], 'a')).toBe(b);
  });
});

describe('peekLabel', () => {
  it('names the door by its folder, the job and its outcome', () => {
    const s = session({
      cwd: '/home/andrew/geckos/pyxis-experience',
      state: 'done',
      job: { pid: 1, command: 'npm test' },
      exitCode: 0,
      unseen: true,
    });
    expect(peekLabel(s)).toBe('pyxis-experience, npm test done');
  });

  it('says how a failed job exited', () => {
    const s = session({
      cwd: '/home/andrew/geckos/pyxis-experience',
      state: 'done',
      job: { pid: 1, command: 'npm test' },
      exitCode: 1,
      unseen: true,
    });
    expect(peekLabel(s)).toBe('pyxis-experience, npm test exited 1');
  });

  it('names an ssh job by its remote host', () => {
    const s = session({ state: 'done', job: { pid: 1, command: 'ssh andrew@devbox' }, exitCode: 0, unseen: true });
    expect(peekLabel(s)).toBe('devbox, ssh andrew@devbox done');
  });
});

describe('rememberFolder', () => {
  it('puts the folder just used first', () => {
    expect(rememberFolder(['/a', '/b'], '/c')).toEqual(['/c', '/a', '/b']);
  });

  it('moves a folder used again to the front without repeating it', () => {
    expect(rememberFolder(['/a', '/b', '/c'], '/b')).toEqual(['/b', '/a', '/c']);
  });

  it('keeps at most five folders by default, dropping the oldest', () => {
    const recent = ['/a', '/b', '/c', '/d', '/e'];
    expect(rememberFolder(recent, '/f')).toEqual(['/f', '/a', '/b', '/c', '/d']);
  });

  it('honours a custom limit', () => {
    expect(rememberFolder(['/a', '/b', '/c'], '/d', 2)).toEqual(['/d', '/a']);
  });

  it('starts a list from nothing with the folder alone', () => {
    expect(rememberFolder([], '/a')).toEqual(['/a']);
  });

  it('keeps the list distinct even when the recent list it is given already repeats a folder', () => {
    expect(rememberFolder(['/b', '/b'], '/a')).toEqual(['/a', '/b']);
  });
});

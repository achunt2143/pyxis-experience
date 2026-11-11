import { describe, expect, it } from 'vitest';
import { UNKNOWN, aboutRows, formatBytes, formatUptime, type SystemInfo } from '../about';

/** A real `org.geckoOS.system.getInfo` answer (echo-daemon on a dev host, 2026-11-09), names changed. */
const GET_INFO = {
  cpu: { count: 4, frequency: '3867.515 MHz', model: 'AMD Ryzen 5 3600 6-Core Processor' },
  domain: '',
  hostname: 'pyxis',
  kernel: { name: 'Linux', release: '6.12.8-pyxis', version: '#1 SMP PREEMPT_DYNAMIC' },
  load: { fifteen: 0.71, five: 0.62, one: 0.58, runnableTasks: 3, totalTasks: 240 },
  memory: { available: 2_684_354_560, total: 4_108_062_720, used: 1_423_708_160 },
  os: { build: 'Unknown', name: 'Linux', version: '0.1.0' },
  uptime: { bootTime: '2026-11-09T07:00:00+00:00', idleSeconds: 9000.5, seconds: 3725.2 },
};

const byKey = (info: SystemInfo | null) => Object.fromEntries(aboutRows(info).map((r) => [r.key, r.value]));

describe('aboutRows', () => {
  it('reads every fact from getInfo', () => {
    expect(byKey(GET_INFO)).toEqual({
      os: 'Linux 0.1.0',
      kernel: 'Linux 6.12.8-pyxis',
      memory: '3.8 GB (2.5 GB available)',
      cpu: 'AMD Ryzen 5 3600 6-Core Processor · 4 cores',
      hostname: 'pyxis',
      uptime: '1 h 2 min',
    });
  });

  it('adds a build when there is one', () => {
    expect(byKey({ ...GET_INFO, os: { name: 'Pyxis', version: '0.1.0', build: '20261108' } }).os).toBe(
      'Pyxis 0.1.0 (build 20261108)'
    );
  });

  it('says unknown for a field getInfo nulled, and for deviceinfo’s "Unknown"', () => {
    const partial = { ...GET_INFO, kernel: null, memory: null, hostname: null, os: { name: 'Unknown', version: 'Unknown', build: 'Unknown' } };
    expect(byKey(partial)).toMatchObject({ os: UNKNOWN, kernel: UNKNOWN, memory: UNKNOWN, hostname: UNKNOWN });
  });

  it('says unknown for everything when the service did not answer', () => {
    expect(Object.values(byKey(null))).toEqual(Array(6).fill(UNKNOWN));
    // The dev server's mock answers `{ success: true }` to anything it doesn't know.
    expect(Object.values(byKey({ success: true } as SystemInfo))).toEqual(Array(6).fill(UNKNOWN));
  });

  it('copes with half a CPU answer', () => {
    expect(byKey({ cpu: { count: 1, model: '' } }).cpu).toBe('1 core');
    expect(byKey({ cpu: { count: 0, model: 'QEMU Virtual CPU' } }).cpu).toBe('QEMU Virtual CPU');
  });
});

describe('formatting', () => {
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
    expect(formatBytes(32_482_107_392)).toBe('30 GB');
  });

  it('formatUptime', () => {
    expect(formatUptime(59)).toBe('0 min');
    expect(formatUptime(3725)).toBe('1 h 2 min');
    expect(formatUptime(1_128_113)).toBe('13 days, 1 h');
    expect(formatUptime(86_400)).toBe('1 day, 0 h');
  });
});

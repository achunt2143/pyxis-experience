/**
 * About: `org.geckoOS.system.getInfo` (echo/src/services/system.rs) turned
 * into rows. A field the service couldn't read is null there, and a fact
 * deviceinfo couldn't find reads "Unknown"; both show here as "unknown"
 * rather than as a guess.
 */
import { echoClient } from '@pyxis/app-sdk';

export const SYSTEM_IFACE = 'org.geckoOS.system';

/** The parts of `getInfo` About reads; everything optional, since any field may be null. */
export interface SystemInfo {
  hostname?: string | null;
  os?: { name?: string; version?: string; build?: string } | null;
  kernel?: { name?: string; release?: string; version?: string } | null;
  cpu?: { count?: number; model?: string; frequency?: string } | null;
  memory?: { total?: number; available?: number; used?: number } | null;
  uptime?: { seconds?: number } | null;
}

export async function fetchSystemInfo(): Promise<SystemInfo | null> {
  try {
    const res = await echoClient.callMethod('system', SYSTEM_IFACE, 'getInfo');
    return res && typeof res === 'object' ? (res as SystemInfo) : null;
  } catch {
    return null;
  }
}

export const UNKNOWN = 'unknown';

/** A real value, or nothing: empty, "Unknown" and "N/A" are what deviceinfo says when it found nothing. */
function known(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && !/^(unknown|n\/a|none)$/i.test(t) ? t : null;
}

/** "3.8 GB", "512 MB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** "3 days, 4 h", "2 h 5 min", "12 min". */
export function formatUptime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}, ${hours} h`;
  if (hours > 0) return `${hours} h ${m} min`;
  return `${m} min`;
}

export interface AboutRow {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
}

export function aboutRows(info: SystemInfo | null): AboutRow[] {
  const os = info?.os;
  const osName = known(os?.name);
  const osVersion = known(os?.version);
  const osBuild = known(os?.build);
  const osText = osName || osVersion ? [osName, osVersion].filter(Boolean).join(' ') + (osBuild ? ` (build ${osBuild})` : '') : null;

  const k = info?.kernel;
  const kernelText = known(k?.release) ? [known(k?.name), known(k?.release)].filter(Boolean).join(' ') : null;

  const mem = info?.memory;
  const total = typeof mem?.total === 'number' && mem.total > 0 ? mem.total : null;
  const available = typeof mem?.available === 'number' && mem.available >= 0 ? mem.available : null;
  const memText = total ? formatBytes(total) + (available !== null ? ` (${formatBytes(available)} available)` : '') : null;

  const cpu = info?.cpu;
  const model = known(cpu?.model);
  const count = typeof cpu?.count === 'number' && cpu.count > 0 ? cpu.count : null;
  const cpuText =
    model || count
      ? [model, count ? `${count} core${count === 1 ? '' : 's'}` : null].filter(Boolean).join(model && count ? ' · ' : '')
      : null;

  const up = info?.uptime?.seconds;

  return [
    { key: 'os', label: 'Operating system', value: osText ?? UNKNOWN },
    { key: 'kernel', label: 'Kernel', value: kernelText ?? UNKNOWN, mono: !!kernelText },
    { key: 'memory', label: 'Memory', value: memText ?? UNKNOWN },
    { key: 'cpu', label: 'Processor', value: cpuText ?? UNKNOWN },
    { key: 'hostname', label: 'Hostname', value: known(info?.hostname) ?? UNKNOWN, mono: !!known(info?.hostname) },
    { key: 'uptime', label: 'Uptime', value: typeof up === 'number' && up >= 0 ? formatUptime(up) : UNKNOWN },
  ];
}

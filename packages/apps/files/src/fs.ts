// Files' calls to Echo's filesystem service. The method names, arguments and error handling
// are what the React app made; the scope (`user` / `system`) is stamped by the bridge, not here.
import { echoClient } from '@pyxis/app-sdk';
import type { DirState, FsEntry } from './model';

export const FS_SERVICE = 'filesystem';
export const FS_IFACE = 'org.geckoOS.filesystem';

/** A call that throws when the service answers `{ error }`. */
export async function fsCall(
  method: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  const res = (await echoClient.callMethod(FS_SERVICE, FS_IFACE, method, args)) as
    | (Record<string, unknown> & { error?: string })
    | undefined;
  if (res && typeof res === 'object' && res.error) {
    throw new Error(String(res.error));
  }
  return res;
}

/** A directory listing, or the reason there is none. Never throws. */
export async function fetchDir(path: string): Promise<DirState> {
  try {
    const res = (await echoClient.callMethod(FS_SERVICE, FS_IFACE, 'readDirectory', {
      path,
    })) as { entries?: FsEntry[]; error?: string } | undefined;
    if (res?.error || !res?.entries) {
      return { error: res?.error ?? 'Could not read directory' };
    }
    return { entries: res.entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

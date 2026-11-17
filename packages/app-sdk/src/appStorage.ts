/**
 * appStorage
 * ----------
 * Small JSON-document store for the PIM apps (Notes, Contacts, Tasks…).
 *
 * Native path: persists through the real `org.geckoOS.filesystem` Echo
 * service as `~/<store>.json`. On a device, `~` is the calling app's own
 * storage: the bridge confines every filesystem call an app makes to
 * /var/lib/pyxis/data/<app id> (echo/src/services/filesystem/scope.rs), so
 * one app's documents are out of every other app's reach. `writeFile` makes
 * missing directories itself, so no setup calls are needed.
 *
 * Another app's documents: pass its id as `app`. Only an app holding the
 * privileged `filesystem:apps` gets them (the shell, whose desktop search
 * reads Notes, Contacts and Tasks and adds notes and tasks); the bridge
 * refuses anyone else.
 *
 * Dev/browser path: EchoClient's mock backend answers the same
 * readFile/writeFile calls out of localStorage, so apps behave identically
 * without a daemon.
 */
import echoClient from './EchoClient';

const FS_SERVICE = 'filesystem';
const FS_IFACE = 'org.geckoOS.filesystem';

function docPath(store: string): string {
  return `~/${store}.json`;
}

export interface AppDataOptions {
  /** Whose documents: another app's id. Needs `filesystem:apps`. */
  app?: string;
}

export async function loadAppData<T>(
  store: string,
  fallback: T,
  options: AppDataOptions = {}
): Promise<T> {
  try {
    const res = (await echoClient.callMethod(FS_SERVICE, FS_IFACE, 'readFile', {
      path: docPath(store),
      encoding: 'utf-8',
      ...(options.app ? { app: options.app } : {}),
    })) as { content?: string } | undefined;
    if (res?.content) {
      return JSON.parse(res.content) as T;
    }
  } catch {
    // Missing file / unreadable JSON both mean "no saved data yet".
  }
  return fallback;
}

export async function saveAppData(
  store: string,
  data: unknown,
  options: AppDataOptions = {}
): Promise<boolean> {
  try {
    const content = JSON.stringify(data, null, 2);
    if (typeof content !== 'string') return false;
    const params = {
      path: docPath(store),
      content,
      encoding: 'utf-8',
      ...(options.app ? { app: options.app } : {}),
    };
    const native =
      echoClient.isNative() ||
      (typeof location !== 'undefined' && location.protocol === 'pyxis:');
    const res = (await (native
      ? echoClient.callMethodStrict(FS_SERVICE, FS_IFACE, 'writeFile', params)
      : echoClient.callMethod(FS_SERVICE, FS_IFACE, 'writeFile', params))) as
      | { success?: boolean; error?: string }
      | undefined;
    if (!res || typeof res !== 'object') return false;
    if (res.error) return false;
    return res.success !== false;
  } catch {
    return false;
  }
}

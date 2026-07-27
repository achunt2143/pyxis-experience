/**
 * appStorage
 * ----------
 * Small JSON-document store for the PIM apps (Notes, Contacts, Tasks…).
 *
 * Native path: persists through the real `org.geckoOS.filesystem` Echo
 * service (echo/src/services/filesystem.rs) under
 * `~/.local/share/geckoos/pim/<app>.json`. `writeFile` creates parent
 * directories itself and `~` is expanded daemon-side, so no extra setup
 * calls are needed.
 *
 * Dev/browser path: EchoClient's mock backend answers the same
 * readFile/writeFile calls out of localStorage, so apps behave identically
 * without a daemon.
 */
import echoClient from './EchoClient';

const FS_SERVICE = 'filesystem';
const FS_IFACE = 'org.geckoOS.filesystem';

function docPath(app: string): string {
  return `~/.local/share/geckoos/pim/${app}.json`;
}

export async function loadAppData<T>(app: string, fallback: T): Promise<T> {
  try {
    const res = (await echoClient.callMethod(FS_SERVICE, FS_IFACE, 'readFile', {
      path: docPath(app),
      encoding: 'utf-8',
    })) as { content?: string } | undefined;
    if (res?.content) {
      return JSON.parse(res.content) as T;
    }
  } catch {
    // Missing file / unreadable JSON both mean "no saved data yet".
  }
  return fallback;
}

export async function saveAppData(app: string, data: unknown): Promise<boolean> {
  try {
    const res = (await echoClient.callMethod(FS_SERVICE, FS_IFACE, 'writeFile', {
      path: docPath(app),
      content: JSON.stringify(data, null, 2),
      encoding: 'utf-8',
    })) as { success?: boolean } | undefined;
    return res?.success !== false;
  } catch {
    return false;
  }
}

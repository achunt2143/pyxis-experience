import { useApps } from './useApps';

/** The name to show for an app id: Nova's name, else the id, else "System" (no app). */
export function useAppName(appId?: string | null): string {
  const { apps } = useApps();
  if (!appId) return 'System';
  return apps.find((a) => a.id === appId)?.name ?? appId;
}

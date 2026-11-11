import { useEffect } from 'react';
import { useCompositorWindows } from '../hooks/useAppWindows';
import { refreshThumbnails } from './thumbnailStore';

/** Wait for a burst of changes to settle before asking Evo to draw. */
const SETTLE_MS = 350;

/**
 * Keep the thumbnails warm: refresh them a moment after a window appears,
 * goes, or the focus moves (the window just left has its last frame then).
 * Evo only redraws a window that has committed since, so this is cheap on
 * idle windows. Off in a tab with no compositor.
 */
export function useThumbnailPrefetch(enabled: boolean) {
  const { byId, focusedId } = useCompositorWindows();
  const idsKey = Object.keys(byId).sort().join(',');
  useEffect(() => {
    if (!enabled || !idsKey) return;
    const ids = idsKey.split(',').map(Number);
    const timer = window.setTimeout(() => void refreshThumbnails(ids), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, idsKey, focusedId]);
}

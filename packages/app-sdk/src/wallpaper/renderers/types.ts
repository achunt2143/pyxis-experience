import type { Scene } from '../scene';

export type WallpaperBackend = 'webgl' | 'css';

/**
 * A backend draws scenes into a container element it owns the inside of.
 * Drawing is explicit: the component decides when a frame is due (the fps
 * cap, the pause rules), a renderer never runs a loop of its own.
 */
export interface WallpaperRenderer {
  readonly backend: WallpaperBackend;
  /**
   * Draw one scene. `paletteMs` > 0 asks for the colours to ease to the new
   * ones over that long (a still wallpaper's once-a-minute crossfade); the
   * css backend does it with a transition, the webgl one is redrawn by the
   * caller through the crossfade instead and ignores it.
   */
  draw(scene: Scene, opts?: { paletteMs?: number }): void;
  /** The container's size changed (CSS px). */
  resize(width: number, height: number): void;
  dispose(): void;
}

import React, { useEffect, useMemo } from 'react';
import { MotionConfig } from 'framer-motion';
import { setAnimationSettings, useAnimationMode } from '@pyxis/app-sdk';
import { resolveTarget, resolveTransition, TRANSITION } from './motion';
import { MotionContext, type MotionApi } from './useMotion';

/**
 * Wraps the shell in framer-motion's MotionConfig, driven by the one
 * animation-mode source (the `pyxis.animations` setting, live across the
 * desktop and overlay documents). `reduced` also tells framer to drop
 * transforms and layout animation (`reducedMotion="always"`), a backstop for
 * any component that forgets to resolve its target.
 *
 * `syncEvo` (the overlay) pushes the persisted mode to Evo at startup and
 * on change, since Evo otherwise starts from its environment.
 */
export const MotionProvider: React.FC<{ children: React.ReactNode; syncEvo?: boolean }> = ({
  children,
  syncEvo = false,
}) => {
  const mode = useAnimationMode();

  useEffect(() => {
    if (syncEvo) void setAnimationSettings({ mode });
  }, [syncEvo, mode]);

  const api = useMemo<MotionApi>(
    () => ({
      mode,
      tr: (t) => resolveTransition(t, mode),
      to: (target) => resolveTarget(target, mode),
    }),
    [mode]
  );

  return (
    <MotionContext.Provider value={api}>
      <MotionConfig
        reducedMotion={mode === 'full' ? 'never' : 'always'}
        // What anything without its own transition (hover and tap scales)
        // falls back to, instead of framer's bouncy default spring.
        transition={api.tr(TRANSITION.focus)}
      >
        {children}
      </MotionConfig>
    </MotionContext.Provider>
  );
};

import { createContext, useContext } from 'react';
import type { Transition } from 'framer-motion';
import type { AnimationMode } from '@pyxis/app-sdk';

export interface MotionApi {
  mode: AnimationMode;
  /** A motion.ts transition, resolved for the animation mode. */
  tr: (t: Transition) => Transition;
  /** A framer target, with transforms dropped in `reduced`. */
  to: <T extends Record<string, unknown>>(target: T) => Partial<T>;
}

const FULL: MotionApi = {
  mode: 'full',
  tr: (t) => t,
  to: (target) => target,
};

export const MotionContext = createContext<MotionApi>(FULL);

/** Components read the resolved tokens here; outside a provider it is `full`. */
export function useMotion(): MotionApi {
  return useContext(MotionContext);
}

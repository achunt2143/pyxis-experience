import { useEffect, useState } from 'react';
import { onMinimizeLanded, type MinimizeLandedPayload, type MinimizeLandedPhase } from '@pyxis/app-sdk';

// Evo's MinimizeLanded, per app, for the dock's ripple (components/DockLanding.tsx).

/** One landing per app: `seq` counts them, so each replays the animation. */
export interface Landing {
  seq: number;
  phase: MinimizeLandedPhase;
}

export type Landings = Record<string, Landing>;

export function landingReducer(state: Landings, payload: Pick<MinimizeLandedPayload, 'app_id' | 'phase'>): Landings {
  const seq = (state[payload.app_id]?.seq ?? 0) + 1;
  return { ...state, [payload.app_id]: { seq, phase: payload.phase } };
}

/** The latest landing per app id, from Evo's signal. */
export function useDockLandings(): Landings {
  const [landings, setLandings] = useState<Landings>({});
  useEffect(() => onMinimizeLanded((p) => setLandings((s) => landingReducer(s, p))), []);
  return landings;
}

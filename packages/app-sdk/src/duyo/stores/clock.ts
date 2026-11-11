/**
 * The device clock as a store, for Duyo code-behind: `clock.ts`'s own
 * one-clock-per-document loop, the one `useClock` reads, so React and Duyo
 * readers share one timer and one Echo call.
 */
import type { Store } from './store';
import { clockStore as sharedClock, type ClockState } from '../../clock';

export const clockStore: Store<ClockState> = sharedClock;

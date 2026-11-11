import type { ReactNode } from 'react';
import { AppHostContext, useAppHostState } from './useEcho';

/** Owns the one AppHost subscription set; see `useAppHostState`. */
export function AppHostProvider({ children }: { children: ReactNode }) {
  const state = useAppHostState();
  return <AppHostContext.Provider value={state}>{children}</AppHostContext.Provider>;
}

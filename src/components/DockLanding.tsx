import React from 'react';
import { motion } from 'framer-motion';
import type { Landing } from '../hooks/useDockLandings';
import { useMotion } from '../useMotion';
import { DURATION, LUMEN } from '../motion';

/**
 * The dock's answer to Evo's Lumen Droplet: when a minimizing window lands in
 * its icon (`MinimizeLanded` `land`), or a restore rises out of it (`rise`),
 * the icon rings in its app's hue and its glyph dips. Evo sends the signal;
 * the dev server's mock sends it from MinimizeWindow/RestoreWindow.
 *
 * `full`: ring and dip. `reduced`: the ring alone, fading in place (no
 * spread: reduced allows no movement). `off`: nothing.
 */

/** The ring, laid over the icon (whose box must be `position: relative`). */
export const LandingRipple: React.FC<{ landing?: Landing; color: string; radius: string }> = ({
  landing,
  color,
  radius,
}) => {
  const { mode } = useMotion();
  if (!landing || mode === 'off') return null;
  const spread = mode === 'full' ? LUMEN.ripple.spreadPx : 4;
  const edge = (px: number) => ({ top: -px, left: -px, right: -px, bottom: -px });
  return (
    <motion.span
      key={landing.seq}
      aria-hidden
      data-landing={landing.seq}
      data-landing-phase={landing.phase}
      initial={{ ...edge(mode === 'full' ? 0 : spread), opacity: LUMEN.ripple.from }}
      animate={{ ...edge(spread), opacity: 0 }}
      transition={
        mode === 'full'
          ? {
              // The ring spreads fast and settles; its light fades evenly.
              duration: LUMEN.ripple.duration,
              ease: LUMEN.ripple.ease,
              opacity: { duration: LUMEN.ripple.duration, ease: 'linear' },
            }
          : { duration: DURATION.reduced, ease: 'linear' }
      }
      style={{
        position: 'absolute',
        borderRadius: radius,
        border: `2px solid ${color}`,
        boxShadow: `0 0 10px ${color}, inset 0 0 6px ${color}`,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    />
  );
};

/** The glyph, dipping under a landing in `full` mode. */
export const LandingDip: React.FC<{ landing?: Landing; children: React.ReactNode }> = ({ landing, children }) => {
  const { mode } = useMotion();
  const style: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (!landing || mode !== 'full') return <span style={style}>{children}</span>;
  return (
    <motion.span
      key={landing.seq}
      data-landing-dip={landing.seq}
      initial={{ y: 0 }}
      animate={{ y: LUMEN.dip.keyframes.map((k) => k * LUMEN.dip.px) }}
      transition={{ duration: LUMEN.dip.duration, times: [...LUMEN.dip.times], ease: 'easeOut' }}
      style={style}
    >
      {children}
    </motion.span>
  );
};

import React from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Cute 24x24 Lucide-compatible icon for Vela (the Pyxis web browser):
 * billowing main & jib sails, cozy boat hull, mast line, and a 4-point
 * Vela constellation star at the top-right.
 */
export const VelaIcon: LucideIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      size = 24,
      color = 'currentColor',
      strokeWidth = 2,
      absoluteStrokeWidth,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const resolvedStrokeWidth = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(size)
      : strokeWidth;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className ? `lucide lucide-vela ${className}` : 'lucide lucide-vela'}
        style={style}
        {...props}
      >
        <path
          d="M11 3.5 C16.5 5.5 19.5 10.5 19 15.5 L11 15.5 Z"
          fill="currentColor"
          fillOpacity={0.22}
        />
        <path d="M9 6.5 C6 9 4.8 12 4.5 15.5 L9 15.5 Z" />
        <path d="M10 3.5 L10 17.5" />
        <path d="M3.5 17.5 L20.5 17.5 L18 20.5 C15.5 21.3 8.5 21.3 6 20.5 Z" />
        <path
          d="M18.5 2 L19.2 3.8 L21 4.5 L19.2 5.2 L18.5 7 L17.8 5.2 L16 4.5 L17.8 3.8 Z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    );
  }
);

VelaIcon.displayName = 'VelaIcon';

export default VelaIcon;

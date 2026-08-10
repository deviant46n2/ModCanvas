// icon-base.tsx — the Icon SVG shell + props type shared by the icon files.
// Split out of icons.tsx (s30 debt payment — icons.tsx passed the 300-line
// cap). No other file should define its own SVG shell; import from here.

import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
}

export function Icon({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

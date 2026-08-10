// icons-align.tsx — align/distribute toolbar icons (canvas tools, s29).
// Split out of icons.tsx when it passed the 300-line cap (s30 debt payment).
// Shares Icon/IconProps from icon-base.tsx; icons.tsx re-exports these so the
// single consumer (canvas-tools.tsx) keeps one import site.

import { Icon, type IconProps } from './icon-base'

export const AlignLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="12" y2="12" />
    <line x1="4" y1="18" x2="16" y2="18" />
  </Icon>
)

export const AlignCenterXIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="6" y1="18" x2="18" y2="18" />
  </Icon>
)

export const AlignRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="12" y1="12" x2="20" y2="12" />
    <line x1="8" y1="18" x2="20" y2="18" />
  </Icon>
)

export const AlignTopIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="6" y1="4" x2="6" y2="20" />
    <line x1="12" y1="4" x2="12" y2="12" />
    <line x1="18" y1="4" x2="18" y2="16" />
  </Icon>
)

export const AlignCenterYIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="6" y1="4" x2="6" y2="20" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="18" y1="6" x2="18" y2="18" />
  </Icon>
)

export const AlignBottomIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="6" y1="4" x2="6" y2="20" />
    <line x1="12" y1="12" x2="12" y2="20" />
    <line x1="18" y1="8" x2="18" y2="20" />
  </Icon>
)

export const DistributeHIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="5" y1="4" x2="5" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="19" y1="4" x2="19" y2="20" />
  </Icon>
)

export const DistributeVIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="4" y1="5" x2="20" y2="5" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="19" x2="20" y2="19" />
  </Icon>
)

import clsx from 'clsx'
import { ENUM_BADGE_COLORS } from '@constants/colors'

export interface EnumBadgeProps {
  value: string
  className?: string
}

// Simple hash function for consistent color assignment
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

export function EnumBadge({ value, className }: EnumBadgeProps) {
  const colorIndex = hashString(value) % ENUM_BADGE_COLORS.length
  const colorClass = ENUM_BADGE_COLORS[colorIndex]

  return (
    <span
      className={clsx(
        'px-1.5 py-0.5 rounded text-[11px] font-medium',
        colorClass,
        className
      )}
    >
      {value}
    </span>
  )
}

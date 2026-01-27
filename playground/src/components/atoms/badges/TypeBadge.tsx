import clsx from 'clsx'
import { TYPE_COLORS } from '@constants/colors'

export interface TypeBadgeProps {
  type: string
  enumValues?: string[]
  small?: boolean
  className?: string
}

export function TypeBadge({ type, enumValues, small = false, className }: TypeBadgeProps) {
  const sizeClass = small ? 'text-[10px]' : 'text-xs'

  if (type === 'enum' && enumValues && enumValues.length > 0) {
    const hint = enumValues.join(' | ')
    return (
      <span
        className={clsx(sizeClass, 'font-mono', TYPE_COLORS.enum, className)}
        title={hint}
      >
        enum
      </span>
    )
  }

  return (
    <span className={clsx(sizeClass, 'font-mono', TYPE_COLORS[type] || 'text-gray-500', className)}>
      {type}
    </span>
  )
}

import clsx from 'clsx'

export interface NullBadgeProps {
  className?: string
}

export function NullBadge({ className }: NullBadgeProps) {
  return (
    <span className={clsx('text-gray-500 italic text-xs', className)}>
      null
    </span>
  )
}

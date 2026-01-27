import clsx from 'clsx'

export interface BooleanBadgeProps {
  value: boolean
  className?: string
}

export function BooleanBadge({ value, className }: BooleanBadgeProps) {
  return (
    <span
      className={clsx(
        'px-1.5 py-0.5 rounded text-[11px] font-medium',
        value
          ? 'bg-green-600/30 text-green-400'
          : 'bg-red-600/30 text-red-400',
        className
      )}
    >
      {value ? 'true' : 'false'}
    </span>
  )
}

import clsx from 'clsx'

export interface RequiredBadgeProps {
  className?: string
}

export function RequiredBadge({ className }: RequiredBadgeProps) {
  return (
    <span className={clsx('text-[10px] text-red-400/70 uppercase tracking-wider', className)}>
      req
    </span>
  )
}

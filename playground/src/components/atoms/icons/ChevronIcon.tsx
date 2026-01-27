import clsx from 'clsx'

export interface ChevronIconProps {
  expanded?: boolean
  className?: string
}

export function ChevronIcon({ expanded = false, className }: ChevronIconProps) {
  return (
    <svg
      className={clsx(
        'w-4 h-4 transition-transform text-gray-500',
        expanded && 'rotate-90',
        className
      )}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  )
}

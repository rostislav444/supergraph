import clsx from 'clsx'

export interface EntityListItemProps {
  name: string
  selected: boolean
  onClick: () => void
  className?: string
}

export function EntityListItem({ name, selected, onClick, className }: EntityListItemProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
        selected
          ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
          : 'text-gray-300 hover:bg-gray-800/50 border border-transparent',
        className
      )}
    >
      {name}
    </button>
  )
}

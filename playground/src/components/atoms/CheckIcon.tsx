import clsx from 'clsx'

export interface CheckIconProps {
  checked?: boolean
  small?: boolean
  className?: string
}

export function CheckIcon({ checked = false, small = false, className }: CheckIconProps) {
  return (
    <div
      className={clsx(
        'rounded border flex items-center justify-center flex-shrink-0',
        small ? 'w-3.5 h-3.5 text-[10px]' : 'w-4 h-4 text-xs',
        checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-600',
        className
      )}
    >
      {checked && '✓'}
    </div>
  )
}

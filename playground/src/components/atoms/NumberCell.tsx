import clsx from 'clsx'

export interface NumberCellProps {
  value: number
  className?: string
}

export function NumberCell({ value, className }: NumberCellProps) {
  const isFloat = !Number.isInteger(value)

  return (
    <span
      className={clsx(
        'font-mono text-xs',
        isFloat ? 'text-cyan-400' : 'text-orange-400',
        className
      )}
    >
      {isFloat ? value.toFixed(2) : value}
    </span>
  )
}

import { useState } from 'react'
import clsx from 'clsx'

export interface TextCellProps {
  value: string
  maxLength?: number
  className?: string
}

export function TextCell({ value, maxLength = 50, className }: TextCellProps) {
  const [expanded, setExpanded] = useState(false)

  const isLong = value.length > maxLength

  if (!isLong) {
    return <span className={clsx('text-gray-300', className)}>{value}</span>
  }

  return (
    <div className={clsx('relative', className)}>
      <span className="text-gray-300">
        {expanded ? value : `${value.slice(0, maxLength)}...`}
      </span>
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-blue-400 hover:text-blue-300 text-xs"
      >
        {expanded ? 'less' : 'more'}
      </button>
    </div>
  )
}

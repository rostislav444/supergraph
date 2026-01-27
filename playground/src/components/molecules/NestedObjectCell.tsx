import { useState } from 'react'
import clsx from 'clsx'

export interface NestedObjectCellProps {
  value: Record<string, unknown> | unknown[]
  fieldName?: string
  className?: string
}

export function NestedObjectCell({ value, fieldName = '', className }: NestedObjectCellProps) {
  const [expanded, setExpanded] = useState(false)

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-500 italic">[]</span>
    }
    return (
      <div className={className}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-400 hover:text-blue-300 text-xs"
        >
          [{value.length} items] {expanded ? '▼' : '▶'}
        </button>
        {expanded && (
          <div className="mt-1 pl-2 border-l border-gray-700 text-xs">
            {value.slice(0, 5).map((item, i) => (
              <div key={i} className="py-0.5">
                {typeof item === 'object' ? JSON.stringify(item) : String(item)}
              </div>
            ))}
            {value.length > 5 && (
              <div className="text-gray-500">...and {value.length - 5} more</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Object
  const entries = Object.entries(value)
  if (entries.length === 0) {
    return <span className="text-gray-500 italic">{'{}'}</span>
  }

  // For small objects (1-2 fields), show inline
  if (entries.length <= 2) {
    return (
      <div className={clsx('flex flex-wrap gap-2', className)}>
        {entries.map(([k, v]) => (
          <span key={k} className="text-[10px]">
            <span className="text-gray-500">{k}:</span>{' '}
            <span className="text-gray-300">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          </span>
        ))}
      </div>
    )
  }

  // For larger objects, show expandable
  return (
    <div className={className}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-blue-400 hover:text-blue-300 text-xs"
      >
        {'{'}
        {entries.length} fields{'}'} {expanded ? '▼' : '▶'}
      </button>
      {expanded && (
        <div className="mt-1 pl-2 border-l border-gray-700 text-xs">
          {entries.slice(0, 10).map(([k, v]) => (
            <div key={k} className="py-0.5">
              <span className="text-gray-500">{k}:</span>{' '}
              <span className="text-gray-300">
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
          {entries.length > 10 && (
            <div className="text-gray-500">...and {entries.length - 10} more</div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { Field } from '@/types'

export interface FilterSectionProps {
  path: string
  fields: Array<[string, Field]>
  filters: Record<string, string>
  onSetFilter: (data: { path: string; field: string; op: string; value: string }) => void
}

export function FilterSection({ path, fields, filters, onSetFilter }: FilterSectionProps) {
  const [showFilters, setShowFilters] = useState(false)
  const activeCount = Object.keys(filters).length

  return (
    <div className="mt-1 px-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowFilters(!showFilters)
        }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        Filters{activeCount > 0 && ` (${activeCount})`}
      </button>
      {showFilters && (
        <div className="mt-1 space-y-1 bg-gray-800/50 p-2 rounded max-h-64 overflow-y-auto">
          {fields.map(([fieldName]) => (
            <div key={fieldName} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-20 truncate font-mono">{fieldName}</span>
              <input
                type="text"
                value={filters[`${fieldName}__eq`] || ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  onSetFilter({ path, field: fieldName, op: 'eq', value: e.target.value })
                }
                placeholder="="
                className="flex-1 bg-gray-700 text-xs px-2 py-1 rounded border-none text-white placeholder-gray-500 min-w-0"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'

export interface PaginationData {
  limit?: number | null
  offset?: number | null
}

export interface PaginationSectionProps {
  path: string
  pagination?: PaginationData
  onSetPagination: (data: { path: string; limit: number | null; offset: number | null }) => void
}

export function PaginationSection({ path, pagination, onSetPagination }: PaginationSectionProps) {
  const [showPagination, setShowPagination] = useState(false)
  const limit = pagination?.limit || ''
  const offset = pagination?.offset || ''
  const hasSettings = limit || offset

  return (
    <div className="mt-1 px-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowPagination(!showPagination)
        }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 10h16M4 14h16M4 18h16"
          />
        </svg>
        Pagination{hasSettings && ' •'}
      </button>
      {showPagination && (
        <div className="mt-1 space-y-1 bg-gray-800/50 p-2 rounded">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-12 font-mono">limit</span>
            <input
              type="number"
              value={limit}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                onSetPagination({
                  path,
                  limit: e.target.value ? parseInt(e.target.value) : null,
                  offset: (offset as number) || null,
                })
              }
              placeholder="50"
              className="flex-1 bg-gray-700 text-xs px-2 py-1 rounded border-none text-white placeholder-gray-500 min-w-0 w-16"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-12 font-mono">offset</span>
            <input
              type="number"
              value={offset}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                onSetPagination({
                  path,
                  limit: (limit as number) || null,
                  offset: e.target.value ? parseInt(e.target.value) : null,
                })
              }
              placeholder="0"
              className="flex-1 bg-gray-700 text-xs px-2 py-1 rounded border-none text-white placeholder-gray-500 min-w-0 w-16"
            />
          </div>
        </div>
      )}
    </div>
  )
}

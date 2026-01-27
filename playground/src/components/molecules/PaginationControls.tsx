import clsx from 'clsx'

export interface PaginationControlsProps {
  filteredCount: number
  totalCount: number
  totalInDatabase?: number | null
  hasFilters: boolean
  pageSize: number
  setPageSize: (size: number) => void
  currentPage: number
  setCurrentPage: (page: number | ((p: number) => number)) => void
  totalPages: number
  position?: 'top' | 'bottom'
  loading?: boolean
}

export function PaginationControls({
  filteredCount,
  totalInDatabase,
  hasFilters,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  totalPages,
  position = 'bottom',
  loading = false,
}: PaginationControlsProps) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between px-3 py-2 bg-gray-800 text-xs',
        position === 'top' ? 'border-b border-gray-700 rounded-t' : 'border-t border-gray-700'
      )}
    >
      <div className="flex items-center gap-2 text-gray-400">
        {loading ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-blue-400">Loading...</span>
          </div>
        ) : (
          <>
            <span>{filteredCount} rows</span>
            {totalInDatabase != null && totalInDatabase !== filteredCount && (
              <span className="text-gray-500">of {totalInDatabase} total</span>
            )}
            {hasFilters && <span className="text-blue-400">(filtered)</span>}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Page size */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Show:</span>
          <select
            value={pageSize === Infinity ? 'all' : pageSize}
            onChange={(e) => {
              setPageSize(e.target.value === 'all' ? Infinity : Number(e.target.value))
              setCurrentPage(1)
            }}
            className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded border border-gray-600"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value="all">All</option>
          </select>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-600"
          >
            «
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-600"
          >
            ‹
          </button>
          <span className="px-2 text-gray-300">
            {currentPage} / {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-600"
          >
            ›
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-600"
          >
            »
          </button>
        </div>
      </div>
    </div>
  )
}

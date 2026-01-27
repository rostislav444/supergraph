// @ts-nocheck
import { useMemo, useState, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import clsx from 'clsx'
import { selectResult, selectQueryError, selectQueryLoading, selectHistory, selectQueryText, executeQuery, setQueryText } from '../store/querySlice'
import { selectRootEntity, setPagination, selectPagination } from '../store/builderSlice'

// JSON Syntax Highlighter
function JsonValue({ value, depth = 0 }) {
  if (value === null) {
    return <span className="text-gray-500">null</span>
  }

  if (typeof value === 'boolean') {
    return <span className="text-purple-400">{value.toString()}</span>
  }

  if (typeof value === 'number') {
    return <span className="text-orange-400">{value}</span>
  }

  if (typeof value === 'string') {
    return <span className="text-green-400">"{value}"</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400">[]</span>
    }

    return (
      <span>
        <span className="text-gray-400">[</span>
        <div className="ml-4">
          {value.map((item, i) => (
            <div key={i}>
              <JsonValue value={item} depth={depth + 1} />
              {i < value.length - 1 && <span className="text-gray-400">,</span>}
            </div>
          ))}
        </div>
        <span className="text-gray-400">]</span>
      </span>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return <span className="text-gray-400">{'{}'}</span>
    }

    return (
      <span>
        <span className="text-gray-400">{'{'}</span>
        <div className="ml-4">
          {entries.map(([key, val], i) => (
            <div key={key}>
              <span className="text-blue-300">"{key}"</span>
              <span className="text-gray-400">: </span>
              <JsonValue value={val} depth={depth + 1} />
              {i < entries.length - 1 && <span className="text-gray-400">,</span>}
            </div>
          ))}
        </div>
        <span className="text-gray-400">{'}'}</span>
      </span>
    )
  }

  return <span>{String(value)}</span>
}

// Collapsible JSON Tree - always expanded
function JsonTree({ data, label = null, depth = 0 }) {
  const isObject = data && typeof data === 'object'
  const isArray = Array.isArray(data)
  const isEmpty = isObject && Object.keys(data).length === 0

  if (!isObject) {
    return (
      <div className="flex items-start gap-1">
        {label !== null && (
          <>
            <span className="text-blue-300">
              {typeof label === 'number' ? label : `"${label}"`}
            </span>
            <span className="text-gray-400">: </span>
          </>
        )}
        <JsonValue value={data} />
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex items-start gap-1">
        {label !== null && (
          <>
            <span className="text-blue-300">
              {typeof label === 'number' ? label : `"${label}"`}
            </span>
            <span className="text-gray-400">: </span>
          </>
        )}
        <span className="text-gray-400">{isArray ? '[]' : '{}'}</span>
      </div>
    )
  }

  const entries = isArray
    ? data.map((v, i) => [i, v])
    : Object.entries(data)

  return (
    <div>
      <div className="flex items-start gap-1">
        {label !== null && (
          <>
            <span className="text-blue-300">
              {typeof label === 'number' ? label : `"${label}"`}
            </span>
            <span className="text-gray-400">: </span>
          </>
        )}
        <span className="text-gray-400">{isArray ? '[' : '{'}</span>
      </div>
      <div className="ml-4 border-l border-gray-700 pl-2">
        {entries.map(([key, val], i) => (
          <JsonTree key={key} data={val} label={key} depth={depth + 1} />
        ))}
      </div>
      <span className="text-gray-400">{isArray ? ']' : '}'}</span>
    </div>
  )
}

// Tab button component
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-2 text-sm font-medium transition-colors border-b-2',
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-gray-400 hover:text-gray-200'
      )}
    >
      {children}
    </button>
  )
}

// Pagination controls
function PaginationControls({ pagination, onPrev, onNext }) {
  if (!pagination) return null

  const { total, limit, offset, has_next } = pagination
  const currentPage = Math.floor(offset / (limit || 50)) + 1
  const totalPages = limit ? Math.ceil(total / limit) : 1
  const hasPrev = offset > 0

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-700 bg-gray-800/50">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className={clsx(
          'flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors',
          hasPrev
            ? 'bg-gray-700 text-white hover:bg-gray-600'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
        )}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Prev
      </button>
      <span className="text-sm text-gray-400">
        Page {currentPage} of {totalPages} ({total} total)
      </span>
      <button
        onClick={onNext}
        disabled={!has_next}
        className={clsx(
          'flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors',
          has_next
            ? 'bg-gray-700 text-white hover:bg-gray-600'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
        )}
      >
        Next
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

// Main ResultViewer
export default function ResultViewer() {
  const dispatch = useDispatch()
  const result = useSelector(selectResult)
  const error = useSelector(selectQueryError)
  const loading = useSelector(selectQueryLoading)
  const history = useSelector(selectHistory)
  const queryText = useSelector(selectQueryText)
  const rootEntity = useSelector(selectRootEntity)
  const pagination = useSelector(selectPagination)
  const [activeTab, setActiveTab] = useState('result')
  const [viewMode, setViewMode] = useState('tree') // 'tree' or 'raw'

  const formattedResult = useMemo(() => {
    if (!result) return ''
    return JSON.stringify(result, null, 2)
  }, [result])

  const stats = useMemo(() => {
    if (!result) return null

    const countItems = (data) => {
      if (!data) return 0
      if (data.items) return data.items.length
      if (Array.isArray(data)) return data.length
      return 1
    }

    const data = result.data
    const itemCount = countItems(data)
    const paginationInfo = data?.pagination

    return { itemCount, pagination: paginationInfo }
  }, [result])

  const handlePrevPage = useCallback(() => {
    if (!stats?.pagination) return
    try {
      const query = JSON.parse(queryText)
      const entityName = Object.keys(query).find(k => k[0] === k[0].toUpperCase())
      if (!entityName) return

      const currentOffset = query[entityName]?.offset || 0
      const limit = stats.pagination.limit || 50
      const newOffset = Math.max(0, currentOffset - limit)

      query[entityName] = { ...query[entityName], offset: newOffset, limit }
      const newQueryText = JSON.stringify(query, null, 2)

      // Update builder state, query text, and execute
      if (rootEntity) {
        dispatch(setPagination({ path: rootEntity, limit, offset: newOffset }))
      }
      dispatch(setQueryText(newQueryText))
      dispatch(executeQuery(newQueryText))
    } catch (e) {
      console.error('Failed to parse query for pagination', e)
    }
  }, [dispatch, rootEntity, stats, queryText])

  const handleNextPage = useCallback(() => {
    if (!stats?.pagination) return
    try {
      const query = JSON.parse(queryText)
      const entityName = Object.keys(query).find(k => k[0] === k[0].toUpperCase())
      if (!entityName) return

      const currentOffset = query[entityName]?.offset || 0
      const limit = stats.pagination.limit || 50
      const newOffset = currentOffset + limit

      query[entityName] = { ...query[entityName], offset: newOffset, limit }
      const newQueryText = JSON.stringify(query, null, 2)

      // Update builder state, query text, and execute
      if (rootEntity) {
        dispatch(setPagination({ path: rootEntity, limit, offset: newOffset }))
      }
      dispatch(setQueryText(newQueryText))
      dispatch(executeQuery(newQueryText))
    } catch (e) {
      console.error('Failed to parse query for pagination', e)
    }
  }, [dispatch, rootEntity, stats, queryText])

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-gray-700 px-2">
        <div className="flex">
          <TabButton active={activeTab === 'result'} onClick={() => setActiveTab('result')}>
            Response
          </TabButton>
          <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
            History ({history.length})
          </TabButton>
        </div>

        {activeTab === 'result' && result && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('tree')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'tree' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              )}
              title="Tree view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'raw' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              )}
              title="Raw JSON"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(formattedResult)}
              className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors"
              title="Copy to clipboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'result' ? (
          <>
            {loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full mx-auto mb-2"></div>
                  <p className="text-sm text-gray-400">Executing query...</p>
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="flex-1 overflow-auto p-4">
                <div className="bg-red-900/30 border border-red-800 rounded p-4">
                  <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Error
                  </div>
                  <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">
                    {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {result && !loading && (
              <>
                <div className="flex-1 overflow-auto p-4">
                  {/* Stats bar */}
                  {stats && (
                    <div className="flex items-center gap-4 mb-4 text-sm">
                      <span className="text-green-400">
                        {stats.itemCount} {stats.itemCount === 1 ? 'result' : 'results'}
                      </span>
                      {stats.pagination && (
                        <>
                          <span className="text-gray-600">|</span>
                          <span className="text-gray-400">
                            Total: {stats.pagination.total}
                          </span>
                          {stats.pagination.has_next && (
                            <span className="text-blue-400 text-xs">
                              More available
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Result content */}
                  {viewMode === 'tree' ? (
                    <div className="font-mono text-sm">
                      <JsonTree data={result} />
                    </div>
                  ) : (
                    <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap">
                      {formattedResult}
                    </pre>
                  )}
                </div>

                {/* Pagination controls */}
                {stats?.pagination && (
                  <PaginationControls
                    pagination={stats.pagination}
                    onPrev={handlePrevPage}
                    onNext={handleNextPage}
                  />
                )}
              </>
            )}

            {!result && !error && !loading && (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">Execute a query to see results</p>
                  <p className="text-xs text-gray-600 mt-1">Ctrl+Enter to run</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            {history.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-sm">No query history yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry, i) => (
                  <HistoryEntry key={i} entry={entry} index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryEntry({ entry, index }) {
  const [expanded, setExpanded] = useState(false)
  const time = new Date(entry.timestamp).toLocaleTimeString()

  let queryPreview = ''
  try {
    const parsed = JSON.parse(entry.query)
    const entityName = Object.keys(parsed).find(k => k[0] === k[0].toUpperCase())
    queryPreview = entityName || 'Query'
  } catch {
    queryPreview = 'Query'
  }

  return (
    <div className="bg-gray-800 rounded overflow-hidden">
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-700/50"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs text-gray-500">{index + 1}</span>
        <span className="text-sm text-gray-200 flex-1">{queryPreview}</span>
        <span className="text-xs text-gray-500">{time}</span>
        <svg
          className={clsx('w-4 h-4 text-gray-500 transition-transform', expanded && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-gray-700 p-3">
          <div className="mb-2">
            <span className="text-xs text-gray-500 uppercase">Query</span>
            <pre className="text-xs text-gray-400 mt-1 max-h-32 overflow-auto">
              {entry.query}
            </pre>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase">Response</span>
            <pre className="text-xs text-gray-400 mt-1 max-h-32 overflow-auto">
              {JSON.stringify(entry.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

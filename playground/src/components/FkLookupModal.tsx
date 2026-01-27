// @ts-nocheck
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

// Shared FK Lookup Modal component
export default function FkLookupModal({ isOpen, onClose, onSelect, targetEntity, graph }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const inputRef = useRef(null)
  const LIMIT = 50

  // Get entity definition
  const entityDef = graph?.entities?.[targetEntity]
  const displayFields = useMemo(() => {
    if (!entityDef?.fields) return ['id', 'name']
    const fields = Object.keys(entityDef.fields)
    // Prioritize: id, name, title, code, then first few string fields
    const priority = ['id', 'name', 'title', 'code', 'first_name', 'last_name']
    const sorted = [...priority.filter(f => fields.includes(f))]
    // Add first string field not already included
    for (const f of fields) {
      if (!sorted.includes(f) && entityDef.fields[f].type === 'string' && sorted.length < 4) {
        sorted.push(f)
      }
    }
    return sorted.length > 0 ? sorted : fields.slice(0, 4)
  }, [entityDef])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Fetch results
  const fetchResults = useCallback(async (searchOffset = 0, append = false) => {
    if (!targetEntity) return

    if (append) {
      setLoading(true)
    } else {
      setLoading(true)
      setOffset(0)
    }
    setError(null)

    try {
      const query = {
        [targetEntity]: {
          fields: displayFields,
          limit: LIMIT,
          offset: searchOffset,
        }
      }

      // Add search filter if query provided
      if (searchQuery.trim()) {
        const filters = {}
        const trimmed = searchQuery.trim()

        // If purely numeric, search by ID
        if (/^\d+$/.test(trimmed)) {
          filters['id__eq'] = parseInt(trimmed)
        } else {
          // Search by name or similar field
          const searchableFields = ['name', 'title', 'code', 'first_name', 'last_name']
          const searchField = searchableFields.find(f => entityDef?.fields?.[f])
          if (searchField) {
            filters[`${searchField}__icontains`] = trimmed
          }
        }

        if (Object.keys(filters).length > 0) {
          query[targetEntity].filters = filters
        }
      }

      const response = await fetch('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      })

      const data = await response.json()

      if (data.error || data.detail) {
        throw new Error(data.detail?.message || data.error || 'Query failed')
      }

      const rawResults = data.data?.items || data.data || []
      const newResults = Array.isArray(rawResults) ? rawResults : []
      setHasMore(newResults.length === LIMIT)

      if (append) {
        setResults(prev => [...(Array.isArray(prev) ? prev : []), ...newResults])
        setOffset(searchOffset)
      } else {
        setResults(newResults)
        setOffset(0)
      }
    } catch (err) {
      setError(err.message)
      if (!append) setResults([])
    } finally {
      setLoading(false)
    }
  }, [targetEntity, searchQuery, displayFields, entityDef, LIMIT])

  // Load initial results when modal opens
  useEffect(() => {
    if (isOpen && targetEntity) {
      setResults([])
      setOffset(0)
      setHasMore(true)
      setSearchQuery('')
      fetchResults(0, false)
    }
  }, [isOpen, targetEntity])

  // Search when query changes (debounced)
  useEffect(() => {
    if (!isOpen || !targetEntity || searchQuery === '') return

    const debounce = setTimeout(() => {
      fetchResults(0, false)
    }, 300)

    return () => clearTimeout(debounce)
  }, [searchQuery, isOpen, targetEntity])

  // Load more
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchResults(offset + LIMIT, true)
    }
  }

  if (!isOpen) return null

  // If no target entity, show error
  if (!targetEntity) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-gray-800 rounded-lg shadow-xl w-96 p-6" onClick={e => e.stopPropagation()}>
          <div className="text-center">
            <div className="text-red-400 mb-2">Cannot determine target entity</div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <span className="text-white font-medium">Select {targetEntity}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID or name..."
            className="w-full bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {loading && results.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">{error}</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No results found</div>
          ) : (
            <>
              {results.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onSelect(item.id); onClose() }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-700 border-b border-gray-700 last:border-0 flex items-center gap-3"
                >
                  <span className="text-blue-400 font-mono text-sm">#{item.id}</span>
                  <span className="text-gray-300 truncate">
                    {displayFields.filter(f => f !== 'id').map(f => item[f]).filter(Boolean).join(' • ')}
                  </span>
                </button>
              ))}

              {/* Load More */}
              {hasMore && (
                <div className="p-3 text-center border-t border-gray-700">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

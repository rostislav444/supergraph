import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import clsx from 'clsx'
import {
  selectGraph,
  selectEntities,
} from '../store/graphSlice'
import {
  setRootEntity,
  toggleField,
  selectAllFields,
  clearFields,
  toggleExpanded,
  setFilter,
  setPagination,
  selectRootEntity,
  selectSelectedFields,
  selectExpandedPaths,
  selectFilters,
  selectPagination,
} from '../store/builderSlice'
import { setQueryText, selectOperationMode, selectQueryText } from '../store/querySlice'

// Parse editor content to extract entity and fields
function parseEditorContent(text, operationMode) {
  try {
    const parsed = JSON.parse(text)

    // For mutations, look inside the operation wrapper
    if (operationMode !== 'query') {
      const operation = parsed[operationMode] || parsed.create || parsed.update || parsed.rewrite || parsed.delete
      if (operation) {
        const entityName = Object.keys(operation)[0]
        const entityData = operation[entityName] || {}
        return {
          entityName,
          dataFields: entityData.data ? Object.keys(entityData.data) : [],
          responseFields: entityData.response || [],
        }
      }
    }

    // For query mode, find root entity
    const knownKeys = ['action', 'query', 'create', 'update', 'delete', 'rewrite', 'transaction']
    const entityName = Object.keys(parsed).find(k => !knownKeys.includes(k) && k[0] === k[0].toUpperCase())

    if (entityName) {
      const entityData = parsed[entityName] || {}

      // Extract fields recursively
      const extractFields = (data, path = entityName) => {
        const result = { [path]: data.fields || [] }
        if (data.relations) {
          for (const [relName, relData] of Object.entries(data.relations)) {
            const relPath = `${path}.${relName}`
            Object.assign(result, extractFields(relData, relPath))
          }
        }
        return result
      }

      return {
        entityName,
        selectedFields: extractFields(entityData),
        filters: entityData.filters || {},
      }
    }

    return null
  } catch {
    return null
  }
}

// Icons
const ChevronIcon = ({ expanded }) => (
  <svg className={clsx('w-4 h-4 transition-transform text-gray-500', expanded && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const CheckIcon = ({ checked, small }) => (
  <div className={clsx(
    'rounded border flex items-center justify-center flex-shrink-0',
    small ? 'w-3.5 h-3.5 text-[10px]' : 'w-4 h-4 text-xs',
    checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-600'
  )}>
    {checked && '✓'}
  </div>
)

const TypeBadge = ({ type, enumValues, small }) => {
  const colors = {
    int: 'text-orange-400',
    string: 'text-green-400',
    bool: 'text-purple-400',
    datetime: 'text-cyan-400',
    date: 'text-cyan-300',
    json: 'text-yellow-400',
    enum: 'text-pink-400',
  }

  const sizeClass = small ? 'text-[10px]' : 'text-xs'

  if (type === 'enum' && enumValues?.length > 0) {
    const hint = enumValues.join(' | ')
    return (
      <span className={clsx(sizeClass, 'font-mono', colors.enum)} title={hint}>
        enum
      </span>
    )
  }

  return <span className={clsx(sizeClass, 'font-mono', colors[type] || 'text-gray-500')}>{type}</span>
}

// Truncated text with tooltip only when overflow
function TruncatedText({ text, className }) {
  const textRef = useRef(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const checkTruncation = useCallback(() => {
    if (textRef.current) {
      setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth)
    }
  }, [])

  useEffect(() => {
    checkTruncation()
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
  }, [checkTruncation, text])

  return (
    <div className="relative">
      <span
        ref={textRef}
        className={className}
        onMouseEnter={() => isTruncated && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {text}
      </span>
      {showTooltip && (
        <div className="absolute left-0 -top-6 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg border border-gray-600 whitespace-nowrap z-20 font-mono">
          {text}
        </div>
      )}
    </div>
  )
}

// Mode titles for header
const MODE_TITLES = {
  create: 'Create',
  update: 'Update',
  rewrite: 'Rewrite',
  delete: 'Delete',
  transaction: 'Transaction',
}

// Helper to get default value for field type
function getDefaultValue(field) {
  switch (field.type) {
    case 'string': return ''
    case 'int': return 0
    case 'bool': return false
    case 'datetime': return new Date().toISOString()
    case 'json': return {}
    case 'enum':
      // Return first enum value as default
      return field.enum_values?.[0] || ''
    default: return null
  }
}

// Generate test data based on field name and type
function generateTestData(fieldName, field) {
  const name = fieldName.toLowerCase()

  // Handle enums - pick random value
  if (field.type === 'enum' && field.enum_values?.length > 0) {
    return field.enum_values[Math.floor(Math.random() * field.enum_values.length)]
  }

  // Handle booleans
  if (field.type === 'bool') {
    return Math.random() > 0.5
  }

  // Handle datetime
  if (field.type === 'datetime' || name.includes('date') || name.includes('time')) {
    return new Date().toISOString()
  }

  // Handle integers - check for common patterns
  if (field.type === 'int') {
    if (name.includes('year')) return new Date().getFullYear()
    if (name.includes('age')) return Math.floor(Math.random() * 50) + 18
    if (name.includes('count') || name.includes('quantity')) return Math.floor(Math.random() * 100) + 1
    if (name.includes('price') || name.includes('cost') || name.includes('amount')) return Math.floor(Math.random() * 10000) + 100
    if (name.includes('level') || name.includes('priority')) return Math.floor(Math.random() * 5) + 1
    if (name.endsWith('_id')) return Math.floor(Math.random() * 100) + 1
    return Math.floor(Math.random() * 1000) + 1
  }

  // Handle strings - check for common patterns
  if (field.type === 'string') {
    // Names
    if (name === 'first_name' || name === 'firstname') {
      const names = ['John', 'Jane', 'Alex', 'Maria', 'Ivan', 'Anna', 'Peter', 'Olga']
      return names[Math.floor(Math.random() * names.length)]
    }
    if (name === 'last_name' || name === 'lastname' || name === 'surname') {
      const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis']
      return surnames[Math.floor(Math.random() * surnames.length)]
    }
    if (name === 'name' || name === 'title') {
      return `Test ${Math.floor(Math.random() * 1000)}`
    }
    if (name === 'full_name' || name === 'fullname') {
      return `John Smith ${Math.floor(Math.random() * 100)}`
    }

    // Contact info
    if (name.includes('email')) {
      return `test${Math.floor(Math.random() * 1000)}@example.com`
    }
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
      return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`
    }

    // Address
    if (name.includes('address') || name.includes('street')) {
      return `${Math.floor(Math.random() * 999) + 1} Main Street`
    }
    if (name.includes('city')) {
      const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'London', 'Paris', 'Berlin']
      return cities[Math.floor(Math.random() * cities.length)]
    }
    if (name.includes('country')) {
      const countries = ['USA', 'UK', 'Germany', 'France', 'Canada', 'Australia']
      return countries[Math.floor(Math.random() * countries.length)]
    }
    if (name.includes('zip') || name.includes('postal')) {
      return String(Math.floor(Math.random() * 90000) + 10000)
    }

    // URLs and IDs
    if (name.includes('url') || name.includes('link') || name.includes('website')) {
      return `https://example.com/${Math.floor(Math.random() * 1000)}`
    }
    if (name.includes('code') || name.includes('external_id') || name.includes('sku')) {
      return `CODE-${Math.floor(Math.random() * 10000)}`
    }

    // Descriptions
    if (name.includes('description') || name.includes('comment') || name.includes('note')) {
      return `Test description ${Math.floor(Math.random() * 1000)}`
    }

    // Path
    if (name.includes('path')) {
      return `/path/to/item/${Math.floor(Math.random() * 100)}`
    }

    // Default string
    return `Test ${fieldName} ${Math.floor(Math.random() * 100)}`
  }

  // Default fallback
  return getDefaultValue(field)
}

// Check if field is required (not nullable and no default)
function isFieldRequired(field, fieldName) {
  // id is auto-generated, never required for create
  if (fieldName === 'id') return false
  // If explicitly marked as required
  if (field.required) return true
  // If not nullable (common pattern)
  if (field.nullable === false) return true
  return false
}

// Infer target entity name from FK field name
// e.g., property_type_id -> PropertyType, parent_id -> (same entity), address_id -> GeoObject
function inferTargetEntity(fieldName, currentEntity, allEntities) {
  if (!fieldName.endsWith('_id')) return null

  // Remove _id suffix and convert to PascalCase
  const baseName = fieldName.slice(0, -3) // remove '_id'

  // Handle special cases
  if (baseName === 'parent') return currentEntity // self-reference

  // Convert snake_case to PascalCase
  const pascalCase = baseName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

  // Check if entity exists
  if (allEntities.includes(pascalCase)) return pascalCase

  // Try common variations
  const variations = [
    pascalCase,
    pascalCase + 's', // plural
    pascalCase.slice(0, -1), // singular from plural
  ]

  for (const variant of variations) {
    if (allEntities.includes(variant)) return variant
  }

  // Special mappings
  const specialMappings = {
    'address': 'GeoObject',
    'geo_object': 'GeoObject',
    'owner': 'Person',
    'user': 'User',
    'created_by': 'User',
    'updated_by': 'User',
  }

  if (specialMappings[baseName]) {
    const mapped = specialMappings[baseName]
    if (allEntities.includes(mapped)) return mapped
  }

  return null
}

// Entity Lookup Modal Component
function EntityLookupModal({ isOpen, onClose, onSelect, targetEntity, graph }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
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

  // Fetch function
  const fetchResults = useCallback(async (searchOffset = 0, append = false) => {
    if (!targetEntity) return

    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setOffset(0)
    }
    setError(null)

    try {
      // Build query
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
          // Otherwise search by name or similar field
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

      // Response format: {"data": {"items": [...], "pagination": {...}}}
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
      setLoadingMore(false)
    }
  }, [targetEntity, searchQuery, displayFields, entityDef, LIMIT])

  // Load initial results when modal opens
  useEffect(() => {
    if (isOpen && targetEntity) {
      setResults([])
      setOffset(0)
      setHasMore(true)
      setSearchQuery('')
      // Trigger initial fetch
      const initialFetch = async () => {
        setLoading(true)
        setError(null)
        try {
          const query = {
            [targetEntity]: {
              fields: displayFields,
              limit: LIMIT,
              offset: 0,
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
          // Response format: {"data": {"items": [...], "pagination": {...}}}
          const rawResults = data.data?.items || data.data || []
          const newResults = Array.isArray(rawResults) ? rawResults : []
          setHasMore(newResults.length === LIMIT)
          setResults(newResults)
        } catch (err) {
          setError(err.message)
          setResults([])
        } finally {
          setLoading(false)
        }
      }
      initialFetch()
    }
  }, [isOpen, targetEntity, displayFields])

  // Search when query changes (debounced)
  useEffect(() => {
    if (!isOpen || !targetEntity || searchQuery === '') return

    const debounce = setTimeout(() => {
      fetchResults(0, false)
    }, 300)

    return () => clearTimeout(debounce)
  }, [searchQuery, isOpen, targetEntity, fetchResults])

  // Load more function
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchResults(offset + LIMIT, true)
    }
  }

  if (!isOpen) return null

  // Get display value for a result
  const getDisplayValue = (item) => {
    const parts = []
    for (const field of displayFields) {
      if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
        parts.push(String(item[field]))
      }
    }
    return parts.join(' • ') || `ID: ${item.id}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl border border-gray-600 w-full max-w-lg mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Select {targetEntity}</h3>
            <p className="text-xs text-gray-400">Search and select a record</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${targetEntity}...`}
            className="w-full bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-auto">
          {loading && (
            <div className="p-4 text-center text-gray-400">
              <div className="inline-block animate-spin w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full" />
            </div>
          )}

          {error && (
            <div className="p-4 text-center text-red-400 text-sm">{error}</div>
          )}

          {!loading && !error && Array.isArray(results) && results.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              {searchQuery ? 'No results found' : 'No records found'}
            </div>
          )}

          {!loading && Array.isArray(results) && results.map((item) => (
            <div
              key={item.id}
              onClick={() => { onSelect(item.id); onClose() }}
              className="px-4 py-2 hover:bg-gray-700 cursor-pointer border-b border-gray-700/50 last:border-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">{getDisplayValue(item)}</span>
                <span className="text-xs text-gray-500 font-mono">#{item.id}</span>
              </div>
            </div>
          ))}

          {/* Load more button */}
          {!loading && hasMore && Array.isArray(results) && results.length > 0 && (
            <div className="p-2 border-t border-gray-700/50">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
                    Loading...
                  </span>
                ) : (
                  `Load more (showing ${results.length})`
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {Array.isArray(results) && results.length > 0 ? `${results.length} loaded` : ''}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// Generate mutation template for entity
function generateMutationTemplate(entityName, entity, operationMode) {
  const fields = entity?.fields || {}
  const fieldEntries = Object.entries(fields)

  // Get required fields (excluding id for create)
  const requiredFields = fieldEntries.filter(([name, field]) => {
    if (name === 'id') return false // id is auto-generated
    return isFieldRequired(field, name)
  })

  // Get sample fields for response (first 5 including id)
  const responseFields = ['id', ...fieldEntries.slice(0, 4).map(([n]) => n).filter(n => n !== 'id')]

  if (operationMode === 'create') {
    const data = {}
    // Always add required fields
    requiredFields.forEach(([name, field]) => {
      data[name] = getDefaultValue(field)
    })
    // If no required fields, add a few sample fields
    if (Object.keys(data).length === 0) {
      fieldEntries.slice(0, 3).forEach(([name, field]) => {
        if (name !== 'id') data[name] = getDefaultValue(field)
      })
    }
    return {
      create: {
        [entityName]: {
          data,
          response: responseFields
        }
      }
    }
  }

  if (operationMode === 'update') {
    const data = {}
    // Add 1-2 sample fields
    fieldEntries.slice(0, 2).forEach(([name, field]) => {
      if (name !== 'id') data[name] = getDefaultValue(field)
    })
    return {
      update: {
        [entityName]: {
          id: 1,
          data,
          response: responseFields
        }
      }
    }
  }

  if (operationMode === 'rewrite') {
    const data = {}
    // Add all non-id fields (or first 5)
    fieldEntries.slice(0, 5).forEach(([name, field]) => {
      if (name !== 'id') data[name] = getDefaultValue(field)
    })
    return {
      rewrite: {
        [entityName]: {
          id: 1,
          data,
          response: responseFields
        }
      }
    }
  }

  if (operationMode === 'delete') {
    return {
      delete: {
        [entityName]: {
          id: 1
        }
      }
    }
  }

  return null
}

// Entity list view with letter grouping
function EntityList({ entities, onSelect, activeEntity }) {
  const containerRef = useRef(null)
  const entityRefs = useRef({})
  const scrolledToRef = useRef(null)

  // Group entities by first letter
  const grouped = useMemo(() => {
    const groups = {}
    entities.forEach(([name, entity]) => {
      const letter = name[0].toUpperCase()
      if (!groups[letter]) groups[letter] = []
      groups[letter].push([name, entity])
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [entities])

  // Scroll to active entity on mount and when it changes
  useEffect(() => {
    if (!activeEntity) return
    // Don't scroll again if we already scrolled to this entity
    if (scrolledToRef.current === activeEntity) return

    const scrollToEntity = () => {
      const element = entityRefs.current[activeEntity]
      const container = containerRef.current

      if (element && container) {
        const elementRect = element.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()

        // Check if element is outside visible area
        if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        scrolledToRef.current = activeEntity
      }
    }

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      scrollToEntity()
    })
  }, [activeEntity, entities])

  return (
    <div className="flex-1 overflow-auto" ref={containerRef}>
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Entities</span>
        <span className="text-xs text-gray-600 ml-2">({entities.length})</span>
      </div>
      <div className="py-1">
        {grouped.map(([letter, items]) => (
          <div key={letter}>
            {/* Letter group header */}
            <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
              <div className="w-7 h-7 rounded bg-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
                {letter}
              </div>
              <div className="flex-1 h-px bg-gray-700"></div>
              <span className="text-xs text-gray-600">{items.length}</span>
            </div>
            {/* Entities in this group */}
            {items.map(([name, entity]) => {
              const fieldsCount = Object.keys(entity.fields || {}).length
              const relCount = Object.keys(entity.relations || {}).length
              const isActive = name === activeEntity
              return (
                <div
                  key={name}
                  ref={el => entityRefs.current[name] = el}
                  onClick={() => onSelect(name)}
                  className={clsx(
                    "flex items-center gap-2 pl-12 pr-3 py-2 cursor-pointer transition-colors",
                    isActive
                      ? "bg-blue-600/20 border-l-2 border-blue-500"
                      : "hover:bg-gray-800 border-l-2 border-transparent"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className={clsx(
                      "text-sm font-medium truncate",
                      isActive ? "text-blue-400" : "text-white"
                    )}>{name}</div>
                    <div className="text-xs text-gray-500">{fieldsCount} fields{relCount > 0 && ` · ${relCount} rel`}</div>
                  </div>
                  <ChevronIcon />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Field item (for query mode and response fields)
function FieldItem({ name, field, path, selected, onToggle, required, disabled }) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 py-1 px-2 rounded relative",
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-gray-800/50",
        required && "pl-4" // Extra padding for required indicator
      )}
      onClick={() => !disabled && onToggle(path, name)}
    >
      {/* Required indicator - vertical bar */}
      {required && (
        <div className="absolute left-0 top-1 bottom-1 w-1 bg-red-500 rounded-r" />
      )}
      <CheckIcon checked={selected} />
      <span className={clsx(
        "text-sm font-mono flex-1 truncate",
        required ? "text-red-300" : "text-gray-200"
      )}>
        {name}
      </span>
      <TypeBadge type={field.type} enumValues={field.enum_values} />
      {required && (
        <span className="text-[10px] text-red-400/70 uppercase tracking-wider">req</span>
      )}
    </div>
  )
}

// Data field item with value editing (for create/update mode)
function DataFieldItem({ name, field, selected, value, onToggle, onValueChange, required, disabled }) {
  const isEnum = field.type === 'enum' && field.enum_values?.length > 0

  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 h-7 px-1.5 rounded relative",
        required && "pl-3"
      )}
    >
      {/* Required indicator - vertical bar */}
      {required && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-red-500 rounded-r" />
      )}

      {/* Checkbox */}
      <div
        className={clsx(
          "flex-shrink-0",
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        )}
        onClick={() => !disabled && onToggle()}
      >
        <CheckIcon checked={selected} small />
      </div>

      {/* Field name */}
      <span className={clsx(
        "text-[11px] font-mono w-24 truncate flex-shrink-0",
        required ? "text-red-300" : "text-gray-300"
      )}>
        {name}
      </span>

      {/* Value input - always takes space */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <>
            {isEnum ? (
              <select
                value={value || ''}
                onChange={(e) => onValueChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-pink-500 focus:outline-none"
              >
                <option value="" disabled>Select...</option>
                {field.enum_values.map((enumVal) => (
                  <option key={enumVal} value={enumVal}>{enumVal}</option>
                ))}
              </select>
            ) : field.type === 'bool' ? (
              <select
                value={value === true ? 'true' : value === false ? 'false' : ''}
                onChange={(e) => onValueChange(e.target.value === 'true')}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : field.type === 'date' ? (
              <input
                type="date"
                value={value ? (typeof value === 'string' ? value.slice(0, 10) : '') : ''}
                onChange={(e) => onValueChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-blue-500 focus:outline-none"
              />
            ) : field.type === 'datetime' ? (
              <input
                type="datetime-local"
                value={value ? (typeof value === 'string' ? value.slice(0, 16) : '') : ''}
                onChange={(e) => onValueChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <input
                type={field.type === 'int' ? 'number' : 'text'}
                value={value ?? ''}
                onChange={(e) => {
                  const val = field.type === 'int' ? parseInt(e.target.value) || 0 : e.target.value
                  onValueChange(val)
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="..."
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            )}
          </>
        ) : (
          <div className="h-5" />
        )}
      </div>

      {/* Type badge - always visible as separate column */}
      <div className="w-12 flex-shrink-0 text-right">
        <TypeBadge type={field.type} enumValues={field.enum_values} small />
      </div>
    </div>
  )
}

// Required badge
const RequiredBadge = () => (
  <span className="text-xs text-red-400 ml-1">*required</span>
)

// Create mode field builder
function CreateModeBuilder({ entityName, entity, graph, queryText, onUpdateQuery }) {
  const fields = useMemo(() => Object.entries(entity?.fields || {}), [entity])

  // Separate fields into required and optional
  const { requiredFields, optionalFields } = useMemo(() => {
    const required = []
    const optional = []
    fields.forEach(([name, field]) => {
      if (name === 'id') return // Skip id for create
      if (isFieldRequired(field, name)) {
        required.push([name, field])
      } else {
        optional.push([name, field])
      }
    })
    return { requiredFields: required, optionalFields: optional }
  }, [fields])

  // Parse current query to get selected fields and their values
  const currentState = useMemo(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName]
      if (createOp) {
        const dataFields = createOp.data ? Object.keys(createOp.data) : []
        const dataValues = createOp.data || {}
        // Add required fields that might be missing
        requiredFields.forEach(([name]) => {
          if (!dataFields.includes(name)) {
            dataFields.push(name)
          }
        })
        return {
          dataFields,
          dataValues,
          responseFields: createOp.response || [],
        }
      }
    } catch {}
    return {
      dataFields: requiredFields.map(([name]) => name),
      dataValues: {},
      responseFields: []
    }
  }, [queryText, entityName, requiredFields])

  // Ensure required fields are in data
  const ensureRequiredFields = useCallback((data) => {
    const newData = { ...data }
    requiredFields.forEach(([name, field]) => {
      if (newData[name] === undefined) {
        newData[name] = getDefaultValue(field)
      }
    })
    return newData
  }, [requiredFields])

  // Toggle data field
  const handleToggleDataField = useCallback((fieldName, field) => {
    if (isFieldRequired(field, fieldName)) return

    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      if (createOp.data[fieldName] !== undefined) {
        delete createOp.data[fieldName]
      } else {
        createOp.data[fieldName] = getDefaultValue(field)
      }

      createOp.data = ensureRequiredFields(createOp.data)

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {}
  }, [queryText, entityName, onUpdateQuery, ensureRequiredFields])

  // Update field value
  const handleValueChange = useCallback((fieldName, value) => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      createOp.data[fieldName] = value
      createOp.data = ensureRequiredFields(createOp.data)

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {}
  }, [queryText, entityName, onUpdateQuery, ensureRequiredFields])

  // Toggle response field
  const handleToggleResponseField = useCallback((fieldName) => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      const response = createOp.response || []
      const idx = response.indexOf(fieldName)
      if (idx >= 0) {
        response.splice(idx, 1)
      } else {
        response.push(fieldName)
      }
      createOp.response = response

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {}
  }, [queryText, entityName, onUpdateQuery])

  // Select all optional data fields
  const handleSelectAllData = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      optionalFields.forEach(([name, field]) => {
        if (createOp.data[name] === undefined) {
          createOp.data[name] = getDefaultValue(field)
        }
      })

      createOp.data = ensureRequiredFields(createOp.data)

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {}
  }, [queryText, entityName, optionalFields, onUpdateQuery, ensureRequiredFields])

  // Clear optional data fields (keep required)
  const handleClearData = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      const newData = {}
      requiredFields.forEach(([name, field]) => {
        newData[name] = createOp.data?.[name] !== undefined ? createOp.data[name] : getDefaultValue(field)
      })
      createOp.data = newData

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {}
  }, [queryText, entityName, requiredFields, onUpdateQuery])

  // Select all response fields
  const handleSelectAllResponse = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      createOp.response = fields.map(([name]) => name)

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {}
  }, [queryText, entityName, fields, onUpdateQuery])

  // Clear response fields
  const handleClearResponse = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      createOp.response = []

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {}
  }, [queryText, entityName, onUpdateQuery])

  // All data fields (required first, then optional)
  const allDataFields = useMemo(() => [...requiredFields, ...optionalFields], [requiredFields, optionalFields])

  return (
    <div className="flex-1 overflow-auto p-2">
      {/* Request Body Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1 px-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase">Request Body (data)</span>
            {requiredFields.length > 0 && (
              <span className="text-[10px] text-red-400/60">
                <span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1"></span>
                = required
              </span>
            )}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={handleSelectAllData} className="text-blue-400 hover:text-blue-300">all</button>
            <span className="text-gray-600">·</span>
            <button onClick={handleClearData} className="text-gray-500 hover:text-gray-300">clear</button>
          </div>
        </div>

        {allDataFields.map(([name, field]) => {
          const isRequired = isFieldRequired(field, name)
          return (
            <DataFieldItem
              key={name}
              name={name}
              field={field}
              selected={currentState.dataFields.includes(name)}
              value={currentState.dataValues[name]}
              onToggle={() => handleToggleDataField(name, field)}
              onValueChange={(val) => handleValueChange(name, val)}
              required={isRequired}
              disabled={isRequired}
            />
          )
        })}
      </div>

      {/* Response Fields Section */}
      <div>
        <div className="flex items-center justify-between mb-1 px-2">
          <span className="text-xs text-gray-500 uppercase">Response Fields</span>
          <div className="flex gap-2 text-xs">
            <button onClick={handleSelectAllResponse} className="text-blue-400 hover:text-blue-300">all</button>
            <span className="text-gray-600">·</span>
            <button onClick={handleClearResponse} className="text-gray-500 hover:text-gray-300">clear</button>
          </div>
        </div>

        {fields.map(([name, field]) => (
          <FieldItem
            key={name}
            name={name}
            field={field}
            path="response"
            selected={currentState.responseFields.includes(name)}
            onToggle={() => handleToggleResponseField(name)}
            required={false}
            disabled={false}
          />
        ))}
      </div>
    </div>
  )
}

// Relation item
function RelationItem({
  name, relation, path, graph, selectedFields, expandedPaths, filters, pagination,
  onToggleExpand, onToggleField, onSelectAll, onClearFields, onSetFilter, onSetPagination,
}) {
  const relationPath = `${path}.${name}`
  const isExpanded = expandedPaths[relationPath]
  const targetEntity = graph.entities[relation.target]
  const targetFields = targetEntity ? Object.entries(targetEntity.fields || {}) : []
  const selectedCount = (selectedFields[relationPath] || []).length

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded cursor-pointer',
          selectedCount > 0 && 'bg-blue-900/20'
        )}
        onClick={() => onToggleExpand(relationPath)}
      >
        <ChevronIcon expanded={isExpanded} />
        <span className="text-sm text-blue-400 font-mono flex-1 truncate">{name}</span>
        <span className={clsx(
          'text-xs px-1.5 rounded',
          relation.cardinality === 'one' ? 'bg-purple-900/50 text-purple-300' : 'bg-green-900/50 text-green-300'
        )}>
          {relation.cardinality}
        </span>
        {selectedCount > 0 && (
          <span className="text-xs bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center">
            {selectedCount}
          </span>
        )}
      </div>

      {isExpanded && targetEntity && (
        <div className="ml-3 py-1">
          <div className="flex gap-2 mb-1 px-2 text-xs">
            <button onClick={() => onSelectAll(relationPath, targetFields.map(([n]) => n))} className="text-blue-400 hover:text-blue-300">all</button>
            <span className="text-gray-600">·</span>
            <button onClick={() => onClearFields(relationPath)} className="text-gray-500 hover:text-gray-300">clear</button>
          </div>
          {targetFields.map(([fieldName, field]) => (
            <FieldItem
              key={fieldName}
              name={fieldName}
              field={field}
              path={relationPath}
              selected={(selectedFields[relationPath] || []).includes(fieldName)}
              onToggle={onToggleField}
            />
          ))}
          <FilterSection path={relationPath} fields={targetFields} filters={filters[relationPath] || {}} onSetFilter={onSetFilter} />
          <PaginationSection path={relationPath} pagination={pagination[relationPath]} onSetPagination={onSetPagination} />
          {targetEntity.relations && Object.entries(targetEntity.relations).map(([relName, rel]) => (
            <RelationItem
              key={relName}
              name={relName}
              relation={rel}
              path={relationPath}
              graph={graph}
              selectedFields={selectedFields}
              expandedPaths={expandedPaths}
              filters={filters}
              pagination={pagination}
              onToggleExpand={onToggleExpand}
              onToggleField={onToggleField}
              onSelectAll={onSelectAll}
              onClearFields={onClearFields}
              onSetFilter={onSetFilter}
              onSetPagination={onSetPagination}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Filter section
function FilterSection({ path, fields, filters, onSetFilter }) {
  const [showFilters, setShowFilters] = useState(false)
  const activeCount = Object.keys(filters).length

  return (
    <div className="mt-1 px-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setShowFilters(!showFilters) }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters{activeCount > 0 && ` (${activeCount})`}
      </button>
      {showFilters && (
        <div className="mt-1 space-y-1 bg-gray-800/50 p-2 rounded max-h-64 overflow-y-auto">
          {fields.map(([fieldName, field]) => (
            <div key={fieldName} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-20 truncate font-mono">{fieldName}</span>
              <input
                type="text"
                value={filters[`${fieldName}__eq`] || ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onSetFilter({ path, field: fieldName, op: 'eq', value: e.target.value })}
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

// Pagination section
function PaginationSection({ path, pagination, onSetPagination }) {
  const [showPagination, setShowPagination] = useState(false)
  const limit = pagination?.limit || ''
  const offset = pagination?.offset || ''
  const hasSettings = limit || offset

  return (
    <div className="mt-1 px-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setShowPagination(!showPagination) }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
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
              onChange={(e) => onSetPagination({
                path,
                limit: e.target.value ? parseInt(e.target.value) : null,
                offset: offset || null
              })}
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
              onChange={(e) => onSetPagination({
                path,
                limit: limit || null,
                offset: e.target.value ? parseInt(e.target.value) : null
              })}
              placeholder="0"
              className="flex-1 bg-gray-700 text-xs px-2 py-1 rounded border-none text-white placeholder-gray-500 min-w-0 w-16"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Transaction step operations
const STEP_OPERATIONS = [
  { id: 'create', label: 'Create', color: 'green' },
  { id: 'update', label: 'Update', color: 'yellow' },
  { id: 'delete', label: 'Delete', color: 'red' },
  { id: 'get_or_create', label: 'Get or Create', color: 'cyan' },
]

// Entity color palette for transaction steps
const ENTITY_COLORS = [
  { bg: 'bg-blue-600/20', border: 'border-blue-500', text: 'text-blue-400', header: 'bg-blue-600/40' },
  { bg: 'bg-purple-600/20', border: 'border-purple-500', text: 'text-purple-400', header: 'bg-purple-600/40' },
  { bg: 'bg-pink-600/20', border: 'border-pink-500', text: 'text-pink-400', header: 'bg-pink-600/40' },
  { bg: 'bg-indigo-600/20', border: 'border-indigo-500', text: 'text-indigo-400', header: 'bg-indigo-600/40' },
  { bg: 'bg-teal-600/20', border: 'border-teal-500', text: 'text-teal-400', header: 'bg-teal-600/40' },
  { bg: 'bg-orange-600/20', border: 'border-orange-500', text: 'text-orange-400', header: 'bg-orange-600/40' },
  { bg: 'bg-emerald-600/20', border: 'border-emerald-500', text: 'text-emerald-400', header: 'bg-emerald-600/40' },
  { bg: 'bg-rose-600/20', border: 'border-rose-500', text: 'text-rose-400', header: 'bg-rose-600/40' },
]

// Operation badge colors
const OP_BADGE_COLORS = {
  create: 'bg-green-600 text-white',
  update: 'bg-yellow-600 text-white',
  delete: 'bg-red-600 text-white',
  get_or_create: 'bg-cyan-600 text-white',
}

// Single transaction step card with field editing
function TransactionStepCard({
  step,
  index,
  entityDef,
  entityColor,
  entityNumber,
  variables,
  onUpdate,
  onRemove,
  graph,
  allEntityNames
}) {
  const [expanded, setExpanded] = useState(true)
  const [showResponse, setShowResponse] = useState(false)
  const [lookupField, setLookupField] = useState(null) // Field currently being looked up

  const info = useMemo(() => {
    const operation = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
    if (!operation) return null
    const entityData = step[operation]
    const entityName = Object.keys(entityData)[0]
    return {
      operation,
      entityName,
      alias: step.as || null,
      stepData: entityData[entityName]
    }
  }, [step])

  if (!info || !entityDef) return null

  const fields = Object.entries(entityDef.fields || {})
  const rawDataFields = info.stepData?.data || {}
  const responseFields = info.stepData?.response || []
  const isDeleteOp = info.operation === 'delete'

  // Ensure required fields are always in dataFields
  const dataFields = useMemo(() => {
    if (isDeleteOp) return rawDataFields
    const result = { ...rawDataFields }
    fields.forEach(([fieldName, field]) => {
      if (fieldName !== 'id' && isFieldRequired(field, fieldName) && result[fieldName] === undefined) {
        result[fieldName] = getDefaultValue(field)
      }
    })
    return result
  }, [rawDataFields, fields, isDeleteOp])

  // Toggle data field (but required fields cannot be unchecked)
  const handleToggleDataField = (fieldName, field) => {
    // Prevent unchecking required fields
    if (isFieldRequired(field, fieldName) && dataFields[fieldName] !== undefined) {
      return // Cannot uncheck required field
    }

    const newData = { ...dataFields }
    if (newData[fieldName] !== undefined) {
      delete newData[fieldName]
    } else {
      newData[fieldName] = getDefaultValue(field)
    }
    updateStepData({ data: newData })
  }

  // Update field value
  const handleValueChange = (fieldName, value) => {
    const newData = { ...dataFields, [fieldName]: value }
    updateStepData({ data: newData })
  }

  // Toggle response field
  const handleToggleResponseField = (fieldName) => {
    const newResponse = [...responseFields]
    const idx = newResponse.indexOf(fieldName)
    if (idx >= 0) {
      newResponse.splice(idx, 1)
    } else {
      newResponse.push(fieldName)
    }
    updateStepData({ response: newResponse })
  }

  // Update step data helper
  const updateStepData = (updates) => {
    const newStepData = { ...info.stepData, ...updates }

    // Ensure required fields are always in data (except for delete operation)
    if (info.operation !== 'delete' && newStepData.data) {
      fields.forEach(([fieldName, field]) => {
        if (fieldName !== 'id' && isFieldRequired(field, fieldName) && newStepData.data[fieldName] === undefined) {
          newStepData.data[fieldName] = getDefaultValue(field)
        }
      })
    }

    onUpdate({
      [info.operation]: {
        [info.entityName]: newStepData
      },
      as: step.as
    })
  }

  // Change operation type
  const handleChangeOperation = (newOp) => {
    let newStepData
    if (newOp === 'delete') {
      newStepData = { id: info.stepData.id || 1 }
    } else {
      // Ensure required fields are present
      const ensuredData = { ...info.stepData.data }
      fields.forEach(([fieldName, field]) => {
        if (fieldName !== 'id' && isFieldRequired(field, fieldName) && ensuredData[fieldName] === undefined) {
          ensuredData[fieldName] = getDefaultValue(field)
        }
      })
      newStepData = { ...info.stepData, data: ensuredData }
    }
    onUpdate({
      [newOp]: {
        [info.entityName]: newStepData
      },
      as: step.as
    })
  }

  // Update ID field
  const handleIdChange = (value) => {
    updateStepData({ id: parseInt(value) || 1 })
  }

  return (
    <div className={clsx(
      "mb-3 rounded-lg border overflow-hidden",
      entityColor.bg, entityColor.border
    )}>
      {/* Header - Entity name + alias */}
      <div className={clsx(
        "px-3 py-2 flex items-center justify-between",
        entityColor.header
      )}>
        <div className="flex items-center gap-2">
          <span className={clsx("text-sm font-bold", entityColor.text)}>
            {info.entityName}
          </span>
          <span className="text-xs text-purple-300 font-mono bg-purple-900/50 px-1.5 py-0.5 rounded">
            ${info.entityName.toLowerCase()}{entityNumber}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-800/50 rounded text-gray-400 hover:text-white"
          >
            <ChevronIcon expanded={expanded} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Operation selector */}
      <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
        <span className="text-xs text-gray-500">Action:</span>
        <div className="flex gap-1">
          {STEP_OPERATIONS.map(op => (
            <button
              key={op.id}
              onClick={() => handleChangeOperation(op.id)}
              className={clsx(
                "text-xs px-2 py-1 rounded transition-colors",
                info.operation === op.id
                  ? OP_BADGE_COLORS[op.id]
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              )}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 py-2">
          {/* ID field for update/delete */}
          {(info.operation === 'update' || info.operation === 'delete') && (
            <div className="mb-3">
              <div className="text-xs text-gray-500 uppercase mb-1">Target ID</div>
              <input
                type="number"
                value={info.stepData?.id || ''}
                onChange={(e) => handleIdChange(e.target.value)}
                placeholder="Record ID"
                className="w-full bg-gray-700 text-xs h-6 px-2 rounded border border-gray-600 text-white"
              />
            </div>
          )}

          {/* Data fields (not for delete) */}
          {!isDeleteOp && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 uppercase">Data</span>
                <div className="flex gap-2 text-[10px]">
                  <button
                    onClick={() => {
                      // Fill selected fields with test data
                      const testData = {}
                      Object.entries(dataFields).forEach(([name, _]) => {
                        const field = fields.find(([n]) => n === name)?.[1]
                        if (field) {
                          testData[name] = generateTestData(name, field)
                        }
                      })
                      updateStepData({ data: testData })
                    }}
                    className="text-green-400 hover:text-green-300"
                    title="Fill selected fields with test data"
                  >test</button>
                  <button
                    onClick={() => {
                      const allData = {}
                      fields.forEach(([name, field]) => {
                        if (name !== 'id') allData[name] = getDefaultValue(field)
                      })
                      updateStepData({ data: allData })
                    }}
                    className="text-blue-400 hover:text-blue-300"
                  >all</button>
                  <button
                    onClick={() => {
                      // Keep only required fields when clearing
                      const requiredData = {}
                      fields.forEach(([name, field]) => {
                        if (name !== 'id' && isFieldRequired(field, name)) {
                          requiredData[name] = dataFields[name] !== undefined ? dataFields[name] : getDefaultValue(field)
                        }
                      })
                      updateStepData({ data: requiredData })
                    }}
                    className="text-gray-500 hover:text-gray-300"
                  >clear</button>
                </div>
              </div>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {fields
                  .filter(([name]) => name !== 'id')
                  .sort(([nameA, fieldA], [nameB, fieldB]) => {
                    const aRequired = isFieldRequired(fieldA, nameA)
                    const bRequired = isFieldRequired(fieldB, nameB)
                    // Required fields first
                    if (aRequired && !bRequired) return -1
                    if (!aRequired && bRequired) return 1
                    // Then alphabetically within each group
                    return nameA.localeCompare(nameB)
                  })
                  .map(([name, field]) => {
                  const isEnum = field.type === 'enum' && field.enum_values?.length > 0
                  const selected = dataFields[name] !== undefined
                  const value = dataFields[name]
                  const isRequired = isFieldRequired(field, name)

                  // Check if this is a reference field (ends with _id)
                  const isRefField = name.endsWith('_id')

                  // Check if required field has empty value
                  const isEmptyRequired = isRequired && selected && (
                    value === '' || value === null || value === undefined ||
                    (field.type === 'string' && typeof value === 'string' && value.trim() === '') ||
                    (field.type === 'int' && isRefField && (value === 0 || value === '0')) // 0 is not a valid FK
                  )

                  return (
                    <div key={name} className={clsx(
                      "grid h-6 px-1 rounded items-center gap-1",
                      isEmptyRequired ? "bg-red-900/30" : isRequired ? "bg-amber-900/20" : "bg-gray-800/30"
                    )} style={{ gridTemplateColumns: '16px 2fr 1fr' }}>
                      <div
                        className={clsx(
                          isRequired && selected ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                        )}
                        onClick={() => handleToggleDataField(name, field)}
                        title={isRequired ? "Required field (cannot be unchecked)" : undefined}
                      >
                        <CheckIcon checked={selected} small />
                      </div>
                      <div className="min-w-0 overflow-hidden flex items-center gap-0.5">
                        <TruncatedText
                          text={name}
                          className={clsx(
                            "text-[10px] font-mono truncate block",
                            isEmptyRequired ? "text-red-400" : isRequired ? "text-amber-300" : "text-gray-300"
                          )}
                        />
                        {isRequired && <span className={clsx("text-[10px]", isEmptyRequired ? "text-red-500" : "text-amber-500")}>*</span>}
                      </div>
                      <div className="min-w-0 flex items-center gap-0.5">
                        {selected ? (
                          isRefField ? (
                            <>
                              {variables.length > 0 ? (
                                <select
                                  value={typeof value === 'string' && value.startsWith('$') ? value : ''}
                                  onChange={(e) => handleValueChange(name, e.target.value || parseInt(value) || 0)}
                                  className={clsx(
                                    "flex-1 bg-gray-700 text-[10px] h-5 px-1 rounded border text-purple-300 min-w-0",
                                    isEmptyRequired ? "border-red-500" : "border-gray-600"
                                  )}
                                >
                                  <option value="">Manual ID...</option>
                                  {variables.map(v => (
                                    <option key={v} value={`${v}.id`}>{v}.id</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="number"
                                  value={typeof value === 'string' && value.startsWith('$') ? '' : (value ?? '')}
                                  onChange={(e) => handleValueChange(name, parseInt(e.target.value) || 0)}
                                  placeholder={isRequired ? "Required..." : "ID..."}
                                  className={clsx(
                                    "flex-1 bg-gray-700 text-[10px] h-5 px-1 rounded border text-white placeholder-gray-500 min-w-0",
                                    isEmptyRequired ? "border-red-500 placeholder-red-400" : "border-gray-600"
                                  )}
                                />
                              )}
                              {/* Lookup button for FK fields */}
                              {inferTargetEntity(name, info.entityName, allEntityNames) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setLookupField(name) }}
                                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gray-600 hover:bg-blue-600 rounded text-gray-300 hover:text-white transition-colors"
                                  title={`Search ${inferTargetEntity(name, info.entityName, allEntityNames)}`}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                  </svg>
                                </button>
                              )}
                            </>
                          ) : isEnum ? (
                            <select
                              value={value || ''}
                              onChange={(e) => handleValueChange(name, e.target.value)}
                              className={clsx(
                                "w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white",
                                isEmptyRequired ? "border-red-500" : "border-gray-600"
                              )}
                            >
                              <option value="" disabled>Select...</option>
                              {field.enum_values.map(v => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          ) : field.type === 'bool' ? (
                            <select
                              value={value === true ? 'true' : 'false'}
                              onChange={(e) => handleValueChange(name, e.target.value === 'true')}
                              className="w-full bg-gray-700 text-[10px] h-5 px-1 rounded border border-gray-600 text-white"
                            >
                              <option value="false">false</option>
                              <option value="true">true</option>
                            </select>
                          ) : field.type === 'date' ? (
                            <input
                              type="date"
                              value={value ? (typeof value === 'string' ? value.slice(0, 10) : '') : ''}
                              onChange={(e) => handleValueChange(name, e.target.value)}
                              className={clsx(
                                "w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white",
                                isEmptyRequired ? "border-red-500" : "border-gray-600"
                              )}
                            />
                          ) : field.type === 'datetime' ? (
                            <input
                              type="datetime-local"
                              value={value ? (typeof value === 'string' ? value.slice(0, 16) : '') : ''}
                              onChange={(e) => handleValueChange(name, e.target.value ? new Date(e.target.value).toISOString() : '')}
                              className={clsx(
                                "w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white",
                                isEmptyRequired ? "border-red-500" : "border-gray-600"
                              )}
                            />
                          ) : (
                            <input
                              type={field.type === 'int' ? 'number' : 'text'}
                              value={value ?? ''}
                              onChange={(e) => handleValueChange(name, field.type === 'int' ? parseInt(e.target.value) || 0 : e.target.value)}
                              placeholder={isRequired ? "Required..." : "..."}
                              className={clsx(
                                "w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white placeholder-gray-500",
                                isEmptyRequired ? "border-red-500 placeholder-red-400" : "border-gray-600"
                              )}
                            />
                          )
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Response fields (collapsible, hidden by default) */}
          {!isDeleteOp && (
            <div className="border-t border-gray-700/50 pt-2 mt-2">
              <button
                onClick={() => setShowResponse(!showResponse)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 w-full"
              >
                <ChevronIcon expanded={showResponse} />
                <span className="uppercase">Response</span>
                <span className="text-[10px] text-gray-600">({responseFields.length} fields)</span>
              </button>
              {showResponse && (
                <div className="mt-2">
                  <div className="flex gap-2 text-[10px] mb-1 justify-end">
                    <button
                      onClick={() => updateStepData({ response: fields.map(([n]) => n) })}
                      className="text-blue-400 hover:text-blue-300"
                    >all</button>
                    <button
                      onClick={() => updateStepData({ response: ['id'] })}
                      className="text-gray-500 hover:text-gray-300"
                    >clear</button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {fields.map(([name]) => (
                      <button
                        key={name}
                        onClick={() => handleToggleResponseField(name)}
                        className={clsx(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          responseFields.includes(name)
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                        )}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Entity Lookup Modal for FK fields */}
      {lookupField && (
        <EntityLookupModal
          isOpen={true}
          onClose={() => setLookupField(null)}
          onSelect={(selectedId) => {
            handleValueChange(lookupField, selectedId)
            setLookupField(null)
          }}
          targetEntity={inferTargetEntity(lookupField, info.entityName, allEntityNames)}
          graph={graph}
        />
      )}
    </div>
  )
}

// Transaction builder component
function TransactionBuilder({ graph, queryText, entities, onUpdateQuery }) {
  const [showAddEntity, setShowAddEntity] = useState(false)
  const [entityFilter, setEntityFilter] = useState('')

  // Get all entity names for FK lookup
  const allEntityNames = useMemo(() => entities.map(([name]) => name), [entities])

  // Parse current transaction from query text
  const currentTransaction = useMemo(() => {
    try {
      const parsed = JSON.parse(queryText)
      return parsed.transaction || { steps: [], on_error: 'rollback' }
    } catch {
      return { steps: [], on_error: 'rollback' }
    }
  }, [queryText])

  const steps = currentTransaction.steps || []

  // Calculate entity counts for proper numbering
  const entityCounters = useMemo(() => {
    const counters = {}
    steps.forEach(step => {
      const operation = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
      if (operation) {
        const entityData = step[operation]
        const entityName = Object.keys(entityData)[0]
        counters[entityName] = (counters[entityName] || 0) + 1
      }
    })
    return counters
  }, [steps])

  // Get entity number for a step (1-based, per entity type)
  const getEntityNumber = useCallback((stepIndex) => {
    const step = steps[stepIndex]
    const operation = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
    if (!operation) return 1
    const entityData = step[operation]
    const entityName = Object.keys(entityData)[0]

    let count = 0
    for (let i = 0; i <= stepIndex; i++) {
      const s = steps[i]
      const op = Object.keys(s).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
      if (op) {
        const ed = s[op]
        const en = Object.keys(ed)[0]
        if (en === entityName) count++
      }
    }
    return count
  }, [steps])

  // Get unique entity names in order of first appearance
  const orderedEntities = useMemo(() => {
    const seen = new Set()
    const ordered = []
    for (const step of steps) {
      const operation = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
      if (operation) {
        const entityData = step[operation]
        const entityName = Object.keys(entityData)[0]
        if (entityName && !seen.has(entityName)) {
          seen.add(entityName)
          ordered.push(entityName)
        }
      }
    }
    return ordered
  }, [steps])

  // Get entity color based on order of first appearance
  const getEntityColor = useCallback((entityName) => {
    const index = orderedEntities.indexOf(entityName)
    // If entity not in list yet (new entity being added), use next available color
    const colorIndex = index >= 0 ? index : orderedEntities.length
    return ENTITY_COLORS[colorIndex % ENTITY_COLORS.length]
  }, [orderedEntities])

  // Get available variables (aliases from previous steps)
  const getAvailableVariables = useCallback((stepIndex) => {
    const vars = []
    for (let i = 0; i < stepIndex; i++) {
      if (steps[i].as) {
        vars.push(steps[i].as)
      }
    }
    return vars
  }, [steps])

  // Add a new step
  const handleAddStep = useCallback((entityName) => {
    const entity = graph?.entities?.[entityName]
    if (!entity) return

    // Calculate next number for this entity
    const currentCount = entityCounters[entityName] || 0
    const nextNumber = currentCount + 1

    // Pre-populate required fields with default values
    const requiredData = {}
    Object.entries(entity.fields || {}).forEach(([fieldName, field]) => {
      if (fieldName !== 'id' && isFieldRequired(field, fieldName)) {
        requiredData[fieldName] = getDefaultValue(field)
      }
    })

    const newStep = {
      create: {
        [entityName]: {
          data: requiredData,
          response: ['id']
        }
      },
      as: `$${entityName.toLowerCase()}${nextNumber}`
    }

    const newTransaction = {
      transaction: {
        ...currentTransaction,
        steps: [...steps, newStep]
      }
    }

    onUpdateQuery(JSON.stringify(newTransaction, null, 2))
    setShowAddEntity(false)
  }, [graph, steps, currentTransaction, entityCounters, onUpdateQuery])

  // Update a step
  const handleUpdateStep = useCallback((index, newStep) => {
    const newSteps = [...steps]

    // Recalculate alias with proper numbering
    const operation = Object.keys(newStep).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
    if (operation) {
      const entityData = newStep[operation]
      const entityName = Object.keys(entityData)[0]
      const entityNumber = getEntityNumber(index)
      newStep.as = `$${entityName.toLowerCase()}${entityNumber}`
    }

    newSteps[index] = newStep

    const newTransaction = {
      transaction: {
        ...currentTransaction,
        steps: newSteps
      }
    }
    onUpdateQuery(JSON.stringify(newTransaction, null, 2))
  }, [steps, currentTransaction, getEntityNumber, onUpdateQuery])

  // Remove a step
  const handleRemoveStep = useCallback((index) => {
    const newSteps = steps.filter((_, i) => i !== index)
    const newTransaction = {
      transaction: {
        ...currentTransaction,
        steps: newSteps
      }
    }
    onUpdateQuery(JSON.stringify(newTransaction, null, 2))
  }, [steps, currentTransaction, onUpdateQuery])

  // Get entity def for a step
  const getEntityDef = useCallback((step) => {
    const operation = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
    if (!operation) return null
    const entityData = step[operation]
    const entityName = Object.keys(entityData)[0]
    return graph?.entities?.[entityName]
  }, [graph])

  // Get entity name for a step
  const getEntityName = useCallback((step) => {
    const operation = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
    if (!operation) return null
    const entityData = step[operation]
    return Object.keys(entityData)[0]
  }, [])

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Transaction Builder</span>
          <span className="text-xs text-purple-400">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {/* Steps */}
        {steps.map((step, index) => {
          const entityName = getEntityName(step)
          return (
            <TransactionStepCard
              key={index}
              step={step}
              index={index}
              entityDef={getEntityDef(step)}
              entityColor={getEntityColor(entityName)}
              entityNumber={getEntityNumber(index)}
              variables={getAvailableVariables(index)}
              onUpdate={(newStep) => handleUpdateStep(index, newStep)}
              onRemove={() => handleRemoveStep(index)}
              graph={graph}
              allEntityNames={allEntityNames}
            />
          )
        })}

        {/* Add step button */}
        {!showAddEntity ? (
          <button
            onClick={() => setShowAddEntity(true)}
            className="w-full py-2 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Step
          </button>
        ) : (
          <div className="border border-gray-600 rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase">Select Entity</span>
              <button
                onClick={() => { setShowAddEntity(false); setEntityFilter('') }}
                className="text-gray-500 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              type="text"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              placeholder="Filter entities..."
              className="w-full bg-gray-700 text-xs h-7 px-2 rounded border border-gray-600 text-white placeholder-gray-500 mb-2"
              autoFocus
            />
            <div className="max-h-48 overflow-auto space-y-0.5">
              {entities
                .filter(([name]) => name.toLowerCase().includes(entityFilter.toLowerCase()))
                .map(([name]) => {
                  const color = getEntityColor(name)
                  return (
                    <div
                      key={name}
                      onClick={() => { handleAddStep(name); setEntityFilter('') }}
                      className={clsx(
                        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
                        color.bg, "hover:opacity-80"
                      )}
                    >
                      <span className={clsx("text-sm font-medium", color.text)}>{name}</span>
                      <span className="text-xs text-gray-500">
                        {entityCounters[name] ? `(${entityCounters[name]} existing)` : ''}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* Error handling section */}
      <div className="px-3 py-2 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">On Error:</span>
          <select
            value={currentTransaction.on_error || 'rollback'}
            onChange={(e) => {
              const newTransaction = {
                transaction: {
                  ...currentTransaction,
                  on_error: e.target.value
                }
              }
              onUpdateQuery(JSON.stringify(newTransaction, null, 2))
            }}
            className="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-600 text-white flex-1"
          >
            <option value="rollback">Rollback (undo all)</option>
            <option value="stop">Stop (keep completed)</option>
            <option value="continue">Continue (ignore errors)</option>
          </select>
        </div>
      </div>
    </div>
  )
}

// Main component
export default function SchemaExplorer() {
  const dispatch = useDispatch()
  const graph = useSelector(selectGraph)
  const entities = useSelector(selectEntities)
  const rootEntity = useSelector(selectRootEntity)
  const selectedFields = useSelector(selectSelectedFields)
  const expandedPaths = useSelector(selectExpandedPaths)
  const filters = useSelector(selectFilters)
  const pagination = useSelector(selectPagination)
  const operationMode = useSelector(selectOperationMode)
  const queryText = useSelector(selectQueryText)

  const isMutationMode = operationMode !== 'query' && operationMode !== 'transaction'
  const isTransactionMode = operationMode === 'transaction'

  // State to force showing entity list in mutation mode (for "back" navigation)
  const [showMutationEntityList, setShowMutationEntityList] = useState(false)

  // Reset entity list view when operation mode changes
  useEffect(() => {
    setShowMutationEntityList(false)
  }, [operationMode])

  // Parse editor content to find active entity (for highlighting only)
  const activeEntityFromEditor = useMemo(() => {
    const parsed = parseEditorContent(queryText, operationMode)
    return parsed?.entityName || null
  }, [queryText, operationMode])

  const entityDef = useMemo(() => rootEntity && graph?.entities?.[rootEntity], [rootEntity, graph])
  const fields = useMemo(() => entityDef ? Object.entries(entityDef.fields || {}) : [], [entityDef])
  const relations = useMemo(() => entityDef ? Object.entries(entityDef.relations || {}) : [], [entityDef])

  const handleSelectEntity = useCallback((name) => dispatch(setRootEntity(name)), [dispatch])
  const handleBackToList = useCallback(() => dispatch(setRootEntity(null)), [dispatch])
  const handleToggleField = useCallback((path, field) => dispatch(toggleField({ path, field })), [dispatch])
  const handleSelectAll = useCallback((path, fields) => dispatch(selectAllFields({ path, fields })), [dispatch])
  const handleClearFields = useCallback((path) => dispatch(clearFields(path)), [dispatch])
  const handleToggleExpand = useCallback((path) => dispatch(toggleExpanded(path)), [dispatch])
  const handleSetFilter = useCallback((filterData) => dispatch(setFilter(filterData)), [dispatch])
  const handleSetPagination = useCallback((paginationData) => dispatch(setPagination(paginationData)), [dispatch])

  // Insert mutation template for entity
  const handleInsertMutationTemplate = useCallback((entityName) => {
    const entity = graph?.entities?.[entityName]
    if (!entity) return

    const template = generateMutationTemplate(entityName, entity, operationMode)
    if (template) {
      dispatch(setQueryText(JSON.stringify(template, null, 2)))
    }
  }, [graph, operationMode, dispatch])

  // Build query from builder state (for query mode only)
  // This generates query when user clicks checkboxes in the left panel
  const buildQueryFromBuilder = useCallback(() => {
    if (!rootEntity || !graph) return null

    const buildSelection = (entityName, path) => {
      const entityDef = graph.entities[entityName]
      if (!entityDef) return {}

      const selection = {}
      const pathFields = selectedFields[path] || []
      const pathFilters = filters[path] || {}
      const pathPagination = pagination[path] || {}

      if (pathFields.length > 0) selection.fields = pathFields
      if (Object.keys(pathFilters).length > 0) selection.filters = pathFilters
      if (pathPagination.limit) selection.limit = pathPagination.limit
      if (pathPagination.offset) selection.offset = pathPagination.offset

      const nestedRelations = {}
      for (const [relName, relDef] of Object.entries(entityDef.relations || {})) {
        const relPath = `${path}.${relName}`
        if ((selectedFields[relPath] || []).length > 0 || expandedPaths[relPath]) {
          nestedRelations[relName] = buildSelection(relDef.target, relPath)
        }
      }
      if (Object.keys(nestedRelations).length > 0) selection.relations = nestedRelations

      return selection
    }

    return { [rootEntity]: buildSelection(rootEntity, rootEntity) }
  }, [rootEntity, graph, selectedFields, filters, pagination, expandedPaths])

  // Handle update query for create mode
  const handleUpdateQueryText = useCallback((newText) => {
    dispatch(setQueryText(newText))
  }, [dispatch])

  // Get current entity from editor for create mode
  const createModeEntity = useMemo(() => {
    if (operationMode !== 'create' || !activeEntityFromEditor) return null
    return graph?.entities?.[activeEntityFromEditor] || null
  }, [operationMode, activeEntityFromEditor, graph])

  // Update query text when builder state changes (only in query mode when using builder)
  const prevBuilderStateRef = useRef(null)
  useEffect(() => {
    if (isMutationMode || isTransactionMode || !rootEntity) return

    // Create a key to track if builder state actually changed from user clicking
    const currentKey = JSON.stringify({ selectedFields, filters, pagination })

    // Skip if nothing changed or this is the first render
    if (prevBuilderStateRef.current === currentKey) return
    if (prevBuilderStateRef.current === null) {
      prevBuilderStateRef.current = currentKey
      return
    }

    prevBuilderStateRef.current = currentKey

    const query = buildQueryFromBuilder()
    if (query) {
      dispatch(setQueryText(JSON.stringify(query, null, 2)))
    }
  }, [selectedFields, filters, pagination, buildQueryFromBuilder, dispatch, isMutationMode, isTransactionMode, rootEntity])

  if (!graph) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="animate-spin w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full"></div>
      </div>
    )
  }

  // Transaction mode - show transaction builder
  if (isTransactionMode) {
    return (
      <TransactionBuilder
        graph={graph}
        queryText={queryText}
        entities={entities}
        onUpdateQuery={handleUpdateQueryText}
      />
    )
  }

  // Mutation mode - show entity list or field builder for create
  if (isMutationMode) {
    // Handler for selecting entity from list - also hides the entity list
    const handleSelectMutationEntity = (entityName) => {
      handleInsertMutationTemplate(entityName)
      setShowMutationEntityList(false)
    }

    // Show entity list if explicitly requested OR no entity in query
    const shouldShowEntityList = showMutationEntityList || !activeEntityFromEditor

    // Create mode with entity selected - show field builder
    if (operationMode === 'create' && activeEntityFromEditor && createModeEntity && !shouldShowEntityList) {
      return (
        <div className="h-full flex flex-col bg-gray-900">
          <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
            <button
              onClick={() => setShowMutationEntityList(true)}
              className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Create</span>
            <span className="text-sm font-medium text-white">{activeEntityFromEditor}</span>
          </div>
          <CreateModeBuilder
            entityName={activeEntityFromEditor}
            entity={createModeEntity}
            graph={graph}
            queryText={queryText}
            onUpdateQuery={handleUpdateQueryText}
          />
        </div>
      )
    }

    // Other mutation modes or entity list view - show entity list
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="px-3 py-2 border-b border-gray-700">
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            {MODE_TITLES[operationMode]} - Select Entity
          </span>
        </div>
        <EntityList
          entities={entities}
          onSelect={handleSelectMutationEntity}
          activeEntity={activeEntityFromEditor}
        />
      </div>
    )
  }

  // Query mode - show entity list or explorer
  if (!rootEntity) {
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <EntityList
          entities={entities}
          onSelect={handleSelectEntity}
          activeEntity={activeEntityFromEditor}
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
        <button onClick={handleBackToList} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-sm font-medium text-white truncate">{rootEntity}</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* Fields header */}
        <div className="flex items-center justify-between mb-1 px-2">
          <span className="text-xs text-gray-500 uppercase">Fields</span>
          <div className="flex gap-2 text-xs">
            <button onClick={() => handleSelectAll(rootEntity, fields.map(([n]) => n))} className="text-blue-400 hover:text-blue-300">all</button>
            <span className="text-gray-600">·</span>
            <button onClick={() => handleClearFields(rootEntity)} className="text-gray-500 hover:text-gray-300">clear</button>
          </div>
        </div>

        {/* Fields */}
        {fields.map(([name, field]) => (
          <FieldItem
            key={name}
            name={name}
            field={field}
            path={rootEntity}
            selected={(selectedFields[rootEntity] || []).includes(name)}
            onToggle={handleToggleField}
          />
        ))}

        {/* Filters */}
        <FilterSection path={rootEntity} fields={fields} filters={filters[rootEntity] || {}} onSetFilter={handleSetFilter} />

        {/* Pagination */}
        <PaginationSection path={rootEntity} pagination={pagination[rootEntity]} onSetPagination={handleSetPagination} />

        {/* Relations */}
        {relations.length > 0 && (
          <div className="mt-3">
            <span className="text-xs text-gray-500 uppercase px-2">Relations</span>
            {relations.map(([name, relation]) => (
              <RelationItem
                key={name}
                name={name}
                relation={relation}
                path={rootEntity}
                graph={graph}
                selectedFields={selectedFields}
                expandedPaths={expandedPaths}
                filters={filters}
                pagination={pagination}
                onToggleExpand={handleToggleExpand}
                onToggleField={handleToggleField}
                onSelectAll={handleSelectAll}
                onClearFields={handleClearFields}
                onSetFilter={handleSetFilter}
                onSetPagination={handleSetPagination}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

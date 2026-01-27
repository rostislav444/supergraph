// @ts-nocheck
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import clsx from 'clsx'
import { selectQueryText, setQueryText, executeQuery, selectQueryLoading, selectOperationMode, selectResult } from '../store/querySlice'
import { selectGraph } from '../store/graphSlice'
import { selectSelectedFields, selectRootEntity } from '../store/builderSlice'
import {
  selectDisplaySnapshot,
  selectDisplayColumnDefinitions,
  selectTableFilters,
  selectTablePagination,
  selectLastSuccessfulColumns,
  selectHasExecuted,
  setTableFilter,
  setTablePagination,
  setLastSuccessfulColumns,
  cleanupInactiveFilters,
} from '../store/displaySlice'
import FkLookupModal from './FkLookupModal'

// Entity colors for visual distinction
const ENTITY_COLORS = [
  { bg: 'bg-blue-900/30', border: 'border-blue-500', header: 'bg-blue-600/40', text: 'text-blue-400' },
  { bg: 'bg-purple-900/30', border: 'border-purple-500', header: 'bg-purple-600/40', text: 'text-purple-400' },
  { bg: 'bg-emerald-900/30', border: 'border-emerald-500', header: 'bg-emerald-600/40', text: 'text-emerald-400' },
  { bg: 'bg-orange-900/30', border: 'border-orange-500', header: 'bg-orange-600/40', text: 'text-orange-400' },
]

// Get default value for field type
function getDefaultValue(field) {
  switch (field?.type) {
    case 'string': return ''
    case 'int': return 0
    case 'bool': return false
    case 'date': return new Date().toISOString().slice(0, 10)
    case 'datetime': return new Date().toISOString()
    case 'enum': return field.enum_values?.[0] || ''
    default: return ''
  }
}

// Resize handle for vertical layout
function VerticalResizeHandle() {
  return (
    <PanelResizeHandle className="group">
      <div className="h-1 bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
    </PanelResizeHandle>
  )
}

// Form field for mutation modes
function FormField({ name, field, value, onChange, variables = [], graph, entityName }) {
  const [showLookup, setShowLookup] = useState(false)
  const isEnum = field?.type === 'enum' && field.enum_values?.length > 0
  const isRef = name.endsWith('_id')
  const isVariable = typeof value === 'string' && value.startsWith('$')

  // Determine the target entity for FK lookup
  const targetEntity = useMemo(() => {
    if (!isRef || !graph?.entities?.[entityName]) return null
    // Try to find relation that uses this field
    const relations = graph.entities[entityName]?.relations || {}
    for (const [, rel] of Object.entries(relations)) {
      if (rel.ref?.from_field === name) {
        return rel.target || rel.ref?.to_entity
      }
    }
    // Fallback: guess from field name (e.g., owner_id -> Person, property_id -> Property)
    const baseName = name.replace(/_id$/, '')
    const guessedEntity = Object.keys(graph.entities).find(e =>
      e.toLowerCase() === baseName.toLowerCase() ||
      e.toLowerCase() === baseName.replace(/_/g, '').toLowerCase()
    )
    return guessedEntity || null
  }, [isRef, graph, entityName, name])

  // FK field with lookup
  if (isRef) {
    return (
      <div className="flex gap-2">
        {variables.length > 0 && (
          <select
            value={isVariable ? value : '__manual__'}
            onChange={(e) => onChange(e.target.value === '__manual__' ? 0 : e.target.value)}
            className="flex-1 bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white"
          >
            <option value="__manual__">Enter ID manually</option>
            {variables.map(v => (
              <option key={v} value={`${v}.id`}>{v}.id</option>
            ))}
          </select>
        )}
        {(!isVariable || variables.length === 0) && (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            placeholder="ID"
            className={clsx(
              "bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white",
              variables.length > 0 ? "w-24" : "flex-1"
            )}
          />
        )}
        {targetEntity && (
          <button
            type="button"
            onClick={() => setShowLookup(true)}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
            title={`Search ${targetEntity}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        )}
        {showLookup && (
          <FkLookupModal
            isOpen={showLookup}
            onClose={() => setShowLookup(false)}
            onSelect={onChange}
            targetEntity={targetEntity}
            graph={graph}
          />
        )}
      </div>
    )
  }

  if (isEnum) {
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white"
      >
        <option value="" disabled>Select...</option>
        {field.enum_values.map(v => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    )
  }

  if (field?.type === 'bool') {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(true)}
          className={clsx('px-3 py-1.5 rounded text-xs', value === true ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400')}
        >True</button>
        <button
          onClick={() => onChange(false)}
          className={clsx('px-3 py-1.5 rounded text-xs', value === false ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400')}
        >False</button>
      </div>
    )
  }

  if (field?.type === 'date') {
    return (
      <input
        type="date"
        value={value ? String(value).slice(0, 10) : ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white"
      />
    )
  }

  if (field?.type === 'datetime') {
    return (
      <input
        type="datetime-local"
        value={value ? String(value).slice(0, 16) : ''}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="w-full bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white"
      />
    )
  }

  return (
    <input
      type={field?.type === 'int' ? 'number' : 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(field?.type === 'int' ? parseInt(e.target.value) || 0 : e.target.value)}
      className="w-full bg-gray-700 text-sm px-3 py-2 rounded border border-gray-600 text-white"
    />
  )
}

// Boolean badge component
function BooleanBadge({ value }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-900/50 text-green-400 border border-green-700">
        true
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/50 text-red-400 border border-red-700">
        false
      </span>
    )
  }
  return null
}

// Null badge
function NullBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-500 border border-gray-700 italic">
      null
    </span>
  )
}

// Number cell - different colors for int vs float
function NumberCell({ value }) {
  const isFloat = !Number.isInteger(value)
  return (
    <span className={clsx(
      'font-mono text-xs',
      isFloat ? 'text-cyan-400' : 'text-amber-400'
    )}>
      {isFloat ? value.toFixed(2) : value}
    </span>
  )
}

// Text cell with limit and scroll for long content
function TextCell({ value, maxHeight = 60 }) {
  const isLong = value && value.length > 100
  const [expanded, setExpanded] = useState(false)

  if (!isLong) {
    return <span className="text-gray-300">{value}</span>
  }

  return (
    <div className="relative">
      <div
        className={clsx(
          'text-xs text-gray-400 leading-relaxed',
          !expanded && 'max-h-[60px] overflow-hidden'
        )}
      >
        {value}
      </div>
      {!expanded && value.length > 100 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-blue-400 hover:text-blue-300 mt-0.5"
        >
          ...more
        </button>
      )}
      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-blue-400 hover:text-blue-300 mt-0.5"
        >
          less
        </button>
      )}
    </div>
  )
}

// Enum badge - colored based on value hash with many distinct colors
function EnumBadge({ value }) {
  // Large palette of distinct colors
  const colors = [
    { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-600' },
    { bg: 'bg-orange-900/50', text: 'text-orange-300', border: 'border-orange-600' },
    { bg: 'bg-amber-900/50', text: 'text-amber-300', border: 'border-amber-600' },
    { bg: 'bg-yellow-900/50', text: 'text-yellow-300', border: 'border-yellow-600' },
    { bg: 'bg-lime-900/50', text: 'text-lime-300', border: 'border-lime-600' },
    { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-600' },
    { bg: 'bg-emerald-900/50', text: 'text-emerald-300', border: 'border-emerald-600' },
    { bg: 'bg-teal-900/50', text: 'text-teal-300', border: 'border-teal-600' },
    { bg: 'bg-cyan-900/50', text: 'text-cyan-300', border: 'border-cyan-600' },
    { bg: 'bg-sky-900/50', text: 'text-sky-300', border: 'border-sky-600' },
    { bg: 'bg-blue-900/50', text: 'text-blue-300', border: 'border-blue-600' },
    { bg: 'bg-indigo-900/50', text: 'text-indigo-300', border: 'border-indigo-600' },
    { bg: 'bg-violet-900/50', text: 'text-violet-300', border: 'border-violet-600' },
    { bg: 'bg-purple-900/50', text: 'text-purple-300', border: 'border-purple-600' },
    { bg: 'bg-fuchsia-900/50', text: 'text-fuchsia-300', border: 'border-fuchsia-600' },
    { bg: 'bg-pink-900/50', text: 'text-pink-300', border: 'border-pink-600' },
    { bg: 'bg-rose-900/50', text: 'text-rose-300', border: 'border-rose-600' },
  ]

  // Better hash function for more distribution
  const str = String(value)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  hash = Math.abs(hash)
  const color = colors[hash % colors.length]

  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
      color.bg, color.text, color.border
    )}>
      {value}
    </span>
  )
}

// Nested object cell - shows content directly without expand
function NestedObjectCell({ value, fieldName }) {
  // Handle array of objects (relations)
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-500 text-xs italic">empty</span>
    }

    // Show all items as list
    return (
      <div className="space-y-1">
        {value.map((item, i) => {
          if (typeof item !== 'object') {
            return <div key={i} className="text-xs text-gray-300">{String(item)}</div>
          }
          // Get all simple fields from the item
          const fields = Object.entries(item).filter(([k, v]) => v === null || typeof v !== 'object')
          return (
            <div key={i} className="flex flex-wrap gap-1 items-center py-0.5 border-b border-gray-800 last:border-0">
              {fields.map(([k, v]) => (
                <span key={k} className="text-[10px]">
                  <span className="text-gray-500">{k}:</span>{' '}
                  <SmartCell value={v} fieldName={k} />
                </span>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  // Single object - show all fields
  if (typeof value === 'object' && value !== null) {
    const fields = Object.entries(value).filter(([k, v]) => v === null || typeof v !== 'object')
    return (
      <div className="flex flex-wrap gap-2">
        {fields.map(([k, v]) => (
          <span key={k} className="text-[10px]">
            <span className="text-gray-500">{k}:</span>{' '}
            <SmartCell value={v} fieldName={k} />
          </span>
        ))}
      </div>
    )
  }

  return <span className="text-gray-400">{String(value)}</span>
}

// Check if value looks like an enum
function isEnumLike(value, fieldName) {
  if (typeof value !== 'string') return false
  // Short value (1-30 chars)
  if (value.length > 30 || value.length < 1) return false
  // Field name hints
  const enumFields = ['status', 'type', 'kind', 'state', 'role', 'category', 'priority', 'level', 'mode']
  const fieldLower = fieldName.toLowerCase()
  if (enumFields.some(f => fieldLower.includes(f))) return true
  // Value pattern: UPPER_CASE, snake_case, or single word
  if (/^[A-Z][A-Z0-9_]+$/.test(value)) return true // UPPER_CASE
  if (/^[a-z][a-z0-9_]+$/.test(value) && value.includes('_')) return true // snake_case
  if (/^[a-z]+$/.test(value) && value.length <= 15) return true // single lowercase word
  return false
}

// Check if field should be treated as text (description, notes, etc)
function isTextField(fieldName) {
  const textFields = ['description', 'content', 'text', 'body', 'notes', 'comment', 'message', 'summary', 'details', 'bio', 'about']
  const fieldLower = fieldName.toLowerCase()
  return textFields.some(f => fieldLower.includes(f))
}

// Smart cell that detects value type and renders appropriately
function SmartCell({ value, fieldName = '' }) {
  // Null
  if (value === null || value === undefined) {
    return <NullBadge />
  }

  // Boolean
  if (typeof value === 'boolean') {
    return <BooleanBadge value={value} />
  }

  // Number
  if (typeof value === 'number') {
    return <NumberCell value={value} />
  }

  // Object or Array (nested)
  if (typeof value === 'object') {
    return <NestedObjectCell value={value} fieldName={fieldName} />
  }

  // String - check if it's long text
  if (typeof value === 'string') {
    // Date/datetime detection
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const isDateTime = value.includes('T')
      return (
        <span className="font-mono text-xs text-purple-400">
          {isDateTime ? value.replace('T', ' ').slice(0, 19) : value.slice(0, 10)}
        </span>
      )
    }

    // Enum detection
    if (isEnumLike(value, fieldName)) {
      return <EnumBadge value={value} />
    }

    // Text field (description, notes, etc) - always treat as potentially long
    if (isTextField(fieldName)) {
      return <TextCell value={value} />
    }

    // Long text (>50 chars)
    if (value.length > 50) {
      return <TextCell value={value} />
    }

    // Regular string
    return <span className="text-gray-300">{value}</span>
  }

  return <span className="text-gray-300">{String(value)}</span>
}

// Detect column type from values
function detectColumnType(items, key) {
  const values = items.map(item => item?.[key]).filter(v => v !== null && v !== undefined)
  if (values.length === 0) return 'string'

  const first = values[0]
  if (typeof first === 'boolean') return 'boolean'
  if (typeof first === 'number') return 'number'
  if (typeof first === 'object') return 'object'

  // Check if string looks like enum
  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length <= 10 && uniqueValues.every(v => typeof v === 'string' && v.length < 30)) {
    return 'enum'
  }

  return 'string'
}

// Filter mode options
const FILTER_MODES = {
  string: [
    { value: 'contains', label: '~' },
    { value: 'exact', label: '=' },
    { value: 'starts', label: 'a..' },
    { value: 'ends', label: '..z' },
  ],
  number: [
    { value: 'eq', label: '=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
  ],
}

// Pagination controls component
function PaginationControls({
  filteredCount,
  totalCount,
  totalInDatabase,
  hasFilters,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  totalPages,
  position = 'bottom',
  loading = false
}) {
  return (
    <div className={clsx(
      "flex items-center justify-between px-3 py-2 bg-gray-800 text-xs",
      position === 'top' ? "border-b border-gray-700 rounded-t" : "border-t border-gray-700"
    )}>
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
            {hasFilters && (
              <span className="text-blue-400">(filtered)</span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Page size */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Show:</span>
          <select
            value={pageSize === Infinity ? 'all' : pageSize}
            onChange={(e) => { setPageSize(e.target.value === 'all' ? Infinity : Number(e.target.value)); setCurrentPage(1) }}
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
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-600"
          >
            ‹
          </button>
          <span className="px-2 text-gray-300">
            {currentPage} / {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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

// Priority order for column sorting
const COLUMN_PRIORITY = ['id', 'name', 'title', 'status', 'type']

// Sort columns with priority fields first
function sortColumns(keys) {
  return [...keys].sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    const aIdx = COLUMN_PRIORITY.indexOf(aLower)
    const bIdx = COLUMN_PRIORITY.indexOf(bLower)

    // Both are priority fields - sort by priority order
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    // Only a is priority field - a comes first
    if (aIdx !== -1) return -1
    // Only b is priority field - b comes first
    if (bIdx !== -1) return 1
    // Neither is priority - alphabetical
    return a.localeCompare(b)
  })
}

// Convert UI filter mode to backend filter suffix
function getBackendFilterSuffix(mode, colType) {
  if (colType === 'number') {
    const map = { eq: '__eq', gt: '__gt', gte: '__gte', lt: '__lt', lte: '__lte' }
    return map[mode] || '__eq'
  }
  if (colType === 'boolean' || colType === 'enum') {
    return '__eq'
  }
  // String
  const map = { contains: '__icontains', exact: '__eq', starts: '__istartswith', ends: '__iendswith' }
  return map[mode] || '__icontains'
}

// Result table for displaying query results with pagination and filters
function ResultTable({ data, depth = 0 }) {
  const dispatch = useDispatch()
  const [lookupColumn, setLookupColumn] = useState(null)
  const filterTimeoutRef = useRef(null)
  const graph = useSelector(selectGraph)
  const queryText = useSelector(selectQueryText)
  const loading = useSelector(selectQueryLoading)

  // Get selected fields from builder state
  const builderSelectedFields = useSelector(selectSelectedFields)
  const rootEntity = useSelector(selectRootEntity)

  // Use Redux for filters and pagination (persisted state)
  const filters = useSelector(selectTableFilters)
  const { pageSize, currentPage } = useSelector(selectTablePagination)
  const displaySnapshot = useSelector(selectDisplaySnapshot)
  const schemaColumnDefinitions = useSelector(selectDisplayColumnDefinitions)
  const lastSuccessfulColumns = useSelector(selectLastSuccessfulColumns)
  const hasExecuted = useSelector(selectHasExecuted)

  // Find target entity for a FK column - tries multiple strategies
  const getTargetEntity = useCallback((columnName) => {
    if (!columnName.endsWith('_id')) return null
    if (!graph?.entities) return null

    const allEntities = Object.keys(graph.entities)
    if (allEntities.length === 0) return null

    const baseName = columnName.replace(/_id$/, '')

    // Handle self-reference (parent_id -> same entity)
    if (baseName === 'parent' && rootEntity) {
      return rootEntity
    }

    // Try relations first
    if (rootEntity && graph.entities[rootEntity]) {
      const relations = graph.entities[rootEntity]?.relations || {}
      for (const [, rel] of Object.entries(relations)) {
        if (rel.ref?.from_field === columnName) {
          return rel.target || rel.ref?.to_entity
        }
      }
    }

    // Convert snake_case to PascalCase
    const pascalCase = baseName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')

    // Try direct PascalCase match
    if (graph.entities[pascalCase]) return pascalCase

    // Try lowercase matching
    return allEntities.find(e =>
      e.toLowerCase() === baseName.toLowerCase() ||
      e.toLowerCase() === pascalCase.toLowerCase()
    ) || null
  }, [graph, rootEntity])

  // Handle lookup - switch to query mode for the target entity
  const handleLookup = useCallback((columnName, value) => {
    const targetEntity = getTargetEntity(columnName)
    if (!targetEntity || !value) return

    // Build a query to find the target entity by ID
    const query = {
      [targetEntity]: {
        filters: { id__eq: value },
        select: { fields: ['id', 'name', 'title', 'status'].filter(f => graph?.entities?.[targetEntity]?.fields?.[f] || f === 'id') }
      }
    }
    dispatch(setQueryText(JSON.stringify(query, null, 2)))
    dispatch(executeQuery(JSON.stringify(query)))
  }, [dispatch, getTargetEntity, graph])

  // Extract items from data (if available)
  const items = data
    ? (Array.isArray(data) ? data : data.items || [data])
    : []

  // Extract total count from backend response (if available)
  const totalInDatabase = data?.pagination?.total ?? data?.total ?? data?.count ?? null

  // Get selected fields for the root entity from builder state (LIVE - updates immediately when checkboxes change)
  const selectedFields = rootEntity ? (builderSelectedFields[rootEntity] || []) : []

  // Get column definitions from schema for selected fields
  const liveColumnDefinitions = useMemo(() => {
    const defs = {}
    if (rootEntity && graph?.entities?.[rootEntity]) {
      const entityDef = graph.entities[rootEntity]
      for (const fieldName of selectedFields) {
        const fieldDef = entityDef.fields?.[fieldName]
        if (fieldDef) {
          defs[fieldName] = {
            type: fieldDef.type,
            enum_values: fieldDef.enum_values || [],
            nullable: fieldDef.nullable,
          }
        }
      }
    }
    return defs
  }, [rootEntity, graph, selectedFields])

  // Cleanup filters for fields that are no longer selected
  useEffect(() => {
    if (selectedFields.length > 0) {
      dispatch(cleanupInactiveFilters({ activeFields: selectedFields }))
    }
  }, [dispatch, selectedFields])

  // Save successful columns when response has data
  useEffect(() => {
    if (items.length > 0) {
      const rawKeys = [...new Set(items.flatMap(item => Object.keys(item || {})))]
      const columns = sortColumns(rawKeys.filter(key => key !== 'id' || selectedFields.includes('id')))
      dispatch(setLastSuccessfulColumns({ columns }))
    }
  }, [dispatch, items, selectedFields])

  // Three-state column logic:
  // 1. Before query (hasExecuted = false): columns from selectedFields (LIVE from left panel)
  // 2. After query with data (items.length > 0): columns from response data
  // 3. After query with 0 results: columns from lastSuccessfulColumns (or selectedFields as fallback)
  const allKeys = useMemo(() => {
    // State 1: Before any query execution - use live selectedFields
    if (!hasExecuted) {
      if (selectedFields.length > 0) {
        return sortColumns(selectedFields)
      }
      return []
    }

    // State 2: After query with data - use columns from response
    if (items.length > 0) {
      const rawKeys = [...new Set(items.flatMap(item => Object.keys(item || {})))]
      return sortColumns(rawKeys.filter(key => key !== 'id' || selectedFields.includes('id')))
    }

    // State 3: After query with 0 results - use lastSuccessfulColumns or fallback to selectedFields
    if (lastSuccessfulColumns.length > 0) {
      return sortColumns(lastSuccessfulColumns)
    }

    // Fallback to selectedFields if no lastSuccessfulColumns
    if (selectedFields.length > 0) {
      return sortColumns(selectedFields)
    }

    return []
  }, [hasExecuted, items, selectedFields, lastSuccessfulColumns])

  // NOTE: No early return here - all hooks must be called unconditionally
  // Empty state is handled in the final return JSX

  const columnTypes = useMemo(() => {
    const types = {}
    for (const key of allKeys) {
      // First try to get type from live schema (liveColumnDefinitions)
      if (liveColumnDefinitions[key]?.type) {
        const schemaType = liveColumnDefinitions[key].type
        // Map schema types to column types
        if (schemaType === 'enum' || (liveColumnDefinitions[key].enum_values?.length > 0)) {
          types[key] = 'enum'
        } else if (schemaType === 'int' || schemaType === 'number') {
          types[key] = 'number'
        } else if (schemaType === 'bool') {
          types[key] = 'boolean'
        } else {
          types[key] = 'string'
        }
      } else if (items.length > 0) {
        // Fallback - detect from data
        types[key] = detectColumnType(items, key)
      } else {
        types[key] = 'string'
      }
    }
    return types
  }, [allKeys, liveColumnDefinitions, items])

  // Get unique values for enum columns - prefer schema, fallback to data
  const enumValues = useMemo(() => {
    const enums = {}
    for (const key of allKeys) {
      // First try to get enum_values from live schema
      if (liveColumnDefinitions[key]?.enum_values?.length > 0) {
        enums[key] = liveColumnDefinitions[key].enum_values
      }
      // Fallback - extract from data if schema doesn't have enum_values
      else if (columnTypes[key] === 'enum' && items.length > 0) {
        enums[key] = [...new Set(items.map(item => item?.[key]).filter(v => v !== null && v !== undefined))]
      }
    }
    return enums
  }, [allKeys, liveColumnDefinitions, columnTypes, items])

  // Build backend filters from UI filters and execute query
  const executeWithFilters = useCallback((newFilters, newColumnTypes) => {
    if (!rootEntity) return

    try {
      const parsed = JSON.parse(queryText)
      const entityQuery = parsed[rootEntity]
      if (!entityQuery) return

      // Build backend filter object
      const backendFilters = {}
      for (const [field, filter] of Object.entries(newFilters)) {
        if (!filter?.value && filter?.value !== 0) continue
        const colType = newColumnTypes?.[field] || 'string'
        const suffix = getBackendFilterSuffix(filter.mode || 'contains', colType)

        // Convert value to proper type
        let value = filter.value
        if (colType === 'number') {
          value = Number(value)
          if (isNaN(value)) continue
        } else if (colType === 'boolean') {
          value = value === 'true'
        }

        backendFilters[`${field}${suffix}`] = value
      }

      // Update query with new filters
      const newQuery = {
        ...parsed,
        [rootEntity]: {
          ...entityQuery,
          filters: Object.keys(backendFilters).length > 0 ? backendFilters : undefined
        }
      }

      // Clean up undefined filters
      if (!newQuery[rootEntity].filters) {
        delete newQuery[rootEntity].filters
      }

      const newQueryText = JSON.stringify(newQuery, null, 2)
      dispatch(setQueryText(newQueryText))
      dispatch(executeQuery(newQueryText))
    } catch (e) {
      console.error('Failed to update query with filters:', e)
    }
  }, [rootEntity, queryText, dispatch])

  // Pagination (now based on items, not client-filtered)
  const totalPages = pageSize === Infinity ? 1 : Math.ceil(items.length / pageSize)
  const startIdx = (currentPage - 1) * pageSize
  const paginatedItems = pageSize === Infinity ? items : items.slice(startIdx, startIdx + pageSize)

  // Check if any filters are active
  const hasFilters = Object.values(filters).some(f => f?.value)

  // Handle filter change - debounced backend query
  const handleFilterChange = useCallback((key, value, mode) => {
    const filterMode = mode || filters[key]?.mode || 'contains'

    // Update Redux state
    dispatch(setTableFilter({
      field: key,
      value,
      mode: filterMode
    }))

    // Debounce backend query
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current)
    }
    filterTimeoutRef.current = setTimeout(() => {
      const newFilters = {
        ...filters,
        [key]: { value, mode: filterMode }
      }
      executeWithFilters(newFilters, columnTypes)
    }, 500)
  }, [dispatch, filters, columnTypes, executeWithFilters])

  const handleModeChange = useCallback((key, mode) => {
    // Update Redux state
    dispatch(setTableFilter({
      field: key,
      value: filters[key]?.value,
      mode
    }))

    // Execute immediately on mode change (user made deliberate choice)
    const newFilters = {
      ...filters,
      [key]: { ...filters[key], mode }
    }
    executeWithFilters(newFilters, columnTypes)
  }, [dispatch, filters, columnTypes, executeWithFilters])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current)
      }
    }
  }, [])

  // Render filter input based on column type
  const renderFilterInput = (key, colType) => {
    const filter = filters[key] || {}

    // Boolean - select true/false
    if (colType === 'boolean') {
      return (
        <select
          value={filter.value || ''}
          onChange={(e) => handleFilterChange(key, e.target.value)}
          disabled={loading}
          className={clsx(
            "w-full bg-gray-900 text-xs text-gray-300 px-1 py-1 rounded border",
            loading ? "border-gray-600 opacity-50" : "border-gray-700 focus:border-blue-500"
          )}
        >
          <option value="">All</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    }

    // Enum - select from unique values
    if (colType === 'enum') {
      return (
        <select
          value={filter.value || ''}
          onChange={(e) => handleFilterChange(key, e.target.value)}
          disabled={loading}
          className={clsx(
            "w-full bg-gray-900 text-xs text-gray-300 px-1 py-1 rounded border",
            loading ? "border-gray-600 opacity-50" : "border-gray-700 focus:border-blue-500"
          )}
        >
          <option value="">All</option>
          {enumValues[key]?.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      )
    }

    // Number - number input
    if (colType === 'number') {
      return (
        <input
          type="number"
          value={filter.value ?? ''}
          onChange={(e) => handleFilterChange(key, e.target.value)}
          placeholder="..."
          disabled={loading}
          className={clsx(
            "w-full bg-gray-900 text-xs text-gray-300 px-2 py-1 rounded border focus:outline-none",
            loading ? "border-gray-600 opacity-50" : "border-gray-700 focus:border-blue-500"
          )}
        />
      )
    }

    // String - text input
    return (
      <input
        type="text"
        value={filter.value || ''}
        onChange={(e) => handleFilterChange(key, e.target.value)}
        placeholder="..."
        disabled={loading}
        className={clsx(
          "w-full bg-gray-900 text-xs text-gray-300 px-2 py-1 rounded border focus:outline-none",
          loading ? "border-gray-600 opacity-50" : "border-gray-700 focus:border-blue-500"
        )}
      />
    )
  }

  // Render filter mode selector as select dropdown
  const renderModeSelector = (key, colType) => {
    if (colType === 'boolean' || colType === 'enum' || colType === 'object') {
      // Empty placeholder with same height as select for alignment
      return <div className="h-[22px]" />
    }

    const modes = colType === 'number' ? FILTER_MODES.number : FILTER_MODES.string
    const currentMode = filters[key]?.mode || (colType === 'number' ? 'eq' : 'contains')

    return (
      <select
        value={currentMode}
        onChange={(e) => handleModeChange(key, e.target.value)}
        className="w-full bg-gray-900 text-[10px] text-gray-400 px-1 py-0.5 rounded border border-gray-700 focus:border-blue-500"
      >
        {modes.map(m => (
          <option key={m.value} value={m.value}>{m.label} {m.value}</option>
        ))}
      </select>
    )
  }

  // Wrapper functions for Redux pagination dispatch
  const handleSetPageSize = useCallback((size) => {
    dispatch(setTablePagination({ pageSize: size }))
  }, [dispatch])

  const handleSetCurrentPage = useCallback((page) => {
    // Support both direct value and function updater
    const newPage = typeof page === 'function' ? page(currentPage) : page
    dispatch(setTablePagination({ currentPage: newPage }))
  }, [dispatch, currentPage])

  // Pagination props
  const paginationProps = {
    filteredCount: items.length,
    totalCount: items.length,
    totalInDatabase,
    hasFilters,
    pageSize,
    setPageSize: handleSetPageSize,
    currentPage,
    setCurrentPage: handleSetCurrentPage,
    totalPages,
    loading
  }

  // Handle empty state - show message if no columns to display
  if (allKeys.length === 0) {
    if (!rootEntity) {
      return <div className="text-center text-gray-500 py-4">Select an entity to see table</div>
    }
    return <div className="text-center text-gray-500 py-4">Select fields to see table columns</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Pagination - Top */}
      <PaginationControls {...paginationProps} position="top" />

      {/* Table */}
      <div className="overflow-auto flex-1 border-x border-gray-700">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-800 sticky top-0 z-10">
            {/* Column headers */}
            <tr>
              {allKeys.map((key, idx) => {
                const isFK = key.endsWith('_id')
                const targetEntity = isFK ? getTargetEntity(key) : null
                return (
                  <th
                    key={key}
                    className={clsx(
                      "px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap border-b border-gray-600",
                      idx < allKeys.length - 1 && "border-r border-gray-700"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {key}
                      <span className="text-[9px] text-gray-600">
                        {columnTypes[key] === 'number' ? '#' :
                         columnTypes[key] === 'boolean' ? '?' :
                         columnTypes[key] === 'enum' ? '[]' : ''}
                      </span>
                      {targetEntity && (
                        <span
                          className="text-[9px] text-blue-400 cursor-help"
                          title={`References ${targetEntity}`}
                        >
                          → {targetEntity}
                        </span>
                      )}
                      {isFK && (
                        <button
                          onClick={() => setLookupColumn(key)}
                          className="p-0.5 text-gray-500 hover:text-blue-400 transition-colors"
                          title={targetEntity ? `Search ${targetEntity}` : 'Search related entity'}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
            {/* Filter row - input + mode selector below */}
            <tr className="bg-gray-850">
              {allKeys.map((key, idx) => (
                <th
                  key={`filter-${key}`}
                  className={clsx(
                    "px-1 py-1 border-b border-gray-700",
                    idx < allKeys.length - 1 && "border-r border-gray-700"
                  )}
                >
                  <div className="space-y-1">
                    {renderFilterInput(key, columnTypes[key])}
                    {renderModeSelector(key, columnTypes[key])}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((item, i) => (
              <tr
                key={i}
                className={clsx(
                  "align-top",
                  i % 2 === 0 ? "bg-gray-900/30" : "bg-gray-800/20",
                  "hover:bg-gray-700/30"
                )}
              >
                {allKeys.map((key, idx) => {
                  const isFK = key.endsWith('_id')
                  const targetEntity = isFK ? getTargetEntity(key) : null
                  const cellValue = item?.[key]
                  return (
                    <td
                      key={key}
                      className={clsx(
                        "px-3 py-2 max-w-xs border-b border-gray-800",
                        idx < allKeys.length - 1 && "border-r border-gray-800"
                      )}
                    >
                      <div className="flex items-center gap-1">
                        <SmartCell value={cellValue} fieldName={key} />
                        {targetEntity && cellValue != null && (
                          <button
                            onClick={() => handleLookup(key, cellValue)}
                            className="ml-1 p-0.5 text-gray-500 hover:text-blue-400 transition-colors"
                            title={`View ${targetEntity} #${cellValue}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination - Bottom */}
      <PaginationControls {...paginationProps} position="bottom" />

      {/* FK Lookup Modal for filtering */}
      {lookupColumn && (
        <FkLookupModal
          isOpen={!!lookupColumn}
          onClose={() => setLookupColumn(null)}
          onSelect={(id) => {
            handleFilterChange(lookupColumn, id)
            setLookupColumn(null)
          }}
          targetEntity={getTargetEntity(lookupColumn)}
          graph={graph}
        />
      )}
    </div>
  )
}

// Transaction/mutation result display
function TransactionResult({ result }) {
  if (!result) return null

  if (result.error || result.detail) {
    return (
      <div className="bg-red-900/30 border border-red-500 rounded p-4">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <span className="font-medium">Error</span>
        </div>
        <pre className="text-sm text-red-300 whitespace-pre-wrap">
          {result.detail?.message || result.error || JSON.stringify(result, null, 2)}
        </pre>
      </div>
    )
  }

  if (result.results) {
    return (
      <div className="space-y-4">
        {Object.entries(result.results).map(([stepName, stepResult]) => (
          <div key={stepName} className="bg-gray-800/30 rounded border border-gray-700">
            <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
              <span className="text-purple-400 font-mono text-sm">{stepName}</span>
              <span className="text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">ok</span>
            </div>
            <div className="p-3">
              <ResultTable data={stepResult} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return <ResultTable data={result.data || result} />
}

// Mutation form card
function MutationFormCard({ entityName, entityDef, data, onDataChange, colorIndex = 0, operation, alias, variables = [], graph }) {
  const color = ENTITY_COLORS[colorIndex % ENTITY_COLORS.length]
  const fields = Object.entries(entityDef?.fields || {}).filter(([name]) => name !== 'id')

  return (
    <div className={clsx('rounded-lg border', color.bg, color.border)}>
      <div className={clsx('px-3 py-2 flex items-center gap-2', color.header)}>
        <span className={clsx('font-medium', color.text)}>{entityName}</span>
        {alias && <span className="text-xs font-mono bg-gray-900/50 px-1.5 py-0.5 rounded text-purple-300">{alias}</span>}
        <span className={clsx('text-xs px-1.5 py-0.5 rounded',
          operation === 'create' ? 'bg-green-600' : operation === 'update' ? 'bg-yellow-600' : 'bg-red-600'
        )}>{operation}</span>
      </div>
      <div className="p-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {fields.map(([fieldName, field]) => (
          <div key={fieldName}>
            <label className="block text-xs text-gray-400 mb-1">
              {fieldName}
              {field.nullable === false && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <FormField
              name={fieldName}
              field={field}
              value={data?.[fieldName]}
              onChange={(val) => onDataChange(fieldName, val)}
              variables={variables}
              graph={graph}
              entityName={entityName}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// Main FormEditor component
export default function FormEditor({ layout = 'vertical' }) {
  const dispatch = useDispatch()
  const queryText = useSelector(selectQueryText)
  const operationMode = useSelector(selectOperationMode)
  const loading = useSelector(selectQueryLoading)
  const result = useSelector(selectResult)
  const graph = useSelector(selectGraph)

  // Parse current query
  const parsedQuery = useMemo(() => {
    try {
      return JSON.parse(queryText)
    } catch {
      return null
    }
  }, [queryText])

  // Determine if this is a query or mutation
  const isQueryMode = operationMode === 'query'

  // Extract info from parsed query
  const { entityName, entityDef, steps } = useMemo(() => {
    if (!parsedQuery || !graph?.entities) return { entityName: null, entityDef: null, steps: [] }

    // Transaction mode
    if (parsedQuery.transaction?.steps) {
      const steps = parsedQuery.transaction.steps.map((step, index) => {
        const op = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
        if (!op) return null
        const entityName = Object.keys(step[op])[0]
        return {
          operation: op,
          entityName,
          entityDef: graph.entities[entityName],
          stepData: step[op][entityName],
          alias: step.as,
          index
        }
      }).filter(Boolean)
      return { steps }
    }

    // Single operation
    const opKey = ['create', 'update', 'rewrite', 'delete'].find(k => parsedQuery[k])
    if (opKey) {
      const entityName = Object.keys(parsedQuery[opKey])[0]
      return {
        entityName,
        entityDef: graph.entities[entityName],
        steps: [{
          operation: opKey,
          entityName,
          entityDef: graph.entities[entityName],
          stepData: parsedQuery[opKey][entityName],
          index: 0
        }]
      }
    }

    // Query mode
    const entityName = Object.keys(parsedQuery).find(k => graph.entities[k])
    if (entityName) {
      return {
        entityName,
        entityDef: graph.entities[entityName],
        steps: []
      }
    }

    return { entityName: null, entityDef: null, steps: [] }
  }, [parsedQuery, graph])

  // Get available variables
  const getVariables = useCallback((stepIndex) => {
    if (!steps) return []
    return steps.slice(0, stepIndex).map(s => s.alias).filter(Boolean)
  }, [steps])

  // Update step data for mutations
  const handleStepDataChange = useCallback((stepIndex, fieldName, value) => {
    if (!parsedQuery) return

    if (parsedQuery.transaction?.steps) {
      const newSteps = [...parsedQuery.transaction.steps]
      const step = { ...newSteps[stepIndex] }
      const op = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
      if (op) {
        const entityName = Object.keys(step[op])[0]
        step[op] = {
          ...step[op],
          [entityName]: {
            ...step[op][entityName],
            data: { ...(step[op][entityName].data || {}), [fieldName]: value }
          }
        }
        newSteps[stepIndex] = step
        dispatch(setQueryText(JSON.stringify({ transaction: { ...parsedQuery.transaction, steps: newSteps } }, null, 2)))
      }
    } else {
      const opKey = ['create', 'update', 'rewrite', 'delete'].find(k => parsedQuery[k])
      if (opKey) {
        const entityName = Object.keys(parsedQuery[opKey])[0]
        const newQuery = {
          [opKey]: {
            [entityName]: {
              ...parsedQuery[opKey][entityName],
              data: { ...(parsedQuery[opKey][entityName].data || {}), [fieldName]: value }
            }
          }
        }
        dispatch(setQueryText(JSON.stringify(newQuery, null, 2)))
      }
    }
  }, [parsedQuery, dispatch])

  // Execute query
  const handleExecute = useCallback(() => {
    dispatch(executeQuery(queryText))
  }, [dispatch, queryText])


  // Mutation mode - show forms
  const MutationModePanel = () => (
    <div className="p-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">
          {operationMode === 'transaction' ? 'Transaction' : operationMode} • {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleExecute}
          disabled={loading}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-white',
            operationMode === 'transaction' ? 'bg-purple-600 hover:bg-purple-700' :
            operationMode === 'create' ? 'bg-green-600 hover:bg-green-700' :
            operationMode === 'update' ? 'bg-yellow-600 hover:bg-yellow-700' :
            'bg-red-600 hover:bg-red-700',
            'disabled:bg-gray-600'
          )}
        >
          {loading ? 'Executing...' : 'Execute'}
        </button>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <MutationFormCard
            key={index}
            entityName={step.entityName}
            entityDef={step.entityDef}
            data={step.stepData?.data || {}}
            onDataChange={(field, value) => handleStepDataChange(index, field, value)}
            colorIndex={index}
            operation={step.operation}
            alias={step.alias}
            variables={getVariables(index)}
            graph={graph}
          />
        ))}
      </div>
    </div>
  )

  // For query mode, show results directly without extra panel
  // ALWAYS show ResultTable - it handles empty state with header + filters
  if (isQueryMode) {
    return (
      <div className="h-full flex flex-col bg-gray-950">
        <div className="flex-1 overflow-auto">
          <ResultTable data={result?.data || result} />
        </div>
      </div>
    )
  }

  // Mutation mode - show forms and results
  return (
    <div className="h-full flex flex-col bg-gray-950">
      <PanelGroup direction="vertical" className="flex-1">
        {/* Request Panel */}
        <Panel id="request" order={1} defaultSize={40} minSize={15}>
          <div className="h-full overflow-auto border-b border-gray-800">
            <MutationModePanel />
          </div>
        </Panel>

        <VerticalResizeHandle />

        {/* Results Panel */}
        <Panel id="results" order={2} defaultSize={60} minSize={30}>
          <div className="h-full overflow-auto p-4 bg-gray-900/30">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Results {result && !result.error && <span className="text-green-400 normal-case">• {Array.isArray(result.data || result) ? (result.data || result).length : 1} rows</span>}
            </h3>
            {result ? (
              <TransactionResult result={result} />
            ) : (
              <div className="text-center text-gray-500 py-8">
                Execute query to see results
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

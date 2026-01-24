import { useMemo, useCallback, useState, useEffect } from 'react'
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
import { setQueryText } from '../store/querySlice'

// Icons
const ChevronIcon = ({ expanded }) => (
  <svg className={clsx('w-4 h-4 transition-transform text-gray-500', expanded && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const CheckIcon = ({ checked }) => (
  <div className={clsx(
    'w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0',
    checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-600'
  )}>
    {checked && '✓'}
  </div>
)

const TypeBadge = ({ type }) => {
  const colors = {
    int: 'text-orange-400',
    string: 'text-green-400',
    bool: 'text-purple-400',
    datetime: 'text-cyan-400',
  }
  return <span className={clsx('text-xs font-mono', colors[type] || 'text-gray-500')}>{type}</span>
}

// Entity list view
function EntityList({ entities, onSelect }) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Entities</span>
      </div>
      <div className="py-1">
        {entities.map(([name, entity]) => {
          const fieldsCount = Object.keys(entity.fields || {}).length
          const relCount = Object.keys(entity.relations || {}).length
          return (
            <div
              key={name}
              onClick={() => onSelect(name)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 cursor-pointer"
            >
              <div className="w-7 h-7 rounded bg-blue-600/20 flex items-center justify-center text-blue-400 font-semibold text-sm flex-shrink-0">
                {name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{name}</div>
                <div className="text-xs text-gray-500">{fieldsCount} fields{relCount > 0 && ` · ${relCount} rel`}</div>
              </div>
              <ChevronIcon />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Field item
function FieldItem({ name, field, path, selected, onToggle }) {
  return (
    <div
      className="flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded cursor-pointer"
      onClick={() => onToggle(path, name)}
    >
      <CheckIcon checked={selected} />
      <span className="text-sm text-gray-200 font-mono flex-1 truncate">{name}</span>
      <TypeBadge type={field.type} />
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
        <div className="mt-1 space-y-1 bg-gray-800/50 p-2 rounded">
          {fields.slice(0, 5).map(([fieldName, field]) => (
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

  // Auto-generate query
  useEffect(() => {
    if (!rootEntity || !graph) return

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

    dispatch(setQueryText(JSON.stringify({ [rootEntity]: buildSelection(rootEntity, rootEntity) }, null, 2)))
  }, [rootEntity, graph, selectedFields, filters, pagination, expandedPaths, dispatch])

  if (!graph) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="animate-spin w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full"></div>
      </div>
    )
  }

  if (!rootEntity) {
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <EntityList entities={entities} onSelect={handleSelectEntity} />
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

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { FieldItem } from '@molecules/FieldItem'
import { EntityList } from '@molecules/EntityList'
import { FilterSection } from '@molecules/FilterSection'
import { PaginationSection } from '@molecules/PaginationSection'
import { RelationItem } from '@molecules/RelationItem'
import { TransactionBuilder } from '@organisms/TransactionBuilder'
import { CreateModeBuilder } from './CreateModeBuilder'
import {
  selectGraph,
  selectEntities,
} from '../../../store/graphSlice'
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
} from '../../../store/builderSlice'
import { setQueryText, selectOperationMode, selectQueryText } from '../../../store/querySlice'
import { parseEditorContent } from '@utils/queryParser'
import { MODE_TITLES } from '@constants/filters'
import { getDefaultValue, isFieldRequired } from '@utils/fieldHelpers'
import type { OperationMode, Field, Relation } from '@/types'

// Generate mutation template for entity
function generateMutationTemplate(
  entityName: string,
  entity: { fields?: Record<string, Field> },
  operationMode: OperationMode
) {
  const fields = entity?.fields || {}
  const fieldEntries = Object.entries(fields)

  // Get required fields (excluding id for create)
  const requiredFields = fieldEntries.filter(([name, field]) => {
    if (name === 'id') return false // id is auto-generated
    return isFieldRequired(field, name)
  })

  // Get sample fields for response (first 5 including id)
  const responseFields = [
    'id',
    ...fieldEntries
      .slice(0, 4)
      .map(([n]) => n)
      .filter((n) => n !== 'id'),
  ]

  if (operationMode === 'create') {
    const data: Record<string, unknown> = {}
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
          response: responseFields,
        },
      },
    }
  }

  if (operationMode === 'update') {
    const data: Record<string, unknown> = {}
    // Add 1-2 sample fields
    fieldEntries.slice(0, 2).forEach(([name, field]) => {
      if (name !== 'id') data[name] = getDefaultValue(field)
    })
    return {
      update: {
        [entityName]: {
          id: 1,
          data,
          response: responseFields,
        },
      },
    }
  }

  if (operationMode === 'rewrite') {
    const data: Record<string, unknown> = {}
    // Add all non-id fields (or first 5)
    fieldEntries.slice(0, 5).forEach(([name, field]) => {
      if (name !== 'id') data[name] = getDefaultValue(field)
    })
    return {
      rewrite: {
        [entityName]: {
          id: 1,
          data,
          response: responseFields,
        },
      },
    }
  }

  if (operationMode === 'delete') {
    return {
      delete: {
        [entityName]: {
          id: 1,
        },
      },
    }
  }

  return null
}

export function SchemaExplorer() {
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

  const entityDef = useMemo(
    () => rootEntity && graph?.entities?.[rootEntity],
    [rootEntity, graph]
  )
  const fields = useMemo(
    () => (entityDef ? Object.entries(entityDef.fields || {}) : []) as Array<[string, Field]>,
    [entityDef]
  )
  const relations = useMemo(
    () =>
      (entityDef ? Object.entries(entityDef.relations || {}) : []) as Array<[string, Relation]>,
    [entityDef]
  )

  const handleSelectEntity = useCallback(
    (name: string) => dispatch(setRootEntity(name)),
    [dispatch]
  )
  const handleBackToList = useCallback(() => dispatch(setRootEntity(null)), [dispatch])
  const handleToggleField = useCallback(
    (path: string, field: string) => dispatch(toggleField({ path, field })),
    [dispatch]
  )
  const handleSelectAll = useCallback(
    (path: string, fields: string[]) => dispatch(selectAllFields({ path, fields })),
    [dispatch]
  )
  const handleClearFields = useCallback((path: string) => dispatch(clearFields(path)), [dispatch])
  const handleToggleExpand = useCallback(
    (path: string) => dispatch(toggleExpanded(path)),
    [dispatch]
  )
  const handleSetFilter = useCallback(
    (filterData: { path: string; field: string; op: string; value: string }) =>
      dispatch(setFilter(filterData)),
    [dispatch]
  )
  const handleSetPagination = useCallback(
    (paginationData: { path: string; limit: number | null; offset: number | null }) =>
      dispatch(setPagination(paginationData)),
    [dispatch]
  )

  // Insert mutation template for entity
  const handleInsertMutationTemplate = useCallback(
    (entityName: string) => {
      const entity = graph?.entities?.[entityName]
      if (!entity) return

      const template = generateMutationTemplate(entityName, entity, operationMode)
      if (template) {
        dispatch(setQueryText(JSON.stringify(template, null, 2)))
      }
    },
    [graph, operationMode, dispatch]
  )

  // Build query from builder state (for query mode only)
  // This generates query when user clicks checkboxes in the left panel
  const buildQueryFromBuilder = useCallback(() => {
    if (!rootEntity || !graph) return null

    const buildSelection = (entityName: string, path: string): Record<string, unknown> => {
      const entityDef = graph.entities[entityName]
      if (!entityDef) return {}

      const selection: Record<string, unknown> = {}
      const pathFields = selectedFields[path] || []
      const pathFilters = filters[path] || {}
      const pathPagination = pagination[path] || {}

      if (pathFields.length > 0) selection.fields = pathFields
      if (Object.keys(pathFilters).length > 0) selection.filters = pathFilters
      // Default limit 100 for root entity, explicit limit for others
      if (pathPagination.limit) {
        selection.limit = pathPagination.limit
      } else if (path === entityName) {
        selection.limit = 100 // Default limit for root
      }
      if (pathPagination.offset) selection.offset = pathPagination.offset

      const nestedRelations: Record<string, unknown> = {}
      const entityRelations = (entityDef.relations || {}) as Record<string, Relation>
      for (const [relName, relDef] of Object.entries(entityRelations)) {
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
  const handleUpdateQueryText = useCallback(
    (newText: string) => {
      dispatch(setQueryText(newText))
    },
    [dispatch]
  )

  // Get current entity from editor for create mode
  const createModeEntity = useMemo(() => {
    if (operationMode !== 'create' || !activeEntityFromEditor) return null
    return graph?.entities?.[activeEntityFromEditor] || null
  }, [operationMode, activeEntityFromEditor, graph])

  // Update query text when builder state changes (only in query mode when using builder)
  const prevBuilderStateRef = useRef<string | null>(null)
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
  }, [
    selectedFields,
    filters,
    pagination,
    buildQueryFromBuilder,
    dispatch,
    isMutationMode,
    isTransactionMode,
    rootEntity,
  ])

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
    const handleSelectMutationEntity = (entityName: string) => {
      handleInsertMutationTemplate(entityName)
      setShowMutationEntityList(false)
    }

    // Show entity list if explicitly requested OR no entity in query
    const shouldShowEntityList = showMutationEntityList || !activeEntityFromEditor

    // Create mode with entity selected - show field builder
    if (
      operationMode === 'create' &&
      activeEntityFromEditor &&
      createModeEntity &&
      !shouldShowEntityList
    ) {
      return (
        <div className="h-full flex flex-col bg-gray-900">
          <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
            <button
              onClick={() => setShowMutationEntityList(true)}
              className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
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
            {MODE_TITLES[operationMode as keyof typeof MODE_TITLES]} - Select Entity
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
        <button
          onClick={handleBackToList}
          className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
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
            <button
              onClick={() => handleSelectAll(rootEntity, fields.map(([n]) => n))}
              className="text-blue-400 hover:text-blue-300"
            >
              all
            </button>
            <span className="text-gray-600">·</span>
            <button
              onClick={() => handleClearFields(rootEntity)}
              className="text-gray-500 hover:text-gray-300"
            >
              clear
            </button>
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
        <FilterSection
          path={rootEntity}
          fields={fields}
          filters={filters[rootEntity] || {}}
          onSetFilter={handleSetFilter}
        />

        {/* Pagination */}
        <PaginationSection
          path={rootEntity}
          pagination={pagination[rootEntity]}
          onSetPagination={handleSetPagination}
        />

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

export default SchemaExplorer

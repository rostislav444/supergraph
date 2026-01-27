import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState, BuilderState } from './types'

/**
 * Query Builder state management
 * Manages the visual query builder UI state
 */

const initialState: BuilderState = {
  // Currently selected entity in the builder
  rootEntity: null,

  // Selected fields for each entity path
  // { "Person": ["id", "first_name"], "Person.owned_properties": ["id", "status"] }
  selectedFields: {},

  // Expanded entities in the tree
  expandedPaths: {},

  // Filters for each entity path
  // { "Person": { "id__eq": 1 }, "Person.owned_properties": { "status__eq": "active" } }
  filters: {},

  // Order for each entity path
  order: {},

  // Pagination for each entity path
  pagination: {},

  // Active documentation panel content
  documentation: null,

  // Flag to indicate change source (prevents infinite sync loop)
  // 'builder' = change from clicking checkboxes, 'editor' = change from typing in editor
  syncSource: null,
}

const builderSlice = createSlice({
  name: 'builder',
  initialState,
  reducers: {
    setRootEntity: (state, action: PayloadAction<string | null>) => {
      state.rootEntity = action.payload
      // Reset selections when changing root
      state.selectedFields = {}
      state.expandedPaths = {}
      state.filters = {}
      state.order = {}
      state.pagination = {}
    },

    toggleField: (state, action: PayloadAction<{ path: string; field: string }>) => {
      const { path, field } = action.payload
      if (!state.selectedFields[path]) {
        state.selectedFields[path] = []
      }
      const idx = state.selectedFields[path].indexOf(field)
      if (idx === -1) {
        state.selectedFields[path].push(field)
      } else {
        state.selectedFields[path].splice(idx, 1)
      }
      state.syncSource = 'builder'
    },

    selectAllFields: (state, action: PayloadAction<{ path: string; fields: string[] }>) => {
      const { path, fields } = action.payload
      state.selectedFields[path] = [...fields]
      state.syncSource = 'builder'
    },

    clearFields: (state, action: PayloadAction<string>) => {
      const path = action.payload
      state.selectedFields[path] = []
      state.syncSource = 'builder'
    },

    toggleExpanded: (state, action: PayloadAction<string>) => {
      const path = action.payload
      state.expandedPaths[path] = !state.expandedPaths[path]
    },

    setFilter: (
      state,
      action: PayloadAction<{ path: string; field: string; op: string; value: string | number | null }>
    ) => {
      const { path, field, op, value } = action.payload
      if (!state.filters[path]) {
        state.filters[path] = {}
      }
      const key = `${field}__${op}`
      if (value === null || value === undefined || value === '') {
        delete state.filters[path][key]
      } else {
        state.filters[path][key] = value
      }
    },

    removeFilter: (state, action: PayloadAction<{ path: string; key: string }>) => {
      const { path, key } = action.payload
      if (state.filters[path]) {
        delete state.filters[path][key]
      }
    },

    setOrder: (state, action: PayloadAction<{ path: string; order: string[] }>) => {
      const { path, order } = action.payload
      state.order[path] = order
    },

    setPagination: (
      state,
      action: PayloadAction<{ path: string; limit: number | null; offset: number | null }>
    ) => {
      const { path, limit, offset } = action.payload
      state.pagination[path] = { limit, offset }
    },

    setDocumentation: (state, action: PayloadAction<unknown>) => {
      state.documentation = action.payload
    },

    clearDocumentation: (state) => {
      state.documentation = null
    },

    // Reset entire builder
    resetBuilder: () => initialState,

    // Load query into builder (parse JSON query)
    loadQueryIntoBuilder: (state, action: PayloadAction<Record<string, unknown>>) => {
      const query = action.payload
      // This will be implemented to parse a query and populate the builder
      // For now, just set root entity
      if (query.entity) {
        state.rootEntity = query.entity as string
      } else {
        // New format: first key is entity
        const entities = Object.keys(query).filter(
          (k) => !['action', 'query', 'create', 'update', 'delete', 'rewrite', 'transaction'].includes(k)
        )
        if (entities.length > 0) {
          state.rootEntity = entities[0]
        }
      }
    },

    // Sync builder state from parsed editor content
    syncFromEditor: (
      state,
      action: PayloadAction<{
        rootEntity?: string | null
        selectedFields?: Record<string, string[]>
        expandedPaths?: Record<string, boolean>
        filters?: Record<string, Record<string, string | number>>
      }>
    ) => {
      const { rootEntity, selectedFields, expandedPaths, filters } = action.payload
      if (rootEntity !== undefined) state.rootEntity = rootEntity
      if (selectedFields !== undefined) state.selectedFields = selectedFields
      if (expandedPaths !== undefined) state.expandedPaths = { ...state.expandedPaths, ...expandedPaths }
      if (filters !== undefined) state.filters = filters
      state.syncSource = 'editor'
    },

    // Clear sync source (call after processing)
    clearSyncSource: (state) => {
      state.syncSource = null
    },
  },
})

export const {
  setRootEntity,
  toggleField,
  selectAllFields,
  clearFields,
  toggleExpanded,
  setFilter,
  removeFilter,
  setOrder,
  setPagination,
  setDocumentation,
  clearDocumentation,
  resetBuilder,
  loadQueryIntoBuilder,
  syncFromEditor,
  clearSyncSource,
} = builderSlice.actions

// Selectors
export const selectRootEntity = (state: RootState): string | null => state.builder.rootEntity
export const selectSelectedFields = (state: RootState): Record<string, string[]> => state.builder.selectedFields
export const selectExpandedPaths = (state: RootState): Record<string, boolean> => state.builder.expandedPaths
export const selectFilters = (state: RootState): Record<string, Record<string, string | number>> => state.builder.filters
export const selectOrder = (state: RootState): Record<string, string[]> => state.builder.order
export const selectPagination = (
  state: RootState
): Record<string, { limit?: number | null; offset?: number | null }> => state.builder.pagination
export const selectDocumentation = (state: RootState): unknown => state.builder.documentation
export const selectSyncSource = (state: RootState): 'builder' | 'editor' | null => state.builder.syncSource

// Build query from builder state
export const selectBuiltQuery = (state: RootState): Record<string, unknown> | null => {
  const { rootEntity, selectedFields, filters, order, pagination } = state.builder
  const graph = state.graph.data

  if (!rootEntity || !graph) return null

  const buildSelection = (entityName: string, path: string, depth = 0): Record<string, unknown> | null => {
    const entityDef = graph.entities[entityName]
    if (!entityDef) return null

    const fields = selectedFields[path] || []
    const entityFilters = filters[path] || {}
    const entityOrder = order[path] || []
    const entityPagination = pagination[path] || {}

    const selection: Record<string, unknown> = {}

    if (fields.length > 0) {
      selection.fields = fields
    }

    if (Object.keys(entityFilters).length > 0) {
      selection.filters = entityFilters
    }

    if (entityOrder.length > 0) {
      selection.order = entityOrder
    }

    if (entityPagination.limit) {
      selection.limit = entityPagination.limit
    }

    if (entityPagination.offset) {
      selection.offset = entityPagination.offset
    }

    // Check for nested relations
    const relations = entityDef.relations || {}
    const nestedRelations: Record<string, unknown> = {}

    for (const [relName, relDef] of Object.entries(relations)) {
      const relPath = `${path}.${relName}`
      const relFields = selectedFields[relPath]

      if (relFields && relFields.length > 0) {
        const targetEntity = relDef.target
        nestedRelations[relName] = buildSelection(targetEntity, relPath, depth + 1)
      }
    }

    if (Object.keys(nestedRelations).length > 0) {
      selection.relations = nestedRelations
    }

    return selection
  }

  const selection = buildSelection(rootEntity, rootEntity)

  // Return in new format
  return {
    [rootEntity]: selection,
  }
}

export default builderSlice.reducer

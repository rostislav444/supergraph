import { createSlice } from '@reduxjs/toolkit'

/**
 * Query Builder state management
 * Manages the visual query builder UI state
 */

const initialState = {
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
}

const builderSlice = createSlice({
  name: 'builder',
  initialState,
  reducers: {
    setRootEntity: (state, action) => {
      state.rootEntity = action.payload
      // Reset selections when changing root
      state.selectedFields = {}
      state.expandedPaths = {}
      state.filters = {}
      state.order = {}
      state.pagination = {}
    },

    toggleField: (state, action) => {
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
    },

    selectAllFields: (state, action) => {
      const { path, fields } = action.payload
      state.selectedFields[path] = [...fields]
    },

    clearFields: (state, action) => {
      const path = action.payload
      state.selectedFields[path] = []
    },

    toggleExpanded: (state, action) => {
      const path = action.payload
      state.expandedPaths[path] = !state.expandedPaths[path]
    },

    setFilter: (state, action) => {
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

    removeFilter: (state, action) => {
      const { path, key } = action.payload
      if (state.filters[path]) {
        delete state.filters[path][key]
      }
    },

    setOrder: (state, action) => {
      const { path, order } = action.payload
      state.order[path] = order
    },

    setPagination: (state, action) => {
      const { path, limit, offset } = action.payload
      state.pagination[path] = { limit, offset }
    },

    setDocumentation: (state, action) => {
      state.documentation = action.payload
    },

    clearDocumentation: (state) => {
      state.documentation = null
    },

    // Reset entire builder
    resetBuilder: () => initialState,

    // Load query into builder (parse JSON query)
    loadQueryIntoBuilder: (state, action) => {
      const query = action.payload
      // This will be implemented to parse a query and populate the builder
      // For now, just set root entity
      if (query.entity) {
        state.rootEntity = query.entity
      } else {
        // New format: first key is entity
        const entities = Object.keys(query).filter(k =>
          !['action', 'query', 'create', 'update', 'delete', 'rewrite', 'transaction'].includes(k)
        )
        if (entities.length > 0) {
          state.rootEntity = entities[0]
        }
      }
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
} = builderSlice.actions

// Selectors
export const selectRootEntity = (state) => state.builder.rootEntity
export const selectSelectedFields = (state) => state.builder.selectedFields
export const selectExpandedPaths = (state) => state.builder.expandedPaths
export const selectFilters = (state) => state.builder.filters
export const selectOrder = (state) => state.builder.order
export const selectPagination = (state) => state.builder.pagination
export const selectDocumentation = (state) => state.builder.documentation

// Build query from builder state
export const selectBuiltQuery = (state) => {
  const { rootEntity, selectedFields, filters, order, pagination } = state.builder
  const graph = state.graph.data

  if (!rootEntity || !graph) return null

  const buildSelection = (entityName, path, depth = 0) => {
    const entityDef = graph.entities[entityName]
    if (!entityDef) return null

    const fields = selectedFields[path] || []
    const entityFilters = filters[path] || {}
    const entityOrder = order[path] || []
    const entityPagination = pagination[path] || {}

    const selection = {}

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
    const nestedRelations = {}

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
    [rootEntity]: selection
  }
}

export default builderSlice.reducer

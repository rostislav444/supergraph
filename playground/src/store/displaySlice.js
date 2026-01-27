import { createSlice } from '@reduxjs/toolkit'

/**
 * Display state - snapshot of builder state at execution time
 * Provides isolation between query builder (left panel) and results display (right panel)
 *
 * Key concepts:
 * - `snapshot` - captured when Execute is clicked, used by table to show columns
 * - `tableFilters` - persistent filters stored in Redux (not local state)
 * - Filters are reset when entity changes
 */

const initialState = {
  // Snapshot taken when Execute is clicked
  snapshot: {
    entity: null,           // Root entity name at execution time
    selectedFields: {},     // Copy of builder.selectedFields at execution time
    columnDefinitions: {},  // { fieldName: { type, enum_values, nullable } } from schema
  },

  // Table-specific state (persisted in Redux, not local useState)
  tableFilters: {},        // { fieldName: { value, mode } }
  tablePagination: {
    pageSize: 100,
    currentPage: 1,
  },

  // Track last entity to detect changes and reset filters
  lastEntity: null,

  // Last successful columns (from response with data > 0)
  // Used when current response is empty (0 results)
  lastSuccessfulColumns: [],

  // Flag to track if query has been executed at least once
  hasExecuted: false,
}

const displaySlice = createSlice({
  name: 'display',
  initialState,
  reducers: {
    /**
     * Take snapshot of builder state when Execute is clicked
     * This is called from App.jsx before executeQuery()
     *
     * @param {Object} payload
     * @param {string} payload.entity - Root entity name
     * @param {Object} payload.selectedFields - Copy of builder.selectedFields
     * @param {Object} payload.columnDefinitions - Field definitions from schema
     */
    captureSnapshot: (state, action) => {
      const { entity, selectedFields, columnDefinitions } = action.payload

      // Reset filters and lastSuccessfulColumns if entity changed
      if (entity !== state.lastEntity) {
        state.tableFilters = {}
        state.tablePagination = { pageSize: 100, currentPage: 1 }
        state.lastSuccessfulColumns = []
        state.lastEntity = entity
      }

      state.snapshot = {
        entity,
        selectedFields,
        columnDefinitions,
      }
      state.hasExecuted = true
    },

    /**
     * Save columns from successful response (with data > 0)
     * Used as fallback when current response is empty
     *
     * @param {Object} payload
     * @param {string[]} payload.columns - Column names from response
     */
    setLastSuccessfulColumns: (state, action) => {
      const { columns } = action.payload
      if (columns && columns.length > 0) {
        state.lastSuccessfulColumns = columns
      }
    },

    /**
     * Update table filter
     *
     * @param {Object} payload
     * @param {string} payload.field - Field name to filter
     * @param {string|number} payload.value - Filter value
     * @param {string} payload.mode - Filter mode (contains, exact, eq, gt, etc.)
     */
    setTableFilter: (state, action) => {
      const { field, value, mode } = action.payload
      if (value === null || value === undefined || value === '') {
        delete state.tableFilters[field]
      } else {
        state.tableFilters[field] = { value, mode: mode || 'contains' }
      }
      // Reset to first page when filter changes
      state.tablePagination.currentPage = 1
    },

    /**
     * Clear all table filters
     */
    clearTableFilters: (state) => {
      state.tableFilters = {}
      state.tablePagination.currentPage = 1
    },

    /**
     * Remove filters for fields that are no longer selected
     * Called when selectedFields changes
     *
     * @param {Object} payload
     * @param {string[]} payload.activeFields - List of currently selected field names
     */
    cleanupInactiveFilters: (state, action) => {
      const { activeFields } = action.payload
      const activeSet = new Set(activeFields)

      // Remove filters for fields not in activeFields
      for (const field of Object.keys(state.tableFilters)) {
        if (!activeSet.has(field)) {
          delete state.tableFilters[field]
        }
      }
    },

    /**
     * Update pagination
     *
     * @param {Object} payload
     * @param {number} [payload.pageSize] - Page size
     * @param {number} [payload.currentPage] - Current page number
     */
    setTablePagination: (state, action) => {
      const { pageSize, currentPage } = action.payload
      if (pageSize !== undefined) state.tablePagination.pageSize = pageSize
      if (currentPage !== undefined) state.tablePagination.currentPage = currentPage
    },

    /**
     * Reset display state (e.g., when switching modes or clearing)
     */
    resetDisplay: () => initialState,
  },
})

export const {
  captureSnapshot,
  setLastSuccessfulColumns,
  setTableFilter,
  clearTableFilters,
  cleanupInactiveFilters,
  setTablePagination,
  resetDisplay,
} = displaySlice.actions

// Selectors
export const selectDisplaySnapshot = (state) => state.display.snapshot
export const selectDisplayEntity = (state) => state.display.snapshot.entity
export const selectDisplaySelectedFields = (state) => state.display.snapshot.selectedFields
export const selectDisplayColumnDefinitions = (state) => state.display.snapshot.columnDefinitions
export const selectTableFilters = (state) => state.display.tableFilters
export const selectTablePagination = (state) => state.display.tablePagination
export const selectLastSuccessfulColumns = (state) => state.display.lastSuccessfulColumns
export const selectHasExecuted = (state) => state.display.hasExecuted

export default displaySlice.reducer

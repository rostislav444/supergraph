import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { TableFilter } from '@/types'
import type { RootState, DisplayState, DisplaySnapshot } from './types'

/**
 * Display state - snapshot of builder state at execution time
 * Provides isolation between query builder (left panel) and results display (right panel)
 *
 * Key concepts:
 * - `snapshot` - captured when Execute is clicked, used by table to show columns
 * - `tableFilters` - persistent filters stored in Redux (not local state)
 * - Filters are reset when entity changes
 */

const initialState: DisplayState = {
  // Snapshot taken when Execute is clicked
  snapshot: {
    entity: null, // Root entity name at execution time
    selectedFields: {}, // Copy of builder.selectedFields at execution time
    columnDefinitions: {}, // { fieldName: { type, enum_values, nullable } } from schema
  },

  // Table-specific state (persisted in Redux, not local useState)
  tableFilters: {}, // { fieldName: { value, mode } }
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
     */
    captureSnapshot: (
      state,
      action: PayloadAction<{
        entity: string | null
        selectedFields: Record<string, string[]>
        columnDefinitions: Record<string, { type: string; enum_values?: string[]; nullable?: boolean }>
      }>
    ) => {
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
     */
    setLastSuccessfulColumns: (state, action: PayloadAction<{ columns: string[] }>) => {
      const { columns } = action.payload
      if (columns && columns.length > 0) {
        state.lastSuccessfulColumns = columns
      }
    },

    /**
     * Update table filter
     */
    setTableFilter: (
      state,
      action: PayloadAction<{ field: string; value: string | number | null; mode?: string }>
    ) => {
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
     */
    cleanupInactiveFilters: (state, action: PayloadAction<{ activeFields: string[] }>) => {
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
     */
    setTablePagination: (state, action: PayloadAction<{ pageSize?: number; currentPage?: number }>) => {
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
export const selectDisplaySnapshot = (state: RootState): DisplaySnapshot => state.display.snapshot
export const selectDisplayEntity = (state: RootState): string | null => state.display.snapshot.entity
export const selectDisplaySelectedFields = (state: RootState): Record<string, string[]> =>
  state.display.snapshot.selectedFields
export const selectDisplayColumnDefinitions = (
  state: RootState
): Record<string, { type: string; enum_values?: string[]; nullable?: boolean }> =>
  state.display.snapshot.columnDefinitions
export const selectTableFilters = (state: RootState): Record<string, TableFilter> => state.display.tableFilters
export const selectTablePagination = (state: RootState): { pageSize: number; currentPage: number } =>
  state.display.tablePagination
export const selectLastSuccessfulColumns = (state: RootState): string[] => state.display.lastSuccessfulColumns
export const selectHasExecuted = (state: RootState): boolean => state.display.hasExecuted

export default displaySlice.reducer

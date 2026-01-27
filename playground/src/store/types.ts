import type { Graph, Entity, OperationMode, TableFilter } from '@/types'

// Graph slice state
export interface GraphState {
  data: Graph | null
  selectedEntity: string | null
  loading: boolean
  error: string | null
  connected: boolean
}

// Query slice state
export interface QueryHistoryEntry {
  query: string
  result: unknown
  timestamp: number
}

export interface QueryState {
  text: string
  result: unknown
  error: unknown
  loading: boolean
  history: QueryHistoryEntry[]
  activeTab: string
  operationMode: OperationMode
  savedQueries: Record<string, string>
}

// Builder slice state
export interface BuilderState {
  rootEntity: string | null
  selectedFields: Record<string, string[]>
  expandedPaths: Record<string, boolean>
  filters: Record<string, Record<string, string | number>>
  order: Record<string, string[]>
  pagination: Record<string, { limit?: number | null; offset?: number | null }>
  documentation: unknown
  syncSource: 'builder' | 'editor' | null
}

// Display slice state
export interface DisplaySnapshot {
  entity: string | null
  selectedFields: Record<string, string[]>
  columnDefinitions: Record<string, { type: string; enum_values?: string[]; nullable?: boolean }>
}

export interface DisplayState {
  snapshot: DisplaySnapshot
  tableFilters: Record<string, TableFilter>
  tablePagination: {
    pageSize: number
    currentPage: number
  }
  lastEntity: string | null
  lastSuccessfulColumns: string[]
  hasExecuted: boolean
}

// Root state
export interface RootState {
  graph: GraphState
  query: QueryState
  builder: BuilderState
  display: DisplayState
}

// Config from window
declare global {
  interface Window {
    SUPERGRAPH_CONFIG?: {
      graphUrl?: string
      apiUrl?: string
    }
  }
}

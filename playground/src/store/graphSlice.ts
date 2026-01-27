import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Graph, Entity } from '@/types'
import type { RootState, GraphState } from './types'

// Use config injected by gateway, fallback to defaults
const config = window.SUPERGRAPH_CONFIG || {}
const GRAPH_URL = config.graphUrl || '/__graph'

export const fetchGraph = createAsyncThunk<Graph, void, { rejectValue: string }>(
  'graph/fetchGraph',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch(GRAPH_URL)
      if (!response.ok) {
        throw new Error('Failed to fetch graph')
      }
      return await response.json()
    } catch (error) {
      return rejectWithValue((error as Error).message)
    }
  }
)

const initialState: GraphState = {
  data: null,
  selectedEntity: null,
  loading: false,
  error: null,
  connected: false,
}

const graphSlice = createSlice({
  name: 'graph',
  initialState,
  reducers: {
    selectEntity: (state, action: PayloadAction<string | null>) => {
      state.selectedEntity = action.payload
    },
    clearSelection: (state) => {
      state.selectedEntity = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGraph.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchGraph.fulfilled, (state, action) => {
        state.loading = false
        state.data = action.payload
        state.connected = true
      })
      .addCase(fetchGraph.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'Unknown error'
        state.connected = false
      })
  },
})

export const { selectEntity, clearSelection } = graphSlice.actions

// Selectors
export const selectGraph = (state: RootState): Graph | null => state.graph.data
export const selectSelectedEntity = (state: RootState): string | null => state.graph.selectedEntity
export const selectGraphLoading = (state: RootState): boolean => state.graph.loading
export const selectGraphError = (state: RootState): string | null => state.graph.error
export const selectConnected = (state: RootState): boolean => state.graph.connected

// Memoized selectors for derived data
export const selectEntities = (state: RootState): Array<[string, Entity]> => {
  const graph = state.graph.data
  if (!graph?.entities) return []
  // Sort entities alphabetically by name
  return Object.entries(graph.entities).sort((a, b) => a[0].localeCompare(b[0]))
}

export const selectServices = (state: RootState): Array<[string, unknown]> => {
  const graph = state.graph.data
  return graph?.services ? Object.entries(graph.services) : []
}

export const selectEntityDetails = (state: RootState): Entity | null => {
  const { data, selectedEntity } = state.graph
  if (!data || !selectedEntity) return null
  return data.entities?.[selectedEntity] || null
}

export default graphSlice.reducer

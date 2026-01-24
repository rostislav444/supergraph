import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API_BASE = '/api'

export const fetchGraph = createAsyncThunk(
  'graph/fetchGraph',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE}/__graph`)
      if (!response.ok) {
        throw new Error('Failed to fetch graph')
      }
      return await response.json()
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
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
    selectEntity: (state, action) => {
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
        state.error = action.payload
        state.connected = false
      })
  },
})

export const { selectEntity, clearSelection } = graphSlice.actions

// Selectors
export const selectGraph = (state) => state.graph.data
export const selectSelectedEntity = (state) => state.graph.selectedEntity
export const selectGraphLoading = (state) => state.graph.loading
export const selectGraphError = (state) => state.graph.error
export const selectConnected = (state) => state.graph.connected

// Memoized selectors for derived data
export const selectEntities = (state) => {
  const graph = state.graph.data
  return graph?.entities ? Object.entries(graph.entities) : []
}

export const selectServices = (state) => {
  const graph = state.graph.data
  return graph?.services ? Object.entries(graph.services) : []
}

export const selectEntityDetails = (state) => {
  const { data, selectedEntity } = state.graph
  if (!data || !selectedEntity) return null
  return data.entities?.[selectedEntity] || null
}

export default graphSlice.reducer

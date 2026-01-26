import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API_URL = import.meta.env.VITE_API_URL || ''

export const fetchGraph = createAsyncThunk(
  'graph/fetch',
  async () => {
    const response = await fetch(`${API_URL}/__graph`)
    if (!response.ok) throw new Error('Failed to fetch graph')
    return response.json()
  }
)

const graphSlice = createSlice({
  name: 'graph',
  initialState: {
    data: null,
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGraph.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchGraph.fulfilled, (state, action) => {
        state.loading = false
        state.data = action.payload
      })
      .addCase(fetchGraph.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
  },
})

export default graphSlice.reducer

// Selectors
export const selectGraph = (state) => state.graph.data
export const selectGraphLoading = (state) => state.graph.loading
export const selectGraphError = (state) => state.graph.error
export const selectEntities = (state) => state.graph.data?.entities || {}
export const selectServices = (state) => state.graph.data?.services || {}

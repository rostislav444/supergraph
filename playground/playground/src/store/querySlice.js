import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API_URL = import.meta.env.VITE_API_URL || ''

export const executeQuery = createAsyncThunk(
  'query/execute',
  async (query) => {
    const response = await fetch(`${API_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || 'Query failed')
    }
    return data
  }
)

const DEFAULT_QUERY = {
  action: 'query',
  entity: 'Person',
  filters: { id__eq: 1 },
  select: {
    fields: ['id', 'first_name', 'last_name'],
    relations: {
      owned_properties: {
        fields: ['id', 'subject_id', 'object_id', 'status'],
        filters: { status__eq: 'active' },
        limit: 50,
        relations: {
          property: {
            fields: ['id', 'name', 'rc_id'],
          },
        },
      },
    },
  },
}

const querySlice = createSlice({
  name: 'query',
  initialState: {
    queryText: JSON.stringify(DEFAULT_QUERY, null, 2),
    result: null,
    loading: false,
    error: null,
    history: [],
  },
  reducers: {
    setQueryText: (state, action) => {
      state.queryText = action.payload
    },
    clearResult: (state) => {
      state.result = null
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(executeQuery.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(executeQuery.fulfilled, (state, action) => {
        state.loading = false
        state.result = action.payload
        state.history.unshift({
          query: state.queryText,
          result: action.payload,
          timestamp: Date.now(),
        })
        if (state.history.length > 20) state.history.pop()
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
  },
})

export const { setQueryText, clearResult } = querySlice.actions
export default querySlice.reducer

// Selectors
export const selectQueryText = (state) => state.query.queryText
export const selectQueryResult = (state) => state.query.result
export const selectQueryLoading = (state) => state.query.loading
export const selectQueryError = (state) => state.query.error
export const selectQueryHistory = (state) => state.query.history

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API_BASE = '/api'

const DEFAULT_QUERY = {
  action: "query",
  entity: "Person",
  filters: { "id__eq": 1 },
  select: {
    fields: ["id", "first_name", "last_name"],
    relations: {
      owned_properties: {
        fields: ["id", "subject_id", "object_id", "status"],
        filters: { "status__eq": "active" },
        relations: {
          property: {
            fields: ["id", "name", "rc_id"]
          }
        }
      }
    }
  }
}

export const executeQuery = createAsyncThunk(
  'query/execute',
  async (queryText, { rejectWithValue }) => {
    try {
      const parsed = JSON.parse(queryText)
      const response = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      })

      const data = await response.json()

      if (!response.ok) {
        return rejectWithValue(data)
      }

      return data
    } catch (error) {
      return rejectWithValue({
        error: 'Invalid JSON or network error',
        message: error.message
      })
    }
  }
)

const initialState = {
  text: JSON.stringify(DEFAULT_QUERY, null, 2),
  result: null,
  error: null,
  loading: false,
  history: [],
  activeTab: 'query',
}

const querySlice = createSlice({
  name: 'query',
  initialState,
  reducers: {
    setQueryText: (state, action) => {
      state.text = action.payload
    },
    setActiveTab: (state, action) => {
      state.activeTab = action.payload
    },
    loadExample: (state, action) => {
      state.text = JSON.stringify(action.payload, null, 2)
    },
    formatQuery: (state) => {
      try {
        const parsed = JSON.parse(state.text)
        state.text = JSON.stringify(parsed, null, 2)
      } catch (e) {
        // Invalid JSON, don't format
      }
    },
    clearResult: (state) => {
      state.result = null
      state.error = null
    },
    addToHistory: (state, action) => {
      const entry = {
        query: action.payload.query,
        result: action.payload.result,
        timestamp: Date.now(),
      }
      state.history = [entry, ...state.history.slice(0, 19)] // Keep last 20
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(executeQuery.pending, (state) => {
        state.loading = true
        state.error = null
        state.result = null
      })
      .addCase(executeQuery.fulfilled, (state, action) => {
        state.loading = false
        state.result = action.payload
        // Add to history
        state.history = [
          {
            query: state.text,
            result: action.payload,
            timestamp: Date.now()
          },
          ...state.history.slice(0, 19)
        ]
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const {
  setQueryText,
  setActiveTab,
  loadExample,
  formatQuery,
  clearResult,
  addToHistory
} = querySlice.actions

// Selectors
export const selectQueryText = (state) => state.query.text
export const selectResult = (state) => state.query.result
export const selectQueryError = (state) => state.query.error
export const selectQueryLoading = (state) => state.query.loading
export const selectActiveTab = (state) => state.query.activeTab
export const selectHistory = (state) => state.query.history

export default querySlice.reducer

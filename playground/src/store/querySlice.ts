import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { OperationMode } from '@/types'
import type { RootState, QueryState, QueryHistoryEntry } from './types'

// Use config injected by gateway, fallback to defaults
const config = window.SUPERGRAPH_CONFIG || {}
const API_URL = config.apiUrl || '/query'

// LocalStorage keys for persisting queries per mode
const STORAGE_KEY = 'supergraph_queries'

// Load saved queries from localStorage
function loadSavedQueries(): Record<string, string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

// Save queries to localStorage
function saveQueries(queries: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries))
  } catch {
    // Ignore storage errors
  }
}

// Default examples (used only when no saved query exists)
const DEFAULT_EXAMPLES: Record<string, unknown> = {
  query: {
    Person: {
      fields: ['id', 'first_name', 'last_name'],
      limit: 10,
    },
  },
  create: null, // Will show empty editor, user selects entity from list
  update: null,
  rewrite: null,
  delete: null,
  transaction: {
    transaction: {
      steps: [],
      on_error: 'rollback',
    },
  },
}

// Get initial text for a mode (saved or default)
function getInitialText(mode: string): string {
  const saved = loadSavedQueries()
  if (saved[mode]) {
    return saved[mode]
  }
  const example = DEFAULT_EXAMPLES[mode]
  return example ? JSON.stringify(example, null, 2) : ''
}

// Extract entity name from query text
function extractEntityFromText(text: string): string | null {
  try {
    const parsed = JSON.parse(text)

    // Check for mutation wrappers first
    for (const op of ['create', 'update', 'rewrite', 'delete']) {
      if (parsed[op]) {
        return Object.keys(parsed[op])[0]
      }
    }

    // Query mode - find capitalized key
    const knownKeys = ['action', 'query', 'create', 'update', 'delete', 'rewrite', 'transaction']
    return Object.keys(parsed).find((k) => !knownKeys.includes(k) && k[0] === k[0].toUpperCase()) || null
  } catch {
    return null
  }
}

// Extract entity from saved query text
function extractEntityFromSaved(savedText: string | undefined): string | null {
  if (!savedText) return null
  return extractEntityFromText(savedText)
}

// Generate a basic template for entity in given mode
function generateTemplateForEntity(entityName: string | null, mode: string): string {
  if (!entityName) return ''

  if (mode === 'query') {
    return JSON.stringify(
      {
        [entityName]: {
          fields: ['id'],
          limit: 10,
        },
      },
      null,
      2
    )
  }

  if (mode === 'create') {
    return JSON.stringify(
      {
        create: {
          [entityName]: {
            data: {},
            response: ['id'],
          },
        },
      },
      null,
      2
    )
  }

  if (mode === 'update') {
    return JSON.stringify(
      {
        update: {
          [entityName]: {
            id: 1,
            data: {},
            response: ['id'],
          },
        },
      },
      null,
      2
    )
  }

  if (mode === 'rewrite') {
    return JSON.stringify(
      {
        rewrite: {
          [entityName]: {
            id: 1,
            data: {},
            response: ['id'],
          },
        },
      },
      null,
      2
    )
  }

  if (mode === 'delete') {
    return JSON.stringify(
      {
        delete: {
          [entityName]: {
            id: 1,
          },
        },
      },
      null,
      2
    )
  }

  if (mode === 'transaction') {
    return JSON.stringify(
      {
        transaction: {
          steps: [
            {
              create: {
                [entityName]: {
                  data: {},
                  response: ['id'],
                },
              },
              as: '$' + entityName.toLowerCase(),
            },
          ],
          on_error: 'rollback',
        },
      },
      null,
      2
    )
  }

  return ''
}

export const executeQuery = createAsyncThunk<unknown, string, { rejectValue: unknown }>(
  'query/execute',
  async (queryText, { rejectWithValue }) => {
    try {
      const parsed = JSON.parse(queryText)
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })

      const data = await response.json()

      if (!response.ok) {
        return rejectWithValue(data)
      }

      return data
    } catch (error) {
      return rejectWithValue({
        error: 'Invalid JSON or network error',
        message: (error as Error).message,
      })
    }
  }
)

const initialState: QueryState = {
  text: getInitialText('query'),
  result: null,
  error: null,
  loading: false,
  history: [],
  activeTab: 'query',
  operationMode: 'query',
  savedQueries: loadSavedQueries(),
}

const querySlice = createSlice({
  name: 'query',
  initialState,
  reducers: {
    setQueryText: (state, action: PayloadAction<string>) => {
      state.text = action.payload
      // Save to localStorage for current mode
      state.savedQueries[state.operationMode] = action.payload
      saveQueries(state.savedQueries)
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTab = action.payload
    },
    setOperationMode: (state, action: PayloadAction<OperationMode>) => {
      const newMode = action.payload
      const currentMode = state.operationMode

      // Don't do anything if same mode
      if (newMode === currentMode) return

      // Save current query before switching
      state.savedQueries[currentMode] = state.text
      saveQueries(state.savedQueries)

      // Extract current entity from editor
      const currentEntity = extractEntityFromText(state.text)

      // Switch mode
      state.operationMode = newMode

      // Check if we have a saved query for the new mode
      const savedQuery = state.savedQueries[newMode]
      const savedEntity = extractEntityFromSaved(savedQuery)

      // If saved query exists and has the same entity, use it
      if (savedQuery && savedEntity === currentEntity) {
        state.text = savedQuery
      }
      // If saved query exists but different entity, generate template for current entity
      else if (currentEntity) {
        state.text = generateTemplateForEntity(currentEntity, newMode)
      }
      // If no current entity and we have saved query, use it
      else if (savedQuery) {
        state.text = savedQuery
      }
      // Otherwise generate empty or use saved
      else {
        state.text = savedQuery || ''
      }
    },
    loadExample: (state, action: PayloadAction<unknown>) => {
      state.text = JSON.stringify(action.payload, null, 2)
    },
    formatQuery: (state) => {
      try {
        const parsed = JSON.parse(state.text)
        state.text = JSON.stringify(parsed, null, 2)
      } catch {
        // Invalid JSON, don't format
      }
    },
    clearResult: (state) => {
      state.result = null
      state.error = null
    },
    addToHistory: (state, action: PayloadAction<{ query: string; result: unknown }>) => {
      const entry: QueryHistoryEntry = {
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
            timestamp: Date.now(),
          },
          ...state.history.slice(0, 19),
        ]
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { setQueryText, setActiveTab, setOperationMode, loadExample, formatQuery, clearResult, addToHistory } =
  querySlice.actions

// Selectors
export const selectQueryText = (state: RootState): string => state.query.text
export const selectResult = (state: RootState): unknown => state.query.result
export const selectQueryError = (state: RootState): unknown => state.query.error
export const selectQueryLoading = (state: RootState): boolean => state.query.loading
export const selectActiveTab = (state: RootState): string => state.query.activeTab
export const selectOperationMode = (state: RootState): OperationMode => state.query.operationMode
export const selectHistory = (state: RootState): QueryHistoryEntry[] => state.query.history

export default querySlice.reducer

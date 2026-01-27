import { configureStore } from '@reduxjs/toolkit'
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'
import graphReducer from './graphSlice'
import queryReducer from './querySlice'
import builderReducer from './builderSlice'
import displayReducer from './displaySlice'
import type { RootState } from './types'

export const store = configureStore({
  reducer: {
    graph: graphReducer,
    query: queryReducer,
    builder: builderReducer,
    display: displayReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

// Infer the `AppDispatch` type from the store
export type AppDispatch = typeof store.dispatch

// Typed hooks for use throughout the app
export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

// Re-export types
export type { RootState } from './types'

export default store

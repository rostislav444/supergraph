import { configureStore } from '@reduxjs/toolkit'
import graphReducer from './graphSlice'
import queryReducer from './querySlice'

export const store = configureStore({
  reducer: {
    graph: graphReducer,
    query: queryReducer,
  },
})

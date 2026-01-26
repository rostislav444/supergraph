import { configureStore } from '@reduxjs/toolkit'
import graphReducer from './graphSlice'
import queryReducer from './querySlice'
import builderReducer from './builderSlice'

export const store = configureStore({
  reducer: {
    graph: graphReducer,
    query: queryReducer,
    builder: builderReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

export default store

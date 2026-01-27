import { configureStore } from '@reduxjs/toolkit'
import graphReducer from './graphSlice'
import queryReducer from './querySlice'
import builderReducer from './builderSlice'
import displayReducer from './displaySlice'

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

export default store

import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchGraph, selectGraph, selectGraphLoading } from './store/graphSlice'
import QueryEditor from './components/QueryEditor'
import ResultViewer from './components/ResultViewer'
import GraphExplorer from './components/GraphExplorer'
import ExampleQueries from './components/ExampleQueries'

export default function App() {
  const dispatch = useDispatch()
  const graph = useSelector(selectGraph)
  const graphLoading = useSelector(selectGraphLoading)

  useEffect(() => {
    dispatch(fetchGraph())
  }, [dispatch])

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <h1 className="text-2xl font-bold text-white">Supergraph Playground</h1>
        <p className="text-gray-400 text-sm mt-1">JSON Query DSL for microservices</p>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left sidebar - Graph Explorer */}
        <div className="w-72 bg-gray-800 border-r border-gray-700 overflow-y-auto">
          <GraphExplorer />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* Top - Example Queries */}
          <div className="bg-gray-800 border-b border-gray-700 p-4">
            <ExampleQueries />
          </div>

          {/* Query Editor and Result */}
          <div className="flex-1 flex">
            {/* Query Editor */}
            <div className="w-1/2 border-r border-gray-700">
              <QueryEditor />
            </div>

            {/* Result Viewer */}
            <div className="w-1/2">
              <ResultViewer />
            </div>
          </div>
        </div>
      </div>

      {graphLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg">
            <p className="text-white">Loading graph schema...</p>
          </div>
        </div>
      )}
    </div>
  )
}

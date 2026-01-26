import { useDispatch, useSelector } from 'react-redux'
import {
  selectQueryText,
  selectQueryLoading,
  setQueryText,
  executeQuery,
} from '../store/querySlice'

export default function QueryEditor() {
  const dispatch = useDispatch()
  const queryText = useSelector(selectQueryText)
  const loading = useSelector(selectQueryLoading)

  const handleExecute = () => {
    try {
      const query = JSON.parse(queryText)
      dispatch(executeQuery(query))
    } catch (e) {
      alert('Invalid JSON: ' + e.message)
    }
  }

  const handleFormat = () => {
    try {
      const query = JSON.parse(queryText)
      dispatch(setQueryText(JSON.stringify(query, null, 2)))
    } catch (e) {
      alert('Invalid JSON: ' + e.message)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="text-gray-300 font-medium">Query</span>
        <div className="flex gap-2">
          <button
            onClick={handleFormat}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
          >
            Format
          </button>
          <button
            onClick={handleExecute}
            disabled={loading}
            className="px-4 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded font-medium"
          >
            {loading ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>
      <textarea
        value={queryText}
        onChange={(e) => dispatch(setQueryText(e.target.value))}
        className="flex-1 bg-gray-900 text-gray-100 font-mono text-sm p-4 resize-none focus:outline-none"
        spellCheck={false}
      />
    </div>
  )
}

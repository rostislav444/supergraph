import { useSelector } from 'react-redux'
import { selectQueryResult, selectQueryLoading, selectQueryError } from '../store/querySlice'

function JsonSyntaxHighlight({ data, indent = 0 }) {
  if (data === null) return <span className="json-null">null</span>
  if (typeof data === 'boolean') return <span className="json-boolean">{data.toString()}</span>
  if (typeof data === 'number') return <span className="json-number">{data}</span>
  if (typeof data === 'string') return <span className="json-string">"{data}"</span>

  const spaces = '  '.repeat(indent)

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>
    return (
      <span>
        {'[\n'}
        {data.map((item, i) => (
          <span key={i}>
            {spaces}  <JsonSyntaxHighlight data={item} indent={indent + 1} />
            {i < data.length - 1 ? ',' : ''}{'\n'}
          </span>
        ))}
        {spaces}{']'}
      </span>
    )
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data)
    if (keys.length === 0) return <span>{'{}'}</span>
    return (
      <span>
        {'{\n'}
        {keys.map((key, i) => (
          <span key={key}>
            {spaces}  <span className="json-key">"{key}"</span>: <JsonSyntaxHighlight data={data[key]} indent={indent + 1} />
            {i < keys.length - 1 ? ',' : ''}{'\n'}
          </span>
        ))}
        {spaces}{'}'}
      </span>
    )
  }

  return <span>{String(data)}</span>
}

export default function ResultViewer() {
  const result = useSelector(selectQueryResult)
  const loading = useSelector(selectQueryLoading)
  const error = useSelector(selectQueryError)

  return (
    <div className="h-full flex flex-col">
      <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
        <span className="text-gray-300 font-medium">Result</span>
      </div>
      <div className="flex-1 bg-gray-900 overflow-auto p-4">
        {loading && (
          <div className="text-gray-400">Executing query...</div>
        )}
        {error && (
          <div className="text-red-400 font-mono text-sm">
            Error: {error}
          </div>
        )}
        {!loading && !error && result && (
          <pre className="font-mono text-sm whitespace-pre-wrap">
            <JsonSyntaxHighlight data={result} />
          </pre>
        )}
        {!loading && !error && !result && (
          <div className="text-gray-500">Run a query to see results</div>
        )}
      </div>
    </div>
  )
}

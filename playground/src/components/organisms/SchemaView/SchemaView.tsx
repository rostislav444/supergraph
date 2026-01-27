import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { HclHighlighter } from './HclHighlighter'
import type { Graph } from '@/types'

export interface SchemaViewProps {
  graph: Graph | null
}

export function SchemaView({ graph }: SchemaViewProps) {
  const [viewMode, setViewMode] = useState<'json' | 'hcl'>('hcl')
  const [hcl, setHcl] = useState('')
  const [loading, setLoading] = useState(true)

  const graphUrl = window.SUPERGRAPH_CONFIG?.graphUrl || '/__graph'

  useEffect(() => {
    fetch(`${graphUrl}.hcl`)
      .then((r) => r.text())
      .then((text) => {
        setHcl(text)
        setLoading(false)
      })
      .catch(() => {
        setHcl('# Failed to load HCL schema')
        setLoading(false)
      })
  }, [graphUrl])

  if (!graph || loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full mx-auto mb-2"></div>
          <p className="text-sm">Loading schema...</p>
        </div>
      </div>
    )
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(viewMode === 'json' ? JSON.stringify(graph, null, 2) : hcl)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Format:</span>
          <div className="flex bg-gray-800 rounded">
            <button
              onClick={() => setViewMode('hcl')}
              className={clsx(
                'px-3 py-1 text-sm rounded-l transition-colors',
                viewMode === 'hcl' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              )}
            >
              HCL
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={clsx(
                'px-3 py-1 text-sm rounded-r transition-colors',
                viewMode === 'json' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              )}
            >
              JSON
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{Object.keys(graph.entities || {}).length} entities</span>
          <button
            onClick={handleCopy}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors"
            title="Copy to clipboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-[#0D1117]">
        {viewMode === 'hcl' ? (
          <HclHighlighter code={hcl} />
        ) : (
          <pre className="font-mono text-sm text-gray-300 whitespace-pre">{JSON.stringify(graph, null, 2)}</pre>
        )}
      </div>
    </div>
  )
}

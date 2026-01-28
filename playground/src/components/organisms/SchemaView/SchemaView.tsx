import { useState, useEffect } from 'react'
import { HclHighlighter } from './HclHighlighter'
import { SchemaGraph } from './SchemaGraph'
import { TypeScriptGenerator } from './TypeScriptGenerator'
import type { Graph } from '@/types'

type ViewMode = 'graph' | 'hcl' | 'json' | 'typescript'

export interface SchemaViewProps {
  graph: Graph | null
  viewMode?: ViewMode
}

export function SchemaView({ graph, viewMode = 'graph' }: SchemaViewProps) {
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
    if (viewMode === 'json') {
      navigator.clipboard.writeText(JSON.stringify(graph, null, 2))
    } else if (viewMode === 'hcl') {
      navigator.clipboard.writeText(hcl)
    }
  }

  // TypeScript view has its own toolbar
  if (viewMode === 'typescript') {
    return <TypeScriptGenerator graph={graph} />
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar - only shown for HCL/JSON views with copy button */}
      {viewMode !== 'graph' && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
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
      )}

      {/* Content */}
      {viewMode === 'graph' ? (
        <div className="flex-1 relative">
          <SchemaGraph graph={graph} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 bg-[#0D1117]">
          {viewMode === 'hcl' ? (
            <HclHighlighter code={hcl} />
          ) : (
            <pre className="font-mono text-sm text-gray-300 whitespace-pre">{JSON.stringify(graph, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}

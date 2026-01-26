import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import clsx from 'clsx'
import SchemaExplorer from './components/SchemaExplorer'
import MonacoEditor from './components/MonacoEditor'
import ResultViewer from './components/ResultViewer'
import DocumentationPanel from './components/DocumentationPanel'
import { fetchGraph, selectConnected, selectGraph } from './store/graphSlice'
import { selectDocumentation } from './store/builderSlice'

// Resize handle component
function ResizeHandle({ className }) {
  return (
    <PanelResizeHandle className={clsx('group', className)}>
      <div className="w-1 h-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
    </PanelResizeHandle>
  )
}

function App() {
  const dispatch = useDispatch()
  const connected = useSelector(selectConnected)
  const graph = useSelector(selectGraph)
  const documentation = useSelector(selectDocumentation)
  const [activeTab, setActiveTab] = useState('explorer') // 'explorer' | 'schema'

  useEffect(() => {
    dispatch(fetchGraph())
  }, [dispatch])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
              <h1 className="text-lg font-bold text-white">Supergraph</h1>
            </div>

            {/* Tabs */}
            <div className="flex items-center bg-gray-800 rounded-lg p-1 ml-6">
              <button
                onClick={() => setActiveTab('explorer')}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded transition-colors',
                  activeTab === 'explorer'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                Explorer
              </button>
              <button
                onClick={() => setActiveTab('schema')}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded transition-colors',
                  activeTab === 'schema'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                Schema
              </button>
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex items-center gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-2">
              <span className={clsx(
                'w-2 h-2 rounded-full',
                connected ? 'bg-green-500' : 'bg-red-500'
              )} />
              <span className="text-sm text-gray-400">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Endpoint URL */}
            <div className="flex items-center gap-2 bg-gray-800 rounded px-3 py-1.5">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-sm text-gray-300 font-mono">{window.SUPERGRAPH_CONFIG?.apiUrl || '/query'}</span>
            </div>

            {/* Settings */}
            <button className="p-2 text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'explorer' ? (
          <PanelGroup direction="horizontal" className="h-full">
            {/* Left Panel - Schema Explorer / Query Builder */}
            <Panel defaultSize={25} minSize={15} maxSize={40}>
              <SchemaExplorer />
            </Panel>

            <ResizeHandle />

            {/* Center Panel - Query Editor */}
            <Panel defaultSize={documentation ? 35 : 45} minSize={25}>
              <MonacoEditor />
            </Panel>

            <ResizeHandle />

            {/* Right Panel - Results */}
            <Panel defaultSize={documentation ? 25 : 30} minSize={20}>
              <ResultViewer />
            </Panel>

            {/* Documentation Panel (conditional) */}
            {documentation && (
              <>
                <ResizeHandle />
                <Panel defaultSize={15} minSize={15} maxSize={30}>
                  <DocumentationPanel />
                </Panel>
              </>
            )}
          </PanelGroup>
        ) : (
          <SchemaView graph={graph} />
        )}
      </main>
    </div>
  )
}

// HCL Syntax Highlighter - token-based approach
function HclHighlighter({ code }) {
  const tokenizeLine = (line) => {
    const tokens = []
    let remaining = line
    let pos = 0

    while (remaining.length > 0) {
      // Comments
      const commentMatch = remaining.match(/^(#.*)/)
      if (commentMatch) {
        tokens.push({ type: 'comment', text: commentMatch[1] })
        remaining = remaining.slice(commentMatch[1].length)
        continue
      }

      // Strings
      const stringMatch = remaining.match(/^"([^"]*)"/)
      if (stringMatch) {
        tokens.push({ type: 'string', text: stringMatch[0] })
        remaining = remaining.slice(stringMatch[0].length)
        continue
      }

      // Block keywords at start of line or after whitespace
      const keywordMatch = remaining.match(/^(entity|service|field|relation|access|through|ref|keys|filters|presets|defaults|relation_providers|rel)\b/)
      if (keywordMatch && (pos === 0 || line[pos - 1] === ' ' || line[pos - 1] === '\t')) {
        tokens.push({ type: 'keyword', text: keywordMatch[1] })
        remaining = remaining.slice(keywordMatch[1].length)
        pos += keywordMatch[1].length
        continue
      }

      // Property names (word followed by =)
      const propMatch = remaining.match(/^([a-z_][a-z0-9_]*)(\s*=)/)
      if (propMatch) {
        tokens.push({ type: 'property', text: propMatch[1] })
        tokens.push({ type: 'text', text: propMatch[2] })
        remaining = remaining.slice(propMatch[0].length)
        pos += propMatch[0].length
        continue
      }

      // Booleans
      const boolMatch = remaining.match(/^(true|false)\b/)
      if (boolMatch) {
        tokens.push({ type: 'boolean', text: boolMatch[1] })
        remaining = remaining.slice(boolMatch[1].length)
        pos += boolMatch[1].length
        continue
      }

      // Numbers
      const numMatch = remaining.match(/^(\d+)/)
      if (numMatch) {
        tokens.push({ type: 'number', text: numMatch[1] })
        remaining = remaining.slice(numMatch[1].length)
        pos += numMatch[1].length
        continue
      }

      // Brackets
      const bracketMatch = remaining.match(/^([{}[\]])/)
      if (bracketMatch) {
        tokens.push({ type: 'bracket', text: bracketMatch[1] })
        remaining = remaining.slice(1)
        pos += 1
        continue
      }

      // Default: single character
      tokens.push({ type: 'text', text: remaining[0] })
      remaining = remaining.slice(1)
      pos += 1
    }

    return tokens
  }

  const colorMap = {
    keyword: 'text-purple-400',
    string: 'text-green-400',
    property: 'text-blue-300',
    boolean: 'text-orange-400',
    number: 'text-orange-400',
    bracket: 'text-gray-500',
    comment: 'text-gray-500 italic',
    text: 'text-gray-300',
  }

  const lines = code.split('\n')

  return (
    <div className="font-mono text-sm">
      {lines.map((line, i) => {
        const tokens = tokenizeLine(line)
        return (
          <div key={i} className="flex">
            <span className="text-gray-600 select-none w-10 text-right pr-4">{i + 1}</span>
            <span className="whitespace-pre">
              {tokens.map((token, j) => (
                <span key={j} className={colorMap[token.type]}>{token.text}</span>
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Schema view for the Schema tab
function SchemaView({ graph }) {
  const [viewMode, setViewMode] = useState('hcl') // 'json' | 'hcl' - HCL by default
  const [hcl, setHcl] = useState('')
  const [loading, setLoading] = useState(true)

  // Load HCL on mount
  const graphUrl = window.SUPERGRAPH_CONFIG?.graphUrl || '/__graph'
  useEffect(() => {
    fetch(`${graphUrl}.hcl`)
      .then(r => r.text())
      .then(text => {
        setHcl(text)
        setLoading(false)
      })
      .catch(() => {
        setHcl('# Failed to load HCL schema')
        setLoading(false)
      })
  }, [])

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
          <span className="text-xs text-gray-500">
            {Object.keys(graph.entities || {}).length} entities
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(
              viewMode === 'json' ? JSON.stringify(graph, null, 2) : hcl
            )}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors"
            title="Copy to clipboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-[#0D1117]">
        {viewMode === 'hcl' ? (
          <HclHighlighter code={hcl} />
        ) : (
          <pre className="font-mono text-sm text-gray-300 whitespace-pre">
            {JSON.stringify(graph, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export default App

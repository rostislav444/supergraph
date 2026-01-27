import { useEffect, useState, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import clsx from 'clsx'
import SchemaExplorer from './components/SchemaExplorer'
import MonacoEditor from './components/MonacoEditor'
import ResultViewer from './components/ResultViewer'
import DocumentationPanel from './components/DocumentationPanel'
import FormEditor from './components/FormEditor'
import { fetchGraph, selectConnected, selectGraph } from './store/graphSlice'
import { selectDocumentation, selectRootEntity, selectSelectedFields } from './store/builderSlice'
import { selectOperationMode, setOperationMode, executeQuery, selectQueryText, selectQueryLoading } from './store/querySlice'
import { captureSnapshot } from './store/displaySlice'

// Resize handle component
function ResizeHandle({ className }) {
  return (
    <PanelResizeHandle className={clsx('group', className)}>
      <div className="w-1 h-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
    </PanelResizeHandle>
  )
}

// Operation modes
const OPERATION_MODES = [
  { id: 'query', label: 'Query' },
  { id: 'create', label: 'Create' },
  { id: 'update', label: 'Update' },
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'delete', label: 'Delete' },
  { id: 'transaction', label: 'Transaction' },
]

const MODE_COLORS = {
  query: 'bg-blue-600/30 text-blue-400 border-blue-500',
  create: 'bg-green-600/30 text-green-400 border-green-500',
  update: 'bg-yellow-600/30 text-yellow-400 border-yellow-500',
  rewrite: 'bg-orange-600/30 text-orange-400 border-orange-500',
  delete: 'bg-red-600/30 text-red-400 border-red-500',
  transaction: 'bg-purple-600/30 text-purple-400 border-purple-500',
}

const MODE_DOT_COLORS = {
  query: 'bg-blue-500',
  create: 'bg-green-500',
  update: 'bg-yellow-500',
  rewrite: 'bg-orange-500',
  delete: 'bg-red-500',
  transaction: 'bg-purple-500',
}

const MODE_HOVER_COLORS = {
  query: 'hover:bg-blue-600/20',
  create: 'hover:bg-green-600/20',
  update: 'hover:bg-yellow-600/20',
  rewrite: 'hover:bg-orange-600/20',
  delete: 'hover:bg-red-600/20',
  transaction: 'hover:bg-purple-600/20',
}

// Operation mode dropdown - styled to match JSON/HTML toggle
function OperationModeDropdown({ value, onChange, modes }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentMode = modes.find(m => m.id === value) || modes[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium transition-all text-gray-400 hover:text-white"
      >
        <span className={`w-2 h-2 rounded-full ${MODE_DOT_COLORS[value]}`} />
        <span>{currentMode.label}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px] overflow-hidden">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                onChange(mode.id)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                value === mode.id
                  ? 'bg-gray-700 text-white'
                  : `text-gray-300 ${MODE_HOVER_COLORS[mode.id]}`
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${MODE_DOT_COLORS[mode.id]}`} />
              <span className="text-sm">{mode.label}</span>
              {value === mode.id && (
                <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// View dropdown (Explorer/Schema)
function ViewDropdown({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const options = [
    { id: 'explorer', label: 'Explorer', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    )},
    { id: 'schema', label: 'Schema', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
  ]

  const current = options.find(o => o.id === value) || options[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-gray-400 hover:text-white transition-colors"
      >
        {current.icon}
        <span className="text-sm">{current.label}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px]">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                onChange(option.id)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                value === option.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              {option.icon}
              <span className="text-sm">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Execute button colors by operation mode
const MODE_BUTTON_COLORS = {
  query: 'bg-blue-600 hover:bg-blue-700',
  create: 'bg-green-600 hover:bg-green-700',
  update: 'bg-yellow-600 hover:bg-yellow-700',
  rewrite: 'bg-orange-600 hover:bg-orange-700',
  delete: 'bg-red-600 hover:bg-red-700',
  transaction: 'bg-purple-600 hover:bg-purple-700',
}

// Extract entity names from query text
function extractEntityNames(queryText) {
  try {
    const parsed = JSON.parse(queryText)
    if (typeof parsed === 'object' && parsed !== null) {
      // Get top-level keys that are entity names (capitalized)
      return Object.keys(parsed).filter(key => /^[A-Z]/.test(key))
    }
  } catch {
    // Invalid JSON, return empty
  }
  return []
}

function App() {
  const dispatch = useDispatch()
  const connected = useSelector(selectConnected)
  const graph = useSelector(selectGraph)
  const documentation = useSelector(selectDocumentation)
  const operationMode = useSelector(selectOperationMode)
  const queryText = useSelector(selectQueryText)
  const loading = useSelector(selectQueryLoading)
  const rootEntity = useSelector(selectRootEntity)
  const selectedFields = useSelector(selectSelectedFields)
  const [activeTab, setActiveTab] = useState('explorer') // 'explorer' | 'schema'
  const [viewMode, setViewMode] = useState('json') // 'json' | 'html'

  useEffect(() => {
    dispatch(fetchGraph())
  }, [dispatch])

  const handleExecute = useCallback(() => {
    // Build column definitions from schema for display isolation
    const columnDefinitions = {}
    if (rootEntity && graph?.entities?.[rootEntity]) {
      const entityDef = graph.entities[rootEntity]
      const fields = selectedFields[rootEntity] || []

      for (const fieldName of fields) {
        const fieldDef = entityDef.fields?.[fieldName]
        if (fieldDef) {
          columnDefinitions[fieldName] = {
            type: fieldDef.type,
            enum_values: fieldDef.enum_values || [],
            nullable: fieldDef.nullable,
          }
        }
      }
    }

    // Capture snapshot BEFORE executing query (isolates builder from display)
    dispatch(captureSnapshot({
      entity: rootEntity,
      selectedFields: { ...selectedFields },
      columnDefinitions,
    }))

    // Execute query
    dispatch(executeQuery(queryText))
  }, [dispatch, queryText, rootEntity, selectedFields, graph])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
        {/* Header */}
        <header className="bg-gray-900 border-b border-gray-700 flex-shrink-0">
          <div className="relative flex items-center justify-between h-14 px-4">
            {/* Left: Logo + Status */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <h1 className="text-lg font-bold text-white">Supergraph</h1>
              </div>
              <div className="w-px h-5 bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'w-2 h-2 rounded-full',
                  connected ? 'bg-green-500' : 'bg-red-500'
                )} />
                <span className="text-sm text-gray-400">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Center: Query Mode + Entity + JSON/HTML */}
            {activeTab === 'explorer' && (
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-gray-800 rounded-lg p-0.5 z-20">
                <OperationModeDropdown
                  value={operationMode}
                  onChange={(mode) => dispatch(setOperationMode(mode))}
                  modes={OPERATION_MODES}
                />
                {(() => {
                  const entities = extractEntityNames(queryText)
                  if (entities.length > 0) {
                    return (
                      <span className="text-sm text-gray-300 truncate max-w-[200px]">
                        {entities.join(', ')}
                      </span>
                    )
                  }
                  return null
                })()}
                <div className="w-px h-4 bg-gray-600 mx-2" />
                <button
                  onClick={() => setViewMode('json')}
                  className={clsx(
                    'px-3 py-1 text-sm font-medium rounded-md transition-all',
                    viewMode === 'json' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                  )}
                >
                  JSON
                </button>
                <button
                  onClick={() => setViewMode('html')}
                  className={clsx(
                    'px-3 py-1 text-sm font-medium rounded-md transition-all',
                    viewMode === 'html' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                  )}
                >
                  HTML
                </button>
              </div>
            )}

            {/* Right: Explorer + Execute */}
            <div className="flex items-center gap-3">
              <ViewDropdown value={activeTab} onChange={setActiveTab} />
              {activeTab === 'explorer' && (
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  className={clsx(
                    'flex items-center gap-2 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:bg-gray-600',
                    MODE_BUTTON_COLORS[operationMode]
                  )}
                  title="Execute (Ctrl+Enter)"
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      <span>Execute</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {activeTab === 'explorer' ? (
            <PanelGroup direction="horizontal" className="h-full" key={viewMode}>
              {/* Left Panel - Schema Explorer / Query Builder */}
              <Panel id="schema-explorer" order={1} defaultSize={25} minSize={15} maxSize={40}>
                <SchemaExplorer />
              </Panel>

              <ResizeHandle />

              {viewMode === 'json' ? (
                <>
                  {/* Center Panel - Query Editor */}
                  <Panel id="query-editor" order={2} defaultSize={documentation ? 35 : 45} minSize={25}>
                    <MonacoEditor />
                  </Panel>

                  <ResizeHandle />

                  {/* Right Panel - Results */}
                  <Panel id="results" order={3} defaultSize={documentation ? 25 : 30} minSize={20}>
                    <ResultViewer />
                  </Panel>

                  {/* Documentation Panel (conditional) */}
                  {documentation && (
                    <>
                      <ResizeHandle />
                      <Panel id="documentation" order={4} defaultSize={15} minSize={15} maxSize={30}>
                        <DocumentationPanel />
                      </Panel>
                    </>
                  )}
                </>
              ) : (
                /* HTML Mode - vertical layout for better table viewing */
                <Panel id="html-editor" order={2} defaultSize={75} minSize={50}>
                  <FormEditor layout="vertical" />
                </Panel>
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

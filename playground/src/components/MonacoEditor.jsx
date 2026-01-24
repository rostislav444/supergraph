import { useCallback, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Editor, { useMonaco } from '@monaco-editor/react'
import { setQueryText, selectQueryText, executeQuery, selectQueryLoading } from '../store/querySlice'
import { selectGraph } from '../store/graphSlice'

// Custom theme for dark mode
const DARK_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'string.key.json', foreground: '9CDCFE' },
    { token: 'string.value.json', foreground: 'CE9178' },
    { token: 'number.json', foreground: 'B5CEA8' },
    { token: 'keyword.json', foreground: '569CD6' },
  ],
  colors: {
    'editor.background': '#0D1117',
    'editor.foreground': '#C9D1D9',
    'editorLineNumber.foreground': '#6E7681',
    'editorLineNumber.activeForeground': '#C9D1D9',
    'editor.lineHighlightBackground': '#161B22',
    'editor.selectionBackground': '#264F78',
    'editorCursor.foreground': '#58A6FF',
  },
}

// JSON validation based on graph schema
function createValidator(graph) {
  return (model) => {
    const markers = []

    if (!graph) return markers

    try {
      const text = model.getValue()
      const parsed = JSON.parse(text)

      // Validate entity names
      const validateEntity = (obj, path = '') => {
        for (const key of Object.keys(obj)) {
          // Skip known keywords
          if (['fields', 'filters', 'order', 'limit', 'offset', 'relations', 'data', 'response', 'action', 'entity', 'select', 'query', 'create', 'update', 'delete', 'rewrite', 'transaction'].includes(key)) {
            continue
          }

          // Check if this looks like an entity name
          if (key[0] === key[0].toUpperCase() && !graph.entities[key]) {
            // Find position in text
            const keyPattern = new RegExp(`"${key}"\\s*:`)
            const match = text.match(keyPattern)
            if (match) {
              const startIndex = text.indexOf(match[0])
              const startPos = model.getPositionAt(startIndex)
              const endPos = model.getPositionAt(startIndex + key.length + 2)

              markers.push({
                severity: 8, // Error
                message: `Unknown entity: "${key}"`,
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column,
              })
            }
          }
        }
      }

      validateEntity(parsed)

      // Validate fields in nested queries
      const validateFields = (query, entityName, path = '') => {
        if (!query || typeof query !== 'object') return

        const entity = graph.entities[entityName]
        if (!entity) return

        // Validate fields array
        if (query.fields && Array.isArray(query.fields)) {
          for (const field of query.fields) {
            if (!entity.fields[field]) {
              const fieldPattern = new RegExp(`"${field}"`)
              const match = text.match(fieldPattern)
              if (match) {
                const startIndex = text.indexOf(match[0])
                const startPos = model.getPositionAt(startIndex)
                const endPos = model.getPositionAt(startIndex + field.length + 2)

                markers.push({
                  severity: 4, // Warning
                  message: `Unknown field "${field}" on entity "${entityName}"`,
                  startLineNumber: startPos.lineNumber,
                  startColumn: startPos.column,
                  endLineNumber: endPos.lineNumber,
                  endColumn: endPos.column,
                })
              }
            }
          }
        }

        // Validate relations
        if (query.relations && typeof query.relations === 'object') {
          for (const [relName, relQuery] of Object.entries(query.relations)) {
            if (!entity.relations || !entity.relations[relName]) {
              const relPattern = new RegExp(`"${relName}"\\s*:`)
              const match = text.match(relPattern)
              if (match) {
                const startIndex = text.indexOf(match[0])
                const startPos = model.getPositionAt(startIndex)
                const endPos = model.getPositionAt(startIndex + relName.length + 2)

                markers.push({
                  severity: 8,
                  message: `Unknown relation "${relName}" on entity "${entityName}"`,
                  startLineNumber: startPos.lineNumber,
                  startColumn: startPos.column,
                  endLineNumber: endPos.lineNumber,
                  endColumn: endPos.column,
                })
              }
            } else {
              const targetEntity = entity.relations[relName].target
              validateFields(relQuery, targetEntity, `${path}.${relName}`)
            }
          }
        }
      }

      // Find root entity and validate
      for (const [key, value] of Object.entries(parsed)) {
        if (graph.entities[key]) {
          validateFields(value, key, key)
        }
      }

    } catch (e) {
      // JSON parse error - Monaco will handle this
    }

    return markers
  }
}

// Autocomplete provider
function createCompletionProvider(graph) {
  return {
    triggerCharacters: ['"', '.', ':'],
    provideCompletionItems: (model, position) => {
      if (!graph) return { suggestions: [] }

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      }

      const suggestions = []

      // Check context
      const lastLine = model.getLineContent(position.lineNumber)
      const beforeCursor = lastLine.substring(0, position.column - 1)

      // After opening brace at root level - suggest entities
      if (textUntilPosition.match(/^\s*\{\s*"?$/)) {
        for (const entityName of Object.keys(graph.entities)) {
          suggestions.push({
            label: entityName,
            kind: 9, // Class
            insertText: `"${entityName}": {\n  "fields": [],\n  "filters": {}\n}`,
            insertTextRules: 4, // InsertAsSnippet
            detail: `Entity (${graph.entities[entityName].service})`,
            range,
          })
        }
      }

      // After "fields": [ - suggest field names
      const fieldsMatch = textUntilPosition.match(/"([A-Z][a-zA-Z]+)"[^}]*"fields"\s*:\s*\[(?:\s*"[^"]*"\s*,?\s*)*"?$/)
      if (fieldsMatch) {
        const entityName = fieldsMatch[1]
        const entity = graph.entities[entityName]
        if (entity) {
          for (const fieldName of Object.keys(entity.fields)) {
            suggestions.push({
              label: fieldName,
              kind: 5, // Field
              insertText: `"${fieldName}"`,
              detail: entity.fields[fieldName].type,
              range,
            })
          }
        }
      }

      // After "filters": { - suggest filter keys
      const filtersMatch = textUntilPosition.match(/"([A-Z][a-zA-Z]+)"[^}]*"filters"\s*:\s*\{[^}]*"?$/)
      if (filtersMatch) {
        const entityName = filtersMatch[1]
        const entity = graph.entities[entityName]
        if (entity) {
          for (const [fieldName, field] of Object.entries(entity.fields)) {
            const filters = field.filters || ['eq']
            for (const op of filters) {
              suggestions.push({
                label: `${fieldName}__${op}`,
                kind: 5,
                insertText: `"${fieldName}__${op}": `,
                detail: `${field.type} filter`,
                range,
              })
            }
          }
        }
      }

      // After "relations": { - suggest relation names
      const relationsMatch = textUntilPosition.match(/"([A-Z][a-zA-Z]+)"[^}]*"relations"\s*:\s*\{[^}]*"?$/)
      if (relationsMatch) {
        const entityName = relationsMatch[1]
        const entity = graph.entities[entityName]
        if (entity && entity.relations) {
          for (const [relName, rel] of Object.entries(entity.relations)) {
            suggestions.push({
              label: relName,
              kind: 18, // Reference
              insertText: `"${relName}": {\n  "fields": []\n}`,
              insertTextRules: 4,
              detail: `→ ${rel.target} (${rel.cardinality})`,
              range,
            })
          }
        }
      }

      // Suggest keywords
      if (beforeCursor.match(/:\s*\{\s*"?$/)) {
        const keywords = ['fields', 'filters', 'relations', 'order', 'limit', 'offset']
        for (const kw of keywords) {
          suggestions.push({
            label: kw,
            kind: 14, // Keyword
            insertText: kw === 'fields' ? `"${kw}": []` :
                       kw === 'filters' ? `"${kw}": {}` :
                       kw === 'relations' ? `"${kw}": {}` :
                       kw === 'order' ? `"${kw}": []` :
                       `"${kw}": `,
            insertTextRules: 4,
            range,
          })
        }
      }

      return { suggestions }
    },
  }
}

export default function MonacoEditor() {
  const dispatch = useDispatch()
  const monaco = useMonaco()
  const editorRef = useRef(null)
  const value = useSelector(selectQueryText)
  const graph = useSelector(selectGraph)
  const loading = useSelector(selectQueryLoading)

  // Setup Monaco
  useEffect(() => {
    if (monaco) {
      // Define custom theme
      monaco.editor.defineTheme('supergraph-dark', DARK_THEME)

      // Register completion provider
      const disposable = monaco.languages.registerCompletionItemProvider('json', createCompletionProvider(graph))

      return () => disposable.dispose()
    }
  }, [monaco, graph])

  // Setup validation
  useEffect(() => {
    if (monaco && graph && editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        const validate = createValidator(graph)
        const markers = validate(model)
        monaco.editor.setModelMarkers(model, 'supergraph', markers)
      }
    }
  }, [monaco, graph, value])

  const handleEditorDidMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor

    // Add keyboard shortcut for execution (Ctrl/Cmd + Enter)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      dispatch(executeQuery(value))
    })

    // Format on save (Ctrl/Cmd + S)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      editor.getAction('editor.action.formatDocument').run()
    })
  }, [dispatch, value])

  const handleChange = useCallback((newValue) => {
    dispatch(setQueryText(newValue || ''))
  }, [dispatch])

  const handleExecute = useCallback(() => {
    dispatch(executeQuery(value))
  }, [dispatch, value])

  const handleFormat = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument').run()
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-[#0D1117]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Operation</span>
          <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-0.5 rounded">Query</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFormat}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 hover:bg-gray-700 rounded transition-colors"
            title="Format (Ctrl+S)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
          <button
            onClick={handleExecute}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
            title="Execute (Ctrl+Enter)"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Execute
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language="json"
          theme="supergraph-dark"
          value={value}
          onChange={handleChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            formatOnPaste: true,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
            quickSuggestions: {
              other: true,
              strings: true,
            },
          }}
        />
      </div>
    </div>
  )
}

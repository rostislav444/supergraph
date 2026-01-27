import { useEffect, useState, useCallback } from 'react'
import { Panel, PanelGroup } from 'react-resizable-panels'
import clsx from 'clsx'

// Components
import SchemaExplorer from './components/SchemaExplorer'
import MonacoEditor from './components/MonacoEditor'
import ResultViewer from './components/ResultViewer'
import DocumentationPanel from './components/DocumentationPanel'
import FormEditor from './components/FormEditor'
import { ResizeHandle } from '@atoms/ResizeHandle'
import { OperationModeDropdown, ViewDropdown } from '@molecules/dropdowns'
import { SchemaView } from '@organisms/SchemaView'

// Store
import { useAppDispatch, useAppSelector } from '@store/index'
import { fetchGraph, selectConnected, selectGraph } from '@store/graphSlice'
import { selectDocumentation, selectRootEntity, selectSelectedFields } from '@store/builderSlice'
import {
  selectOperationMode,
  setOperationMode,
  executeQuery,
  selectQueryText,
  selectQueryLoading,
} from '@store/querySlice'
import { captureSnapshot } from '@store/displaySlice'

// Constants
import { OPERATION_MODES } from '@constants/filters'
import { MODE_BUTTON_COLORS } from '@constants/colors'

// Utils
import { extractEntityNames } from '@utils/queryParser'

// Types
import type { OperationMode } from '@/types'

export default function App() {
  const dispatch = useAppDispatch()
  const connected = useAppSelector(selectConnected)
  const graph = useAppSelector(selectGraph)
  const documentation = useAppSelector(selectDocumentation)
  const operationMode = useAppSelector(selectOperationMode)
  const queryText = useAppSelector(selectQueryText)
  const loading = useAppSelector(selectQueryLoading)
  const rootEntity = useAppSelector(selectRootEntity)
  const selectedFields = useAppSelector(selectSelectedFields)

  const [activeTab, setActiveTab] = useState<'explorer' | 'schema'>('explorer')
  const [viewMode, setViewMode] = useState<'json' | 'html'>('json')

  useEffect(() => {
    dispatch(fetchGraph())
  }, [dispatch])

  const handleExecute = useCallback(() => {
    // Build column definitions from schema for display isolation
    const columnDefinitions: Record<string, { type: string; enum_values?: string[]; nullable?: boolean }> = {}
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
    dispatch(
      captureSnapshot({
        entity: rootEntity,
        selectedFields: { ...selectedFields },
        columnDefinitions,
      })
    )

    // Execute query
    dispatch(executeQuery(queryText))
  }, [dispatch, queryText, rootEntity, selectedFields, graph])

  const entities = extractEntityNames(queryText)

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div className="relative flex items-center justify-between h-14 px-4">
          {/* Left: Logo + Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
              <h1 className="text-lg font-bold text-white">Supergraph</h1>
            </div>
            <div className="w-px h-5 bg-gray-700" />
            <div className="flex items-center gap-2">
              <span className={clsx('w-2 h-2 rounded-full', connected ? 'bg-green-500' : 'bg-red-500')} />
              <span className="text-sm text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>

          {/* Center: Query Mode + Entity + JSON/HTML */}
          {activeTab === 'explorer' && (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-gray-800 rounded-lg p-0.5 z-20">
              <OperationModeDropdown
                value={operationMode}
                onChange={(mode) => dispatch(setOperationMode(mode))}
                modes={OPERATION_MODES as unknown as Array<{ id: OperationMode; label: string }>}
              />
              {entities.length > 0 && (
                <span className="text-sm text-gray-300 truncate max-w-[200px]">{entities.join(', ')}</span>
              )}
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
            <ViewDropdown value={activeTab} onChange={(id) => setActiveTab(id as 'explorer' | 'schema')} />
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
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                        clipRule="evenodd"
                      />
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

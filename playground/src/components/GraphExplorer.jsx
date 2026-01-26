import { useMemo, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  selectGraph,
  selectSelectedEntity,
  selectEntities,
  selectServices,
  selectEntityDetails,
  selectEntity,
  clearSelection
} from '../store/graphSlice'

function GraphExplorer() {
  const dispatch = useDispatch()
  const graph = useSelector(selectGraph)
  const selectedEntity = useSelector(selectSelectedEntity)
  const entities = useSelector(selectEntities)
  const services = useSelector(selectServices)
  const entityDetails = useSelector(selectEntityDetails)

  const handleEntityClick = useCallback((name) => {
    if (selectedEntity === name) {
      dispatch(clearSelection())
    } else {
      dispatch(selectEntity(name))
    }
  }, [dispatch, selectedEntity])

  const formattedGraph = useMemo(() => {
    if (!graph) return ''
    return JSON.stringify(graph, null, 2)
  }, [graph])

  if (!graph) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <p>Loading graph schema...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex">
      {/* Sidebar - Entity List */}
      <div className="w-64 border-r border-gray-700 overflow-auto">
        <div className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Services ({services.length})
          </h3>
          <div className="space-y-1 mb-6">
            {services.map(([name, service]) => (
              <div key={name} className="flex items-center gap-2 text-sm text-gray-400 py-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>{name}</span>
                <span className="text-xs text-gray-600 ml-auto">{service.url}</span>
              </div>
            ))}
          </div>

          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Entities ({entities.length})
          </h3>
          <div className="space-y-1">
            {entities.map(([name, entity]) => (
              <button
                key={name}
                onClick={() => handleEntityClick(name)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedEntity === name
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <div className="font-medium">{name}</div>
                <div className="text-xs opacity-60">{entity.service}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content - Entity Details */}
      <div className="flex-1 overflow-auto">
        {entityDetails ? (
          <EntityDetails name={selectedEntity} entity={entityDetails} />
        ) : (
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Graph Schema</h2>
            <pre className="json-editor text-sm text-gray-400 bg-gray-950 p-4 rounded overflow-auto">
              {formattedGraph}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function EntityDetails({ name, entity }) {
  const fields = useMemo(() => Object.entries(entity.fields || {}), [entity.fields])
  const relations = useMemo(() => Object.entries(entity.relations || {}), [entity.relations])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">{name}</h2>
        <div className="flex gap-4 text-sm text-gray-400">
          <span>Service: <span className="text-blue-400">{entity.service}</span></span>
          <span>Resource: <span className="text-green-400">{entity.resource}</span></span>
          <span>Keys: <span className="text-yellow-400">{entity.keys?.join(', ')}</span></span>
        </div>
      </div>

      {/* Fields */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-200">Fields</h3>
        <div className="bg-gray-800 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-gray-400">
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Filters</th>
                <th className="text-left px-4 py-2">Sortable</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([fieldName, field]) => (
                <tr key={fieldName} className="border-t border-gray-700">
                  <td className="px-4 py-2 text-white font-mono">{fieldName}</td>
                  <td className="px-4 py-2 text-purple-400">{field.type}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {field.filters?.map(f => (
                        <span key={f} className="bg-gray-700 px-2 py-0.5 rounded text-xs text-gray-300">
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {field.sortable ? (
                      <span className="text-green-400">Yes</span>
                    ) : (
                      <span className="text-gray-500">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Relations */}
      {relations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-200">Relations</h3>
          <div className="space-y-3">
            {relations.map(([relName, rel]) => (
              <div key={relName} className="bg-gray-800 rounded p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-white">{relName}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-blue-400">{rel.target}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    rel.cardinality === 'one'
                      ? 'bg-purple-900 text-purple-300'
                      : 'bg-green-900 text-green-300'
                  }`}>
                    {rel.cardinality}
                  </span>
                </div>
                {rel.through && (
                  <div className="text-xs text-gray-400 ml-4">
                    Through: {rel.through.model}
                    ({rel.through.parent_match_field} → {rel.through.target_key_field})
                  </div>
                )}
                {rel.ref && (
                  <div className="text-xs text-gray-400 ml-4">
                    Ref: {rel.ref.from_field} → {rel.ref.to_field}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Access */}
      {entity.access && (
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-200">Access Control</h3>
          <div className="bg-gray-800 rounded p-4">
            <div className="text-sm">
              <span className="text-gray-400">Strategy: </span>
              <span className={`${
                entity.access.tenant_strategy === 'none'
                  ? 'text-gray-500'
                  : 'text-yellow-400'
              }`}>
                {entity.access.tenant_strategy}
              </span>
              {entity.access.tenant_field && (
                <span className="text-gray-400 ml-4">
                  Field: <span className="text-yellow-400">{entity.access.tenant_field}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GraphExplorer

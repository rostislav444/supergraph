import { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { selectEntities, selectServices } from '../store/graphSlice'

export default function GraphExplorer() {
  const entities = useSelector(selectEntities)
  const services = useSelector(selectServices)
  const [expandedEntities, setExpandedEntities] = useState({})

  const entityList = useMemo(() => Object.entries(entities), [entities])

  const toggleEntity = (name) => {
    setExpandedEntities((prev) => ({
      ...prev,
      [name]: !prev[name],
    }))
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">Graph Schema</h2>

      {/* Services */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
          Services
        </h3>
        <div className="space-y-1">
          {Object.entries(services).map(([name, svc]) => (
            <div key={name} className="text-sm">
              <span className="text-blue-400">{name}</span>
              <span className="text-gray-500 ml-2 text-xs">{svc.url}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Entities */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
          Entities
        </h3>
        <div className="space-y-2">
          {entityList.map(([name, entity]) => (
            <div key={name} className="border border-gray-700 rounded">
              <button
                onClick={() => toggleEntity(name)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-700/50"
              >
                <span className="text-purple-400 font-medium">{name}</span>
                <span className="text-gray-500 text-xs">{entity.service}</span>
              </button>

              {expandedEntities[name] && (
                <div className="px-3 py-2 border-t border-gray-700 text-sm">
                  {/* Fields */}
                  <div className="mb-2">
                    <div className="text-gray-500 text-xs uppercase mb-1">Fields</div>
                    {Object.entries(entity.fields || {}).map(([fieldName, field]) => (
                      <div key={fieldName} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="text-gray-300">{fieldName}</span>
                        <span className="text-gray-600">:</span>
                        <span className="text-yellow-400">{field.type}</span>
                        {field.filters?.length > 0 && (
                          <span className="text-gray-600 text-[10px]">
                            [{field.filters.join(', ')}]
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Relations */}
                  {Object.keys(entity.relations || {}).length > 0 && (
                    <div>
                      <div className="text-gray-500 text-xs uppercase mb-1">Relations</div>
                      {Object.entries(entity.relations).map(([relName, rel]) => (
                        <div key={relName} className="text-xs py-0.5">
                          <span className="text-green-400">{relName}</span>
                          <span className="text-gray-600"> -{'>'} </span>
                          <span className="text-purple-400">{rel.target}</span>
                          <span className="text-gray-600 ml-1">({rel.cardinality})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

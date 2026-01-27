// @ts-nocheck
import { useSelector, useDispatch } from 'react-redux'
import clsx from 'clsx'
import { selectDocumentation, clearDocumentation } from '../store/builderSlice'
import { selectGraph } from '../store/graphSlice'

export default function DocumentationPanel() {
  const dispatch = useDispatch()
  const documentation = useSelector(selectDocumentation)
  const graph = useSelector(selectGraph)

  if (!documentation) {
    return (
      <div className="h-full flex flex-col bg-gray-900 border-l border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-200">Documentation</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500 p-4">
          <div className="text-center">
            <svg className="w-10 h-10 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-xs">Click on a field or relation to see its documentation</p>
          </div>
        </div>
      </div>
    )
  }

  const { type, name, field, path, relation, entity } = documentation

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Documentation</h3>
        <button
          onClick={() => dispatch(clearDocumentation())}
          className="text-gray-500 hover:text-gray-300 p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {type === 'field' && (
          <FieldDocumentation name={name} field={field} path={path} />
        )}

        {type === 'relation' && (
          <RelationDocumentation name={name} relation={relation} path={path} graph={graph} />
        )}

        {type === 'entity' && (
          <EntityDocumentation name={name} entity={entity} graph={graph} />
        )}
      </div>
    </div>
  )
}

function FieldDocumentation({ name, field, path }) {
  const typeColors = {
    int: 'text-orange-400 bg-orange-900/30',
    string: 'text-green-400 bg-green-900/30',
    bool: 'text-purple-400 bg-purple-900/30',
    datetime: 'text-cyan-400 bg-cyan-900/30',
  }

  return (
    <div>
      {/* Field name */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Field</span>
        <h4 className="text-lg font-mono text-white mt-1">{name}</h4>
        <p className="text-xs text-gray-500 mt-1">{path}</p>
      </div>

      {/* Type */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Type</span>
        <div className="mt-1">
          <span className={clsx('px-2 py-1 rounded text-sm', typeColors[field.type] || 'text-gray-400 bg-gray-800')}>
            {field.type}
          </span>
        </div>
      </div>

      {/* Filters */}
      {field.filters && field.filters.length > 0 && (
        <div className="mb-4">
          <span className="text-xs text-gray-500 uppercase">Available Filters</span>
          <div className="mt-2 space-y-2">
            {field.filters.map(op => (
              <FilterDescription key={op} op={op} fieldName={name} fieldType={field.type} />
            ))}
          </div>
        </div>
      )}

      {/* Sortable */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Sortable</span>
        <p className="mt-1 text-sm text-gray-300">
          {field.sortable ? (
            <span className="text-green-400">Yes - can be used in order[]</span>
          ) : (
            <span className="text-gray-500">No</span>
          )}
        </p>
      </div>

      {/* Example */}
      <div>
        <span className="text-xs text-gray-500 uppercase">Example Filter</span>
        <pre className="mt-2 bg-gray-800 p-3 rounded text-sm font-mono text-gray-300 overflow-x-auto">
{`"filters": {
  "${name}__eq": ${field.type === 'string' ? '"value"' : field.type === 'int' ? '1' : 'true'}
}`}
        </pre>
      </div>
    </div>
  )
}

function FilterDescription({ op, fieldName, fieldType }) {
  const descriptions = {
    eq: { desc: 'Equals', example: `"${fieldName}__eq": value` },
    in: { desc: 'In list', example: `"${fieldName}__in": [val1, val2]` },
    icontains: { desc: 'Contains (case-insensitive)', example: `"${fieldName}__icontains": "text"` },
    gte: { desc: 'Greater than or equal', example: `"${fieldName}__gte": 10` },
    lte: { desc: 'Less than or equal', example: `"${fieldName}__lte": 100` },
    isnull: { desc: 'Is null/not null', example: `"${fieldName}__isnull": true` },
  }

  const info = descriptions[op] || { desc: op, example: `"${fieldName}__${op}": value` }

  return (
    <div className="flex items-start gap-2 text-sm">
      <code className="text-blue-400 bg-gray-800 px-1.5 py-0.5 rounded">{op}</code>
      <span className="text-gray-400">{info.desc}</span>
    </div>
  )
}

function RelationDocumentation({ name, relation, path, graph }) {
  const targetEntity = graph?.entities?.[relation.target]

  return (
    <div>
      {/* Relation name */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Relation</span>
        <h4 className="text-lg font-mono text-blue-400 mt-1">{name}</h4>
        <p className="text-xs text-gray-500 mt-1">{path}</p>
      </div>

      {/* Target */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Target Entity</span>
        <p className="mt-1 text-sm text-white">{relation.target}</p>
      </div>

      {/* Cardinality */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Cardinality</span>
        <div className="mt-1">
          <span className={clsx(
            'px-2 py-1 rounded text-sm',
            relation.cardinality === 'one' ? 'text-purple-400 bg-purple-900/30' : 'text-green-400 bg-green-900/30'
          )}>
            {relation.cardinality}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {relation.cardinality === 'one'
            ? 'Returns a single object or null'
            : 'Returns { items: [...], pagination: {...} }'}
        </p>
      </div>

      {/* Kind */}
      {relation.kind && (
        <div className="mb-4">
          <span className="text-xs text-gray-500 uppercase">Relation Kind</span>
          <p className="mt-1 text-sm text-gray-300">
            {relation.kind === 'provider' ? 'Provider (through table)' : 'Reference (FK)'}
          </p>
        </div>
      )}

      {/* Target fields */}
      {targetEntity && (
        <div>
          <span className="text-xs text-gray-500 uppercase">Available Fields</span>
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.keys(targetEntity.fields || {}).map(fieldName => (
              <span key={fieldName} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono">
                {fieldName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Example */}
      <div className="mt-4">
        <span className="text-xs text-gray-500 uppercase">Example</span>
        <pre className="mt-2 bg-gray-800 p-3 rounded text-sm font-mono text-gray-300 overflow-x-auto">
{`"relations": {
  "${name}": {
    "fields": ["id", ...],
    "filters": {},
    "limit": 10
  }
}`}
        </pre>
      </div>
    </div>
  )
}

function EntityDocumentation({ name, entity, graph }) {
  const fields = Object.entries(entity.fields || {})
  const relations = Object.entries(entity.relations || {})

  return (
    <div>
      {/* Entity name */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Entity</span>
        <h4 className="text-lg font-mono text-white mt-1">{name}</h4>
      </div>

      {/* Service */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Service</span>
        <p className="mt-1 text-sm text-blue-400">{entity.service}</p>
      </div>

      {/* Keys */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Primary Keys</span>
        <div className="mt-1 flex gap-1">
          {(entity.keys || ['id']).map(key => (
            <span key={key} className="text-xs bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded font-mono">
              {key}
            </span>
          ))}
        </div>
      </div>

      {/* Access */}
      {entity.access && entity.access.tenant_strategy !== 'none' && (
        <div className="mb-4">
          <span className="text-xs text-gray-500 uppercase">Access Control</span>
          <p className="mt-1 text-sm text-yellow-400">
            {entity.access.tenant_strategy}: {entity.access.tenant_field}
          </p>
        </div>
      )}

      {/* Fields summary */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 uppercase">Fields ({fields.length})</span>
        <div className="mt-2 flex flex-wrap gap-1">
          {fields.map(([fieldName, field]) => (
            <span key={fieldName} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono">
              {fieldName}
            </span>
          ))}
        </div>
      </div>

      {/* Relations summary */}
      {relations.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 uppercase">Relations ({relations.length})</span>
          <div className="mt-2 space-y-1">
            {relations.map(([relName, rel]) => (
              <div key={relName} className="flex items-center gap-2 text-sm">
                <span className="text-blue-400 font-mono">{relName}</span>
                <span className="text-gray-500">→</span>
                <span className="text-gray-400">{rel.target}</span>
                <span className={clsx(
                  'text-xs px-1 rounded',
                  rel.cardinality === 'one' ? 'bg-purple-900/50 text-purple-300' : 'bg-green-900/50 text-green-300'
                )}>
                  {rel.cardinality}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useDispatch } from 'react-redux'
import { setQueryText, executeQuery } from '../store/querySlice'

const EXAMPLES = [
  {
    name: 'Person with Properties',
    query: {
      action: 'query',
      entity: 'Person',
      filters: { id__eq: 1 },
      select: {
        fields: ['id', 'first_name', 'last_name'],
        relations: {
          owned_properties: {
            fields: ['id', 'subject_id', 'object_id', 'status'],
            filters: { status__eq: 'active' },
            limit: 50,
            relations: {
              property: {
                fields: ['id', 'name', 'rc_id'],
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'All Persons (list)',
    query: {
      action: 'query',
      entity: 'Person',
      filters: {},
      select: {
        fields: ['id', 'first_name', 'last_name'],
        order: ['first_name'],
        limit: 10,
      },
    },
  },
  {
    name: 'Properties by RC',
    query: {
      action: 'query',
      entity: 'Property',
      filters: { rc_id__eq: 1 },
      select: {
        fields: ['id', 'name', 'rc_id'],
        order: ['name'],
      },
    },
  },
  {
    name: 'Search by Name',
    query: {
      action: 'query',
      entity: 'Person',
      filters: { first_name__icontains: 'an' },
      select: {
        fields: ['id', 'first_name', 'last_name'],
      },
    },
  },
  {
    name: 'Active Relationships',
    query: {
      action: 'query',
      entity: 'Relationship',
      filters: { status__eq: 'active', relationship_type__eq: 'property_owner' },
      select: {
        fields: ['id', 'subject_id', 'object_id', 'status'],
        limit: 20,
        relations: {
          property: {
            fields: ['id', 'name'],
          },
        },
      },
    },
  },
]

export default function ExampleQueries() {
  const dispatch = useDispatch()

  const handleSelect = (example) => {
    const queryText = JSON.stringify(example.query, null, 2)
    dispatch(setQueryText(queryText))
  }

  const handleRun = (example) => {
    const queryText = JSON.stringify(example.query, null, 2)
    dispatch(setQueryText(queryText))
    dispatch(executeQuery(example.query))
  }

  return (
    <div>
      <div className="text-sm text-gray-400 mb-2">Example Queries:</div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <div key={example.name} className="flex">
            <button
              onClick={() => handleSelect(example)}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-l border-r border-gray-600"
            >
              {example.name}
            </button>
            <button
              onClick={() => handleRun(example)}
              className="px-2 py-1 text-sm bg-green-700 hover:bg-green-600 text-white rounded-r"
              title="Run"
            >
              Run
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

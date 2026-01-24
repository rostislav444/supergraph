import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { loadExample } from '../store/querySlice'

const EXAMPLES = [
  {
    name: 'Get Person by ID',
    description: 'Single person with nested properties',
    query: {
      action: "query",
      entity: "Person",
      filters: { "id__eq": 1 },
      select: {
        fields: ["id", "first_name", "last_name"],
        relations: {
          owned_properties: {
            fields: ["id", "subject_id", "object_id", "status"],
            filters: { "status__eq": "active" },
            relations: {
              property: {
                fields: ["id", "name", "rc_id"]
              }
            }
          }
        }
      }
    }
  },
  {
    name: 'List All Persons',
    description: 'All persons without relations',
    query: {
      action: "query",
      entity: "Person",
      filters: {},
      select: {
        fields: ["id", "first_name", "last_name"]
      }
    }
  },
  {
    name: 'Search by Name',
    description: 'Find persons by name pattern',
    query: {
      action: "query",
      entity: "Person",
      filters: { "first_name__icontains": "a" },
      select: {
        fields: ["id", "first_name", "last_name"]
      }
    }
  },
  {
    name: 'Properties with RC filter',
    description: 'Properties filtered by residential complex',
    query: {
      action: "query",
      entity: "Property",
      filters: { "rc_id__eq": 1 },
      select: {
        fields: ["id", "name", "rc_id"]
      }
    }
  },
  {
    name: 'Active Relationships',
    description: 'Only active property owner relationships',
    query: {
      action: "query",
      entity: "Relationship",
      filters: {
        "status__eq": "active",
        "relationship_type__eq": "property_owner"
      },
      select: {
        fields: ["id", "subject_id", "object_id", "status"],
        relations: {
          property: {
            fields: ["id", "name"]
          }
        }
      }
    }
  },
  {
    name: 'Multiple Persons',
    description: 'Fetch multiple persons by IDs',
    query: {
      action: "query",
      entity: "Person",
      filters: { "id__in": [1, 2, 3] },
      select: {
        fields: ["id", "first_name", "last_name"],
        relations: {
          owned_properties: {
            fields: ["id", "status"],
            relations: {
              property: {
                fields: ["id", "name"]
              }
            }
          }
        }
      }
    }
  }
]

function ExampleQueries() {
  const dispatch = useDispatch()

  const handleSelect = useCallback((query) => {
    dispatch(loadExample(query))
  }, [dispatch])

  return (
    <div className="border-t border-gray-700 p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Example Queries
      </h3>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example, idx) => (
          <button
            key={idx}
            onClick={() => handleSelect(example.query)}
            className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-sm text-gray-300 transition-colors"
            title={example.description}
          >
            {example.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ExampleQueries

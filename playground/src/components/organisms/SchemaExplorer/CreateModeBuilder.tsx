import { useMemo, useCallback } from 'react'
import { DataFieldItem } from '@molecules/DataFieldItem'
import { FieldItem } from '@molecules/FieldItem'
import type { Entity, Graph, Field } from '@/types'
import { getDefaultValue, isFieldRequired } from '@utils/fieldHelpers'

export interface CreateModeBuilderProps {
  entityName: string
  entity: Entity
  graph: Graph
  queryText: string
  onUpdateQuery: (text: string) => void
}

export function CreateModeBuilder({
  entityName,
  entity,
  graph,
  queryText,
  onUpdateQuery,
}: CreateModeBuilderProps) {
  const fields = useMemo(
    () => Object.entries(entity?.fields || {}) as Array<[string, Field]>,
    [entity]
  )

  // Separate fields into required and optional
  const { requiredFields, optionalFields } = useMemo(() => {
    const required: Array<[string, Field]> = []
    const optional: Array<[string, Field]> = []
    fields.forEach(([name, field]) => {
      if (name === 'id') return // Skip id for create
      if (isFieldRequired(field, name)) {
        required.push([name, field])
      } else {
        optional.push([name, field])
      }
    })
    return { requiredFields: required, optionalFields: optional }
  }, [fields])

  // Parse current query to get selected fields and their values
  const currentState = useMemo(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName]
      if (createOp) {
        const dataFields = createOp.data ? Object.keys(createOp.data) : []
        const dataValues = createOp.data || {}
        // Add required fields that might be missing
        requiredFields.forEach(([name]) => {
          if (!dataFields.includes(name)) {
            dataFields.push(name)
          }
        })
        return {
          dataFields,
          dataValues,
          responseFields: createOp.response || [],
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      dataFields: requiredFields.map(([name]) => name),
      dataValues: {},
      responseFields: [],
    }
  }, [queryText, entityName, requiredFields])

  // Ensure required fields are in data
  const ensureRequiredFields = useCallback(
    (data: Record<string, unknown>) => {
      const newData = { ...data }
      requiredFields.forEach(([name, field]) => {
        if (newData[name] === undefined) {
          newData[name] = getDefaultValue(field)
        }
      })
      return newData
    },
    [requiredFields]
  )

  // Toggle data field
  const handleToggleDataField = useCallback(
    (fieldName: string, field: Field) => {
      if (isFieldRequired(field, fieldName)) return

      try {
        const parsed = JSON.parse(queryText)
        const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

        if (createOp.data[fieldName] !== undefined) {
          delete createOp.data[fieldName]
        } else {
          createOp.data[fieldName] = getDefaultValue(field)
        }

        createOp.data = ensureRequiredFields(createOp.data)

        const newQuery = { create: { [entityName]: createOp } }
        onUpdateQuery(JSON.stringify(newQuery, null, 2))
      } catch {
        // Ignore parse errors
      }
    },
    [queryText, entityName, onUpdateQuery, ensureRequiredFields]
  )

  // Update field value
  const handleValueChange = useCallback(
    (fieldName: string, value: unknown) => {
      try {
        const parsed = JSON.parse(queryText)
        const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

        createOp.data[fieldName] = value
        createOp.data = ensureRequiredFields(createOp.data)

        const newQuery = { create: { [entityName]: createOp } }
        onUpdateQuery(JSON.stringify(newQuery, null, 2))
      } catch {
        // Ignore parse errors
      }
    },
    [queryText, entityName, onUpdateQuery, ensureRequiredFields]
  )

  // Toggle response field
  const handleToggleResponseField = useCallback(
    (fieldName: string) => {
      try {
        const parsed = JSON.parse(queryText)
        const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

        const response = createOp.response || []
        const idx = response.indexOf(fieldName)
        if (idx >= 0) {
          response.splice(idx, 1)
        } else {
          response.push(fieldName)
        }
        createOp.response = response

        const newQuery = { create: { [entityName]: createOp } }
        onUpdateQuery(JSON.stringify(newQuery, null, 2))
      } catch {
        // Ignore parse errors
      }
    },
    [queryText, entityName, onUpdateQuery]
  )

  // Select all optional data fields
  const handleSelectAllData = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      optionalFields.forEach(([name, field]) => {
        if (createOp.data[name] === undefined) {
          createOp.data[name] = getDefaultValue(field)
        }
      })

      createOp.data = ensureRequiredFields(createOp.data)

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {
      // Ignore parse errors
    }
  }, [queryText, entityName, optionalFields, onUpdateQuery, ensureRequiredFields])

  // Clear optional data fields (keep required)
  const handleClearData = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      const newData: Record<string, unknown> = {}
      requiredFields.forEach(([name, field]) => {
        newData[name] =
          createOp.data?.[name] !== undefined ? createOp.data[name] : getDefaultValue(field)
      })
      createOp.data = newData

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {
      // Ignore parse errors
    }
  }, [queryText, entityName, requiredFields, onUpdateQuery])

  // Select all response fields
  const handleSelectAllResponse = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      createOp.response = fields.map(([name]) => name)

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {
      // Ignore parse errors
    }
  }, [queryText, entityName, fields, onUpdateQuery])

  // Clear response fields
  const handleClearResponse = useCallback(() => {
    try {
      const parsed = JSON.parse(queryText)
      const createOp = parsed.create?.[entityName] || { data: {}, response: ['id'] }

      createOp.response = []

      const newQuery = { create: { [entityName]: createOp } }
      onUpdateQuery(JSON.stringify(newQuery, null, 2))
    } catch {
      // Ignore parse errors
    }
  }, [queryText, entityName, onUpdateQuery])

  // All data fields (required first, then optional)
  const allDataFields = useMemo(
    () => [...requiredFields, ...optionalFields],
    [requiredFields, optionalFields]
  )

  return (
    <div className="flex-1 overflow-auto p-2">
      {/* Request Body Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1 px-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase">Request Body (data)</span>
            {requiredFields.length > 0 && (
              <span className="text-[10px] text-red-400/60">
                <span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1"></span>
                = required
              </span>
            )}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={handleSelectAllData} className="text-blue-400 hover:text-blue-300">
              all
            </button>
            <span className="text-gray-600">·</span>
            <button onClick={handleClearData} className="text-gray-500 hover:text-gray-300">
              clear
            </button>
          </div>
        </div>

        {allDataFields.map(([name, field]) => {
          const isRequired = isFieldRequired(field, name)
          return (
            <DataFieldItem
              key={name}
              name={name}
              field={field}
              selected={currentState.dataFields.includes(name)}
              value={currentState.dataValues[name]}
              onToggle={() => handleToggleDataField(name, field)}
              onValueChange={(val) => handleValueChange(name, val)}
              required={isRequired}
              disabled={isRequired}
              graph={graph}
              entityName={entityName}
            />
          )
        })}
      </div>

      {/* Response Fields Section */}
      <div>
        <div className="flex items-center justify-between mb-1 px-2">
          <span className="text-xs text-gray-500 uppercase">Response Fields</span>
          <div className="flex gap-2 text-xs">
            <button
              onClick={handleSelectAllResponse}
              className="text-blue-400 hover:text-blue-300"
            >
              all
            </button>
            <span className="text-gray-600">·</span>
            <button onClick={handleClearResponse} className="text-gray-500 hover:text-gray-300">
              clear
            </button>
          </div>
        </div>

        {fields.map(([name, field]) => (
          <FieldItem
            key={name}
            name={name}
            field={field}
            path="response"
            selected={currentState.responseFields.includes(name)}
            onToggle={() => handleToggleResponseField(name)}
            required={false}
            disabled={false}
          />
        ))}
      </div>
    </div>
  )
}

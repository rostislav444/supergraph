import { useState, useMemo, useCallback } from 'react'
import clsx from 'clsx'
import { ChevronIcon } from '@atoms/icons/ChevronIcon'
import { CheckIcon } from '@atoms/CheckIcon'
import { TruncatedText } from '@atoms/TruncatedText'
import FkLookupModal from '@/components/FkLookupModal'
import type { Entity, Graph, TransactionStep, ColorConfig, Field } from '@/types'
import { STEP_OPERATIONS } from '@constants/filters'
import { OP_BADGE_COLORS } from '@constants/colors'
import { getDefaultValue, isFieldRequired, generateTestData, inferTargetEntity } from '@utils/fieldHelpers'

export interface TransactionStepCardProps {
  step: TransactionStep
  index: number
  entityDef: Entity | null
  entityColor: ColorConfig
  entityNumber: number
  variables: string[]
  onUpdate: (step: TransactionStep) => void
  onRemove: () => void
  graph: Graph
  allEntityNames: string[]
}

interface StepInfo {
  operation: string
  entityName: string
  alias: string | null
  stepData: Record<string, unknown>
}

export function TransactionStepCard({
  step,
  entityDef,
  entityColor,
  entityNumber,
  variables,
  onUpdate,
  onRemove,
  graph,
  allEntityNames,
}: TransactionStepCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [showResponse, setShowResponse] = useState(false)
  const [lookupField, setLookupField] = useState<{ fieldName: string; targetEntity: string } | null>(null)

  const info = useMemo((): StepInfo | null => {
    const operation = Object.keys(step).find((k) =>
      ['create', 'update', 'delete', 'get_or_create'].includes(k)
    )
    if (!operation) return null
    const entityData = step[operation as keyof TransactionStep] as Record<string, Record<string, unknown>>
    const entityName = Object.keys(entityData)[0]
    return {
      operation,
      entityName,
      alias: step.as || null,
      stepData: entityData[entityName] || {},
    }
  }, [step])

  if (!info || !entityDef) return null

  const fields = Object.entries(entityDef.fields || {}) as Array<[string, Field]>
  const rawDataFields = (info.stepData.data as Record<string, unknown>) || {}
  const responseFields = (info.stepData.response as string[]) || []
  const isDeleteOp = info.operation === 'delete'

  // Ensure required fields are always in dataFields
  const dataFields = useMemo(() => {
    if (isDeleteOp) return rawDataFields
    const result = { ...rawDataFields }
    fields.forEach(([fieldName, field]) => {
      if (fieldName !== 'id' && isFieldRequired(field, fieldName) && result[fieldName] === undefined) {
        result[fieldName] = getDefaultValue(field)
      }
    })
    return result
  }, [rawDataFields, fields, isDeleteOp])

  // Update step data helper
  const updateStepData = (updates: Record<string, unknown>) => {
    const newStepData = { ...info.stepData, ...updates }

    // Ensure required fields are always in data (except for delete operation)
    if (info.operation !== 'delete' && newStepData.data) {
      const data = newStepData.data as Record<string, unknown>
      fields.forEach(([fieldName, field]) => {
        if (fieldName !== 'id' && isFieldRequired(field, fieldName) && data[fieldName] === undefined) {
          data[fieldName] = getDefaultValue(field)
        }
      })
    }

    onUpdate({
      [info.operation]: {
        [info.entityName]: newStepData,
      },
      as: step.as,
    })
  }

  // Toggle data field (but required fields cannot be unchecked)
  const handleToggleDataField = (fieldName: string, field: Field) => {
    // Prevent unchecking required fields
    if (isFieldRequired(field, fieldName) && dataFields[fieldName] !== undefined) {
      return // Cannot uncheck required field
    }

    const newData = { ...dataFields }
    if (newData[fieldName] !== undefined) {
      delete newData[fieldName]
    } else {
      newData[fieldName] = getDefaultValue(field)
    }
    updateStepData({ data: newData })
  }

  // Update field value
  const handleValueChange = (fieldName: string, value: unknown) => {
    const newData = { ...dataFields, [fieldName]: value }
    updateStepData({ data: newData })
  }

  // Toggle response field
  const handleToggleResponseField = (fieldName: string) => {
    const newResponse = [...responseFields]
    const idx = newResponse.indexOf(fieldName)
    if (idx >= 0) {
      newResponse.splice(idx, 1)
    } else {
      newResponse.push(fieldName)
    }
    updateStepData({ response: newResponse })
  }

  // Change operation type
  const handleChangeOperation = (newOp: string) => {
    let newStepData
    if (newOp === 'delete') {
      newStepData = { id: (info.stepData.id as number) || 1 }
    } else {
      // Ensure required fields are present
      const ensuredData = { ...(info.stepData.data as Record<string, unknown>) }
      fields.forEach(([fieldName, field]) => {
        if (fieldName !== 'id' && isFieldRequired(field, fieldName) && ensuredData[fieldName] === undefined) {
          ensuredData[fieldName] = getDefaultValue(field)
        }
      })
      newStepData = { ...info.stepData, data: ensuredData }
    }
    onUpdate({
      [newOp]: {
        [info.entityName]: newStepData,
      },
      as: step.as,
    })
  }

  // Update ID field
  const handleIdChange = (value: string) => {
    updateStepData({ id: parseInt(value) || 1 })
  }

  // Fill with test data
  const handleFillTestData = () => {
    const testData: Record<string, unknown> = {}
    Object.entries(dataFields).forEach(([name]) => {
      const field = fields.find(([n]) => n === name)?.[1]
      if (field) {
        testData[name] = generateTestData(name, field)
      }
    })
    updateStepData({ data: testData })
  }

  // Select all data fields
  const handleSelectAllData = () => {
    const allData: Record<string, unknown> = {}
    fields.forEach(([name, field]) => {
      if (name !== 'id') allData[name] = getDefaultValue(field)
    })
    updateStepData({ data: allData })
  }

  // Get target entity for a FK field
  const getTargetEntity = useCallback((fieldName: string) => {
    if (!fieldName.endsWith('_id')) return null
    // Try to find from relations
    const relations = entityDef?.relations || {}
    for (const [, rel] of Object.entries(relations)) {
      if (rel.ref?.from_field === fieldName) {
        return rel.target || rel.ref?.to_entity
      }
    }
    // Fallback to infer from field name
    return inferTargetEntity(fieldName, info?.entityName || '', allEntityNames)
  }, [entityDef, info, allEntityNames])

  // Handle opening FK lookup modal
  const handleOpenLookup = useCallback((fieldName: string) => {
    const targetEntity = getTargetEntity(fieldName)
    if (targetEntity) {
      setLookupField({ fieldName, targetEntity })
    }
  }, [getTargetEntity])

  // Handle selecting from FK lookup modal
  const handleLookupSelect = useCallback((id: number) => {
    if (!lookupField) return
    handleValueChange(lookupField.fieldName, id)
    setLookupField(null)
  }, [lookupField, handleValueChange])

  // Clear data fields (keep required)
  const handleClearData = () => {
    const requiredData: Record<string, unknown> = {}
    fields.forEach(([name, field]) => {
      if (name !== 'id' && isFieldRequired(field, name)) {
        requiredData[name] = dataFields[name] !== undefined ? dataFields[name] : getDefaultValue(field)
      }
    })
    updateStepData({ data: requiredData })
  }

  return (
    <div className={clsx('mb-3 rounded-lg border overflow-hidden', entityColor.bg, entityColor.border)}>
      {/* Header - Entity name + alias */}
      <div className={clsx('px-3 py-2 flex items-center justify-between', entityColor.header)}>
        <div className="flex items-center gap-2">
          <span className={clsx('text-sm font-bold', entityColor.text)}>{info.entityName}</span>
          <span className="text-xs text-purple-300 font-mono bg-purple-900/50 px-1.5 py-0.5 rounded">
            ${info.entityName.toLowerCase()}
            {entityNumber}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-800/50 rounded text-gray-400 hover:text-white"
          >
            <ChevronIcon expanded={expanded} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Operation selector */}
      <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
        <span className="text-xs text-gray-500">Action:</span>
        <div className="flex gap-1">
          {STEP_OPERATIONS.map((op) => (
            <button
              key={op.id}
              onClick={() => handleChangeOperation(op.id)}
              className={clsx(
                'text-xs px-2 py-1 rounded transition-colors',
                info.operation === op.id
                  ? OP_BADGE_COLORS[op.id as keyof typeof OP_BADGE_COLORS]
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              )}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 py-2">
          {/* ID field for update/delete */}
          {(info.operation === 'update' || info.operation === 'delete') && (
            <div className="mb-3">
              <div className="text-xs text-gray-500 uppercase mb-1">Target ID</div>
              <input
                type="number"
                value={(info.stepData.id as number) || ''}
                onChange={(e) => handleIdChange(e.target.value)}
                placeholder="Record ID"
                className="w-full bg-gray-700 text-xs h-6 px-2 rounded border border-gray-600 text-white"
              />
            </div>
          )}

          {/* Data fields (not for delete) */}
          {!isDeleteOp && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 uppercase">Data</span>
                <div className="flex gap-2 text-[10px]">
                  <button
                    onClick={handleFillTestData}
                    className="text-green-400 hover:text-green-300"
                    title="Fill selected fields with test data"
                  >
                    test
                  </button>
                  <button onClick={handleSelectAllData} className="text-blue-400 hover:text-blue-300">
                    all
                  </button>
                  <button onClick={handleClearData} className="text-gray-500 hover:text-gray-300">
                    clear
                  </button>
                </div>
              </div>
              <div
                className="grid gap-0.5"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
              >
                {fields
                  .filter(([name]) => name !== 'id')
                  .sort(([nameA, fieldA], [nameB, fieldB]) => {
                    const aRequired = isFieldRequired(fieldA, nameA)
                    const bRequired = isFieldRequired(fieldB, nameB)
                    // Required fields first
                    if (aRequired && !bRequired) return -1
                    if (!aRequired && bRequired) return 1
                    // Then alphabetically within each group
                    return nameA.localeCompare(nameB)
                  })
                  .map(([name, field]) => {
                    const isEnum = field.type === 'enum' && field.enum_values && field.enum_values.length > 0
                    const selected = dataFields[name] !== undefined
                    const value = dataFields[name]
                    const isRequired = isFieldRequired(field, name)

                    // Check if this is a reference field (ends with _id)
                    const isRefField = name.endsWith('_id')

                    // Check if required field has empty value
                    const isEmptyRequired =
                      isRequired &&
                      selected &&
                      (value === '' ||
                        value === null ||
                        value === undefined ||
                        (field.type === 'string' && typeof value === 'string' && value.trim() === '') ||
                        (field.type === 'int' && isRefField && (value === 0 || value === '0')))

                    return (
                      <div
                        key={name}
                        className={clsx(
                          'grid h-6 px-1 rounded items-center gap-1',
                          isEmptyRequired ? 'bg-red-900/30' : isRequired ? 'bg-amber-900/20' : 'bg-gray-800/30'
                        )}
                        style={{ gridTemplateColumns: '16px 2fr 1fr' }}
                      >
                        <div
                          className={clsx(
                            isRequired && selected ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                          )}
                          onClick={() => handleToggleDataField(name, field)}
                          title={isRequired ? 'Required field (cannot be unchecked)' : undefined}
                        >
                          <CheckIcon checked={selected} small />
                        </div>
                        <div className="min-w-0 overflow-hidden flex items-center gap-0.5">
                          <TruncatedText
                            text={name}
                            className={clsx(
                              'text-[10px] font-mono truncate block',
                              isEmptyRequired ? 'text-red-400' : isRequired ? 'text-amber-300' : 'text-gray-300'
                            )}
                          />
                          {isRequired && (
                            <span className={clsx('text-[10px]', isEmptyRequired ? 'text-red-500' : 'text-amber-500')}>
                              *
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex items-center gap-0.5">
                          {selected ? (
                            isRefField ? (
                              <div className="flex items-center gap-0.5 min-w-0 w-full">
                                {variables.length > 0 ? (
                                  <select
                                    value={typeof value === 'string' && value.startsWith('$') ? value : ''}
                                    onChange={(e) =>
                                      handleValueChange(name, e.target.value || parseInt(value as string) || 0)
                                    }
                                    className={clsx(
                                      'flex-1 bg-gray-700 text-[10px] h-5 px-1 rounded border text-purple-300 min-w-0',
                                      isEmptyRequired ? 'border-red-500' : 'border-gray-600'
                                    )}
                                  >
                                    <option value="">Manual ID...</option>
                                    {variables.map((v) => (
                                      <option key={v} value={`${v}.id`}>
                                        {v}.id
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="number"
                                    value={typeof value === 'string' && value.startsWith('$') ? '' : ((value ?? '') as string | number)}
                                    onChange={(e) => handleValueChange(name, parseInt(e.target.value) || 0)}
                                    placeholder={isRequired ? 'Required...' : 'ID...'}
                                    className={clsx(
                                      'flex-1 bg-gray-700 text-[10px] h-5 px-1 rounded border text-white placeholder-gray-500 min-w-0',
                                      isEmptyRequired ? 'border-red-500 placeholder-red-400' : 'border-gray-600'
                                    )}
                                  />
                                )}
                                {getTargetEntity(name) && (
                                  <button
                                    onClick={() => handleOpenLookup(name)}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gray-600 hover:bg-gray-500 rounded text-gray-300 hover:text-white"
                                    title={`Search ${getTargetEntity(name)}`}
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                      />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            ) : isEnum ? (
                              <select
                                value={(value as string) || ''}
                                onChange={(e) => handleValueChange(name, e.target.value)}
                                className={clsx(
                                  'w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white',
                                  isEmptyRequired ? 'border-red-500' : 'border-gray-600'
                                )}
                              >
                                <option value="" disabled>
                                  Select...
                                </option>
                                {field.enum_values?.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            ) : field.type === 'bool' ? (
                              <select
                                value={value === true ? 'true' : 'false'}
                                onChange={(e) => handleValueChange(name, e.target.value === 'true')}
                                className="w-full bg-gray-700 text-[10px] h-5 px-1 rounded border border-gray-600 text-white"
                              >
                                <option value="false">false</option>
                                <option value="true">true</option>
                              </select>
                            ) : field.type === 'date' ? (
                              <input
                                type="date"
                                value={value ? (typeof value === 'string' ? value.slice(0, 10) : '') : ''}
                                onChange={(e) => handleValueChange(name, e.target.value)}
                                className={clsx(
                                  'w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white',
                                  isEmptyRequired ? 'border-red-500' : 'border-gray-600'
                                )}
                              />
                            ) : field.type === 'datetime' ? (
                              <input
                                type="datetime-local"
                                value={value ? (typeof value === 'string' ? value.slice(0, 16) : '') : ''}
                                onChange={(e) =>
                                  handleValueChange(name, e.target.value ? new Date(e.target.value).toISOString() : '')
                                }
                                className={clsx(
                                  'w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white',
                                  isEmptyRequired ? 'border-red-500' : 'border-gray-600'
                                )}
                              />
                            ) : (
                              <input
                                type={field.type === 'int' ? 'number' : 'text'}
                                value={(value ?? '') as string | number}
                                onChange={(e) =>
                                  handleValueChange(name, field.type === 'int' ? parseInt(e.target.value) || 0 : e.target.value)
                                }
                                placeholder={isRequired ? 'Required...' : '...'}
                                className={clsx(
                                  'w-full bg-gray-700 text-[10px] h-5 px-1 rounded border text-white placeholder-gray-500',
                                  isEmptyRequired ? 'border-red-500 placeholder-red-400' : 'border-gray-600'
                                )}
                              />
                            )
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Response fields (collapsible, hidden by default) */}
          {!isDeleteOp && (
            <div className="border-t border-gray-700/50 pt-2 mt-2">
              <button
                onClick={() => setShowResponse(!showResponse)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 w-full"
              >
                <ChevronIcon expanded={showResponse} />
                <span className="uppercase">Response</span>
                <span className="text-[10px] text-gray-600">({responseFields.length} fields)</span>
              </button>
              {showResponse && (
                <div className="mt-2">
                  <div className="flex gap-2 text-[10px] mb-1 justify-end">
                    <button
                      onClick={() => updateStepData({ response: fields.map(([n]) => n) })}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      all
                    </button>
                    <button
                      onClick={() => updateStepData({ response: ['id'] })}
                      className="text-gray-500 hover:text-gray-300"
                    >
                      clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {fields.map(([name]) => (
                      <button
                        key={name}
                        onClick={() => handleToggleResponseField(name)}
                        className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          responseFields.includes(name)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        )}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FK Lookup Modal */}
      {lookupField && (
        <FkLookupModal
          isOpen={!!lookupField}
          onClose={() => setLookupField(null)}
          onSelect={handleLookupSelect}
          targetEntity={lookupField.targetEntity}
          graph={graph}
        />
      )}
    </div>
  )
}

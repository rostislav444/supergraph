import { useState, useMemo, useCallback } from 'react'
import clsx from 'clsx'
import { TransactionStepCard } from './TransactionStepCard'
import type { Graph, Entity, TransactionStep, Transaction } from '@/types'
import { ENTITY_COLORS } from '@constants/colors'
import { getDefaultValue, isFieldRequired } from '@utils/fieldHelpers'

export interface TransactionBuilderProps {
  graph: Graph
  queryText: string
  entities: Array<[string, Entity]>
  onUpdateQuery: (text: string) => void
}

export function TransactionBuilder({ graph, queryText, entities, onUpdateQuery }: TransactionBuilderProps) {
  const [showAddEntity, setShowAddEntity] = useState(false)
  const [entityFilter, setEntityFilter] = useState('')

  // Get all entity names for FK lookup
  const allEntityNames = useMemo(() => entities.map(([name]) => name), [entities])

  // Parse current transaction from query text
  const currentTransaction = useMemo((): Transaction => {
    try {
      const parsed = JSON.parse(queryText)
      return parsed.transaction || { steps: [], on_error: 'rollback' }
    } catch {
      return { steps: [], on_error: 'rollback' }
    }
  }, [queryText])

  const steps = currentTransaction.steps || []

  // Calculate entity counts for proper numbering
  const entityCounters = useMemo(() => {
    const counters: Record<string, number> = {}
    steps.forEach((step) => {
      const operation = Object.keys(step).find((k) =>
        ['create', 'update', 'delete', 'get_or_create'].includes(k)
      )
      if (operation) {
        const entityData = step[operation as keyof TransactionStep] as Record<string, unknown>
        const entityName = Object.keys(entityData)[0]
        counters[entityName] = (counters[entityName] || 0) + 1
      }
    })
    return counters
  }, [steps])

  // Get entity number for a step (1-based, per entity type)
  const getEntityNumber = useCallback(
    (stepIndex: number) => {
      const step = steps[stepIndex]
      const operation = Object.keys(step).find((k) =>
        ['create', 'update', 'delete', 'get_or_create'].includes(k)
      )
      if (!operation) return 1
      const entityData = step[operation as keyof TransactionStep] as Record<string, unknown>
      const entityName = Object.keys(entityData)[0]

      let count = 0
      for (let i = 0; i <= stepIndex; i++) {
        const s = steps[i]
        const op = Object.keys(s).find((k) => ['create', 'update', 'delete', 'get_or_create'].includes(k))
        if (op) {
          const ed = s[op as keyof TransactionStep] as Record<string, unknown>
          const en = Object.keys(ed)[0]
          if (en === entityName) count++
        }
      }
      return count
    },
    [steps]
  )

  // Get unique entity names in order of first appearance
  const orderedEntities = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const step of steps) {
      const operation = Object.keys(step).find((k) =>
        ['create', 'update', 'delete', 'get_or_create'].includes(k)
      )
      if (operation) {
        const entityData = step[operation as keyof TransactionStep] as Record<string, unknown>
        const entityName = Object.keys(entityData)[0]
        if (entityName && !seen.has(entityName)) {
          seen.add(entityName)
          ordered.push(entityName)
        }
      }
    }
    return ordered
  }, [steps])

  // Get entity color based on order of first appearance
  const getEntityColor = useCallback(
    (entityName: string) => {
      const index = orderedEntities.indexOf(entityName)
      // If entity not in list yet (new entity being added), use next available color
      const colorIndex = index >= 0 ? index : orderedEntities.length
      return ENTITY_COLORS[colorIndex % ENTITY_COLORS.length]
    },
    [orderedEntities]
  )

  // Get available variables (aliases from previous steps)
  const getAvailableVariables = useCallback(
    (stepIndex: number) => {
      const vars: string[] = []
      for (let i = 0; i < stepIndex; i++) {
        if (steps[i].as) {
          vars.push(steps[i].as!)
        }
      }
      return vars
    },
    [steps]
  )

  // Add a new step
  const handleAddStep = useCallback(
    (entityName: string) => {
      const entity = graph?.entities?.[entityName]
      if (!entity) return

      // Calculate next number for this entity
      const currentCount = entityCounters[entityName] || 0
      const nextNumber = currentCount + 1

      // Pre-populate required fields with default values
      const requiredData: Record<string, unknown> = {}
      Object.entries(entity.fields || {}).forEach(([fieldName, field]) => {
        if (fieldName !== 'id' && isFieldRequired(field, fieldName)) {
          requiredData[fieldName] = getDefaultValue(field)
        }
      })

      const newStep: TransactionStep = {
        create: {
          [entityName]: {
            data: requiredData,
            response: ['id'],
          },
        },
        as: `$${entityName.toLowerCase()}${nextNumber}`,
      }

      const newTransaction = {
        transaction: {
          ...currentTransaction,
          steps: [...steps, newStep],
        },
      }

      onUpdateQuery(JSON.stringify(newTransaction, null, 2))
      setShowAddEntity(false)
    },
    [graph, steps, currentTransaction, entityCounters, onUpdateQuery]
  )

  // Update a step
  const handleUpdateStep = useCallback(
    (index: number, newStep: TransactionStep) => {
      const newSteps = [...steps]

      // Recalculate alias with proper numbering
      const operation = Object.keys(newStep).find((k) =>
        ['create', 'update', 'delete', 'get_or_create'].includes(k)
      )
      if (operation) {
        const entityData = newStep[operation as keyof TransactionStep] as Record<string, unknown>
        const entityName = Object.keys(entityData)[0]
        const entityNumber = getEntityNumber(index)
        newStep.as = `$${entityName.toLowerCase()}${entityNumber}`
      }

      newSteps[index] = newStep

      const newTransaction = {
        transaction: {
          ...currentTransaction,
          steps: newSteps,
        },
      }
      onUpdateQuery(JSON.stringify(newTransaction, null, 2))
    },
    [steps, currentTransaction, getEntityNumber, onUpdateQuery]
  )

  // Remove a step
  const handleRemoveStep = useCallback(
    (index: number) => {
      const newSteps = steps.filter((_, i) => i !== index)
      const newTransaction = {
        transaction: {
          ...currentTransaction,
          steps: newSteps,
        },
      }
      onUpdateQuery(JSON.stringify(newTransaction, null, 2))
    },
    [steps, currentTransaction, onUpdateQuery]
  )

  // Get entity def for a step
  const getEntityDef = useCallback(
    (step: TransactionStep) => {
      const operation = Object.keys(step).find((k) =>
        ['create', 'update', 'delete', 'get_or_create'].includes(k)
      )
      if (!operation) return null
      const entityData = step[operation as keyof TransactionStep] as Record<string, unknown>
      const entityName = Object.keys(entityData)[0]
      return graph?.entities?.[entityName] || null
    },
    [graph]
  )

  // Get entity name for a step
  const getEntityName = useCallback((step: TransactionStep) => {
    const operation = Object.keys(step).find((k) =>
      ['create', 'update', 'delete', 'get_or_create'].includes(k)
    )
    if (!operation) return null
    const entityData = step[operation as keyof TransactionStep] as Record<string, unknown>
    return Object.keys(entityData)[0]
  }, [])

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Transaction Builder</span>
          <span className="text-xs text-purple-400">
            {steps.length} step{steps.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {/* Steps */}
        {steps.map((step, index) => {
          const entityName = getEntityName(step)
          return (
            <TransactionStepCard
              key={index}
              step={step}
              index={index}
              entityDef={getEntityDef(step)}
              entityColor={getEntityColor(entityName || '')}
              entityNumber={getEntityNumber(index)}
              variables={getAvailableVariables(index)}
              onUpdate={(newStep) => handleUpdateStep(index, newStep)}
              onRemove={() => handleRemoveStep(index)}
              graph={graph}
              allEntityNames={allEntityNames}
            />
          )
        })}

        {/* Add step button */}
        {!showAddEntity ? (
          <button
            onClick={() => setShowAddEntity(true)}
            className="w-full py-2 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Step
          </button>
        ) : (
          <div className="border border-gray-600 rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase">Select Entity</span>
              <button
                onClick={() => {
                  setShowAddEntity(false)
                  setEntityFilter('')
                }}
                className="text-gray-500 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              type="text"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              placeholder="Filter entities..."
              className="w-full bg-gray-700 text-xs h-7 px-2 rounded border border-gray-600 text-white placeholder-gray-500 mb-2"
              autoFocus
            />
            <div className="max-h-48 overflow-auto space-y-0.5">
              {entities
                .filter(([name]) => name.toLowerCase().includes(entityFilter.toLowerCase()))
                .map(([name]) => {
                  const color = getEntityColor(name)
                  return (
                    <div
                      key={name}
                      onClick={() => {
                        handleAddStep(name)
                        setEntityFilter('')
                      }}
                      className={clsx(
                        'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                        color.bg,
                        'hover:opacity-80'
                      )}
                    >
                      <span className={clsx('text-sm font-medium', color.text)}>{name}</span>
                      <span className="text-xs text-gray-500">
                        {entityCounters[name] ? `(${entityCounters[name]} existing)` : ''}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* Error handling section */}
      <div className="px-3 py-2 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">On Error:</span>
          <select
            value={currentTransaction.on_error || 'rollback'}
            onChange={(e) => {
              const newTransaction = {
                transaction: {
                  ...currentTransaction,
                  on_error: e.target.value as Transaction['on_error'],
                },
              }
              onUpdateQuery(JSON.stringify(newTransaction, null, 2))
            }}
            className="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-600 text-white flex-1"
          >
            <option value="rollback">Rollback (undo all)</option>
            <option value="stop">Stop (keep completed)</option>
            <option value="continue">Continue (ignore errors)</option>
          </select>
        </div>
      </div>
    </div>
  )
}

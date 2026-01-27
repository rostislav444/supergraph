import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { CheckIcon } from '@atoms/CheckIcon'
import { TypeBadge } from '@atoms/badges/TypeBadge'
import type { Field, Graph } from '@/types'
import { inferTargetEntity } from '@utils/fieldHelpers'

export interface DataFieldItemProps {
  name: string
  field: Field
  selected: boolean
  value: unknown
  onToggle: () => void
  onValueChange: (value: unknown) => void
  required?: boolean
  disabled?: boolean
  graph?: Graph
  entityName?: string
  onOpenLookup?: (targetEntity: string) => void
}

export function DataFieldItem({
  name,
  field,
  selected,
  value,
  onToggle,
  onValueChange,
  required = false,
  disabled = false,
  graph,
  entityName = '',
  onOpenLookup,
}: DataFieldItemProps) {
  const isEnum = field.type === 'enum' && field.enum_values && field.enum_values.length > 0
  const isFk = name.endsWith('_id')

  // Get target entity for FK lookup
  const targetEntity = useMemo(() => {
    if (!isFk || !graph?.entities) return null
    const allEntities = Object.keys(graph.entities)
    // First try to find from relations
    const relations = graph.entities[entityName]?.relations || {}
    for (const [, rel] of Object.entries(relations)) {
      if (rel.ref?.from_field === name) {
        return rel.target || rel.ref?.to_entity
      }
    }
    // Fallback to infer from field name
    return inferTargetEntity(name, entityName, allEntities)
  }, [isFk, name, graph, entityName])

  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 h-7 px-1.5 rounded relative',
        required && 'pl-3'
      )}
    >
      {/* Required indicator - vertical bar */}
      {required && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-red-500 rounded-r" />
      )}

      {/* Checkbox */}
      <div
        className={clsx(
          'flex-shrink-0',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        )}
        onClick={() => !disabled && onToggle()}
      >
        <CheckIcon checked={selected} small />
      </div>

      {/* Field name */}
      <span
        className={clsx(
          'text-[11px] font-mono w-24 truncate flex-shrink-0',
          required ? 'text-red-300' : 'text-gray-300'
        )}
      >
        {name}
      </span>

      {/* Value input - always takes space */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <>
            {isEnum ? (
              <select
                value={(value as string) || ''}
                onChange={(e) => onValueChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-pink-500 focus:outline-none"
              >
                <option value="" disabled>
                  Select...
                </option>
                {field.enum_values?.map((enumVal) => (
                  <option key={enumVal} value={enumVal}>
                    {enumVal}
                  </option>
                ))}
              </select>
            ) : field.type === 'bool' ? (
              <select
                value={value === true ? 'true' : value === false ? 'false' : ''}
                onChange={(e) => onValueChange(e.target.value === 'true')}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : field.type === 'date' ? (
              <input
                type="date"
                value={value ? (typeof value === 'string' ? value.slice(0, 10) : '') : ''}
                onChange={(e) => onValueChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-blue-500 focus:outline-none"
              />
            ) : field.type === 'datetime' ? (
              <input
                type="datetime-local"
                value={value ? (typeof value === 'string' ? value.slice(0, 16) : '') : ''}
                onChange={(e) =>
                  onValueChange(e.target.value ? new Date(e.target.value).toISOString() : '')
                }
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <div className="flex gap-1">
                <input
                  type={field.type === 'int' ? 'number' : 'text'}
                  value={(value as string | number) ?? ''}
                  onChange={(e) => {
                    const val =
                      field.type === 'int' ? parseInt(e.target.value) || 0 : e.target.value
                    onValueChange(val)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="..."
                  className="flex-1 min-w-0 bg-gray-700 text-xs h-5 px-1.5 rounded border border-gray-600 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                {isFk && targetEntity && onOpenLookup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenLookup(targetEntity)
                    }}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gray-600 hover:bg-gray-500 rounded text-gray-300 hover:text-white"
                    title={`Search ${targetEntity}`}
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
            )}
          </>
        ) : (
          <div className="h-5" />
        )}
      </div>

      {/* Type badge - always visible as separate column */}
      <div className="w-12 flex-shrink-0 text-right">
        <TypeBadge type={field.type} enumValues={field.enum_values} small />
      </div>
    </div>
  )
}

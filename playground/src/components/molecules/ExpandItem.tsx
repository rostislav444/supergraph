import clsx from 'clsx'
import { ChevronIcon } from '@atoms/icons/ChevronIcon'
import { FieldItem } from './FieldItem'
import type { Graph, Field } from '@/types'

export interface ExpandItemProps {
  /** Field name that has FK (e.g., "make_id") */
  fkFieldName: string
  /** Expand name for query (e.g., "make") */
  expandName: string
  /** Target entity name (e.g., "VehicleMake") */
  targetEntity: string
  /** Current entity path */
  path: string
  /** Graph schema */
  graph: Graph
  /** Selected expand fields: { path: { expandName: ["id", "name"] } } */
  selectedExpands: Record<string, Record<string, string[]>>
  /** Expanded paths for UI state */
  expandedPaths: Record<string, boolean>
  onToggleExpand: (expandPath: string) => void
  onToggleField: (path: string, expandName: string, field: string) => void
  onSelectAll: (path: string, expandName: string, fields: string[]) => void
  onClearFields: (path: string, expandName: string) => void
}

export function ExpandItem({
  fkFieldName,
  expandName,
  targetEntity,
  path,
  graph,
  selectedExpands,
  expandedPaths,
  onToggleExpand,
  onToggleField,
  onSelectAll,
  onClearFields,
}: ExpandItemProps) {
  const expandPath = `${path}.expand.${expandName}`
  const isExpanded = expandedPaths[expandPath]
  const targetEntityDef = graph.entities[targetEntity]
  const targetFields: Array<[string, Field]> = targetEntityDef
    ? Object.entries(targetEntityDef.fields || {})
    : []

  const pathExpands = selectedExpands[path] || {}
  const selectedFieldsList = pathExpands[expandName] || []
  const selectedCount = selectedFieldsList.length

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded cursor-pointer',
          selectedCount > 0 && 'bg-purple-900/20'
        )}
        onClick={() => onToggleExpand(expandPath)}
      >
        <ChevronIcon expanded={isExpanded} />
        <span className="text-sm text-purple-400 font-mono flex-1 truncate">{expandName}</span>
        <span className="text-xs bg-purple-900/50 text-purple-300 px-1.5 rounded">
          FK
        </span>
        {selectedCount > 0 && (
          <span className="text-xs bg-purple-500 text-white w-5 h-5 rounded-full flex items-center justify-center">
            {selectedCount}
          </span>
        )}
      </div>

      {isExpanded && targetEntityDef && (
        <div className="ml-3 py-1">
          <div className="flex items-center gap-2 mb-1 px-2 text-xs">
            <span className="text-gray-500">{targetEntity}</span>
            <span className="text-gray-600">·</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSelectAll(path, expandName, targetFields.map(([n]) => n))
              }}
              className="text-purple-400 hover:text-purple-300"
            >
              all
            </button>
            <span className="text-gray-600">·</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClearFields(path, expandName)
              }}
              className="text-gray-500 hover:text-gray-300"
            >
              clear
            </button>
          </div>
          {targetFields.map(([fieldName, field]) => (
            <FieldItem
              key={fieldName}
              name={fieldName}
              field={field}
              path={expandPath}
              selected={selectedFieldsList.includes(fieldName)}
              onToggle={(_, field) => onToggleField(path, expandName, field)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

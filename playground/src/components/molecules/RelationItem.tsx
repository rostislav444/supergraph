import clsx from 'clsx'
import { ChevronIcon } from '@atoms/icons/ChevronIcon'
import { FieldItem } from './FieldItem'
import { FilterSection } from './FilterSection'
import { PaginationSection, type PaginationData } from './PaginationSection'
import type { Relation, Graph, Field } from '@/types'

export interface RelationItemProps {
  name: string
  relation: Relation
  path: string
  graph: Graph
  selectedFields: Record<string, string[]>
  expandedPaths: Record<string, boolean>
  filters: Record<string, Record<string, string>>
  pagination: Record<string, PaginationData | undefined>
  onToggleExpand: (path: string) => void
  onToggleField: (path: string, field: string) => void
  onSelectAll: (path: string, fields: string[]) => void
  onClearFields: (path: string) => void
  onSetFilter: (data: { path: string; field: string; op: string; value: string }) => void
  onSetPagination: (data: { path: string; limit: number | null; offset: number | null }) => void
}

export function RelationItem({
  name,
  relation,
  path,
  graph,
  selectedFields,
  expandedPaths,
  filters,
  pagination,
  onToggleExpand,
  onToggleField,
  onSelectAll,
  onClearFields,
  onSetFilter,
  onSetPagination,
}: RelationItemProps) {
  const relationPath = `${path}.${name}`
  const isExpanded = expandedPaths[relationPath]
  const targetEntity = graph.entities[relation.target]
  const targetFields: Array<[string, Field]> = targetEntity
    ? Object.entries(targetEntity.fields || {})
    : []
  const selectedCount = (selectedFields[relationPath] || []).length

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded cursor-pointer',
          selectedCount > 0 && 'bg-blue-900/20'
        )}
        onClick={() => onToggleExpand(relationPath)}
      >
        <ChevronIcon expanded={isExpanded} />
        <span className="text-sm text-blue-400 font-mono flex-1 truncate">{name}</span>
        <span
          className={clsx(
            'text-xs px-1.5 rounded',
            relation.cardinality === 'one'
              ? 'bg-purple-900/50 text-purple-300'
              : 'bg-green-900/50 text-green-300'
          )}
        >
          {relation.cardinality}
        </span>
        {selectedCount > 0 && (
          <span className="text-xs bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center">
            {selectedCount}
          </span>
        )}
      </div>

      {isExpanded && targetEntity && (
        <div className="ml-3 py-1">
          <div className="flex gap-2 mb-1 px-2 text-xs">
            <button
              onClick={() => onSelectAll(relationPath, targetFields.map(([n]) => n))}
              className="text-blue-400 hover:text-blue-300"
            >
              all
            </button>
            <span className="text-gray-600">·</span>
            <button
              onClick={() => onClearFields(relationPath)}
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
              path={relationPath}
              selected={(selectedFields[relationPath] || []).includes(fieldName)}
              onToggle={onToggleField}
            />
          ))}
          <FilterSection
            path={relationPath}
            fields={targetFields}
            filters={filters[relationPath] || {}}
            onSetFilter={onSetFilter}
          />
          <PaginationSection
            path={relationPath}
            pagination={pagination[relationPath]}
            onSetPagination={onSetPagination}
          />
          {targetEntity.relations &&
            Object.entries(targetEntity.relations).map(([relName, rel]) => (
              <RelationItem
                key={relName}
                name={relName}
                relation={rel}
                path={relationPath}
                graph={graph}
                selectedFields={selectedFields}
                expandedPaths={expandedPaths}
                filters={filters}
                pagination={pagination}
                onToggleExpand={onToggleExpand}
                onToggleField={onToggleField}
                onSelectAll={onSelectAll}
                onClearFields={onClearFields}
                onSetFilter={onSetFilter}
                onSetPagination={onSetPagination}
              />
            ))}
        </div>
      )}
    </div>
  )
}

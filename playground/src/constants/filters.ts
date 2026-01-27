import type { StepOperation } from '@/types'

// Filter modes for table columns
export const FILTER_MODES = {
  string: [
    { value: 'contains', label: '~' },
    { value: 'exact', label: '=' },
    { value: 'starts', label: 'a..' },
    { value: 'ends', label: '..z' },
  ],
  number: [
    { value: 'eq', label: '=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
  ],
} as const

// Transaction step operations
export const STEP_OPERATIONS: StepOperation[] = [
  { id: 'create', label: 'Create', color: 'green' },
  { id: 'update', label: 'Update', color: 'yellow' },
  { id: 'delete', label: 'Delete', color: 'red' },
  { id: 'get_or_create', label: 'Get or Create', color: 'cyan' },
]

// Operation modes for query builder
export const OPERATION_MODES = [
  { id: 'query', label: 'Query' },
  { id: 'create', label: 'Create' },
  { id: 'update', label: 'Update' },
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'delete', label: 'Delete' },
  { id: 'transaction', label: 'Transaction' },
] as const

// Column display priority order
export const COLUMN_PRIORITY = ['id', 'name', 'title', 'status', 'type'] as const

// Mode titles for display
export const MODE_TITLES: Record<string, string> = {
  create: 'Create Mode',
  update: 'Update Mode',
  rewrite: 'Rewrite Mode',
  delete: 'Delete Mode',
  transaction: 'Transaction Mode',
}

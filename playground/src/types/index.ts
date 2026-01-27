// Field types
export interface Field {
  type: 'string' | 'int' | 'bool' | 'datetime' | 'date' | 'json' | 'enum'
  nullable?: boolean
  required?: boolean
  enum_values?: string[]
  filters?: string[]
}

export interface Relation {
  target: string
  cardinality: 'one' | 'many'
  ref?: {
    from_field: string
    to_entity?: string
  }
}

export interface Entity {
  service: string
  fields: Record<string, Field>
  relations?: Record<string, Relation>
}

export interface Graph {
  entities: Record<string, Entity>
  services?: Record<string, unknown>
}

// Operation modes
export type OperationMode = 'query' | 'create' | 'update' | 'rewrite' | 'delete' | 'transaction'

// Filter types
export interface FilterConfig {
  value: string
  mode: string
  label: string
}

export interface TableFilter {
  value: string | number
  mode: string
}

// Color configurations
export interface ColorConfig {
  bg: string
  border: string
  header: string
  text: string
}

// Step operation
export interface StepOperation {
  id: string
  label: string
  color: string
}

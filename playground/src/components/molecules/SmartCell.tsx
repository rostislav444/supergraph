import { BooleanBadge, NullBadge, EnumBadge, NumberCell } from '@atoms/index'
import { TextCell } from './TextCell'
import { NestedObjectCell } from './NestedObjectCell'
import { isEnumLike, isTextField } from '@utils/columnHelpers'

export interface SmartCellProps {
  value: unknown
  fieldName?: string
}

// Smart cell that detects value type and renders appropriately
export function SmartCell({ value, fieldName = '' }: SmartCellProps) {
  // Null
  if (value === null || value === undefined) {
    return <NullBadge />
  }

  // Boolean
  if (typeof value === 'boolean') {
    return <BooleanBadge value={value} />
  }

  // Number
  if (typeof value === 'number') {
    return <NumberCell value={value} />
  }

  // Object or Array (nested)
  if (typeof value === 'object') {
    return <NestedObjectCell value={value as Record<string, unknown>} fieldName={fieldName} />
  }

  // String
  if (typeof value === 'string') {
    // Date/datetime detection
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const isDateTime = value.includes('T')
      return (
        <span className="font-mono text-xs text-purple-400">
          {isDateTime ? value.replace('T', ' ').slice(0, 19) : value.slice(0, 10)}
        </span>
      )
    }

    // Enum detection
    if (isEnumLike(value, fieldName)) {
      return <EnumBadge value={value} />
    }

    // Text field (description, notes, etc) - always treat as potentially long
    if (isTextField(fieldName)) {
      return <TextCell value={value} />
    }

    // Long text (>50 chars)
    if (value.length > 50) {
      return <TextCell value={value} />
    }

    // Regular string
    return <span className="text-gray-300">{value}</span>
  }

  return <span className="text-gray-300">{String(value)}</span>
}

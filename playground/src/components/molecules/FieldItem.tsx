import clsx from 'clsx'
import { CheckIcon, TypeBadge, RequiredBadge } from '@atoms/index'
import type { Field } from '@/types'

export interface FieldItemProps {
  name: string
  field: Field
  path: string
  selected: boolean
  onToggle: (path: string, field: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
}

export function FieldItem({
  name,
  field,
  path,
  selected,
  onToggle,
  required = false,
  disabled = false,
  className,
}: FieldItemProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 py-1 px-2 rounded relative',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-800/50',
        required && 'pl-4',
        className
      )}
      onClick={() => !disabled && onToggle(path, name)}
    >
      {required && (
        <div className="absolute left-0 top-1 bottom-1 w-1 bg-red-500 rounded-r" />
      )}
      <CheckIcon checked={selected} />
      <span
        className={clsx(
          'text-sm font-mono flex-1 truncate',
          required ? 'text-red-300' : 'text-gray-200'
        )}
      >
        {name}
      </span>
      <TypeBadge type={field.type} enumValues={field.enum_values} />
      {required && <RequiredBadge />}
    </div>
  )
}

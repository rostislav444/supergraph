import clsx from 'clsx'
import { FILTER_MODES } from '@constants/filters'

export interface FilterInputProps {
  value: string
  mode: string
  columnType: 'string' | 'number' | 'boolean' | 'enum'
  enumValues?: string[]
  onChange: (value: string) => void
  onModeChange: (mode: string) => void
  disabled?: boolean
  className?: string
}

export function FilterInput({
  value,
  mode,
  columnType,
  enumValues,
  onChange,
  onModeChange,
  disabled = false,
  className,
}: FilterInputProps) {
  const inputClassName = clsx(
    'w-full bg-gray-900 text-xs text-gray-300 px-2 py-1 rounded border',
    disabled ? 'border-gray-600 opacity-50' : 'border-gray-700 focus:border-blue-500',
    className
  )

  // Boolean - select true/false
  if (columnType === 'boolean') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClassName}
      >
        <option value="">All</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }

  // Enum - select from values
  if (columnType === 'enum' && enumValues) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClassName}
      >
        <option value="">All</option>
        {enumValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    )
  }

  // Number
  if (columnType === 'number') {
    return (
      <div className="flex flex-col gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Filter..."
          className={inputClassName}
        />
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value)}
          className="w-full bg-gray-900 text-[10px] text-gray-400 px-1 py-0.5 rounded border border-gray-700"
        >
          {FILTER_MODES.number.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} {m.value}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // String (default)
  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Filter..."
        className={inputClassName}
      />
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value)}
        className="w-full bg-gray-900 text-[10px] text-gray-400 px-1 py-0.5 rounded border border-gray-700"
      >
        {FILTER_MODES.string.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label} {m.value}
          </option>
        ))}
      </select>
    </div>
  )
}

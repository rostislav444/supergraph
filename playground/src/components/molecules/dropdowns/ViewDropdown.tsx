import clsx from 'clsx'
import { useDropdown } from './useDropdown'
import type { ReactNode } from 'react'

export interface ViewOption {
  id: string
  label: string
  icon: ReactNode
}

export interface ViewDropdownProps {
  value: string
  onChange: (id: string) => void
  options?: ViewOption[]
}

const DEFAULT_OPTIONS: ViewOption[] = [
  {
    id: 'explorer',
    label: 'Explorer',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'schema',
    label: 'Schema',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
]

export function ViewDropdown({ value, onChange, options = DEFAULT_OPTIONS }: ViewDropdownProps) {
  const { isOpen, setIsOpen, toggle, dropdownRef } = useDropdown()
  const current = options.find((o) => o.id === value) || options[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-3 py-1.5 text-gray-400 hover:text-white transition-colors"
      >
        {current.icon}
        <span className="text-sm">{current.label}</span>
        <svg
          className={clsx('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px]">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                onChange(option.id)
                setIsOpen(false)
              }}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                value === option.id ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700/50'
              )}
            >
              {option.icon}
              <span className="text-sm">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import clsx from 'clsx'
import { useDropdown } from './useDropdown'
import { MODE_DOT_COLORS, MODE_HOVER_COLORS } from '@constants/colors'
import type { OperationMode } from '@/types'

export interface OperationModeOption {
  id: OperationMode
  label: string
}

export interface OperationModeDropdownProps {
  value: OperationMode
  onChange: (mode: OperationMode) => void
  modes: OperationModeOption[]
}

export function OperationModeDropdown({ value, onChange, modes }: OperationModeDropdownProps) {
  const { isOpen, setIsOpen, toggle, dropdownRef } = useDropdown()
  const currentMode = modes.find((m) => m.id === value) || modes[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium transition-all text-gray-400 hover:text-white"
      >
        <span className={clsx('w-2 h-2 rounded-full', MODE_DOT_COLORS[value])} />
        <span>{currentMode.label}</span>
        <svg
          className={clsx('w-3.5 h-3.5 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px] overflow-hidden">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                onChange(mode.id)
                setIsOpen(false)
              }}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                value === mode.id ? 'bg-gray-700 text-white' : `text-gray-300 ${MODE_HOVER_COLORS[mode.id]}`
              )}
            >
              <span className={clsx('w-2 h-2 rounded-full', MODE_DOT_COLORS[mode.id])} />
              <span className="text-sm">{mode.label}</span>
              {value === mode.id && (
                <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

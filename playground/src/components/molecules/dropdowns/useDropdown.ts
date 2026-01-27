import { useState, useEffect, useRef } from 'react'

export interface UseDropdownReturn {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toggle: () => void
  close: () => void
  dropdownRef: React.RefObject<HTMLDivElement>
}

export function useDropdown(): UseDropdownReturn {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return {
    isOpen,
    setIsOpen,
    toggle: () => setIsOpen(!isOpen),
    close: () => setIsOpen(false),
    dropdownRef,
  }
}

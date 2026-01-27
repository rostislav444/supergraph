import type { ColorConfig } from '@/types'

// Entity colors for visual distinction (used in FormEditor, TransactionBuilder)
export const ENTITY_COLORS: ColorConfig[] = [
  { bg: 'bg-blue-900/30', border: 'border-blue-500', header: 'bg-blue-600/40', text: 'text-blue-400' },
  { bg: 'bg-purple-900/30', border: 'border-purple-500', header: 'bg-purple-600/40', text: 'text-purple-400' },
  { bg: 'bg-emerald-900/30', border: 'border-emerald-500', header: 'bg-emerald-600/40', text: 'text-emerald-400' },
  { bg: 'bg-orange-900/30', border: 'border-orange-500', header: 'bg-orange-600/40', text: 'text-orange-400' },
  { bg: 'bg-cyan-900/30', border: 'border-cyan-500', header: 'bg-cyan-600/40', text: 'text-cyan-400' },
  { bg: 'bg-pink-900/30', border: 'border-pink-500', header: 'bg-pink-600/40', text: 'text-pink-400' },
  { bg: 'bg-yellow-900/30', border: 'border-yellow-500', header: 'bg-yellow-600/40', text: 'text-yellow-400' },
  { bg: 'bg-red-900/30', border: 'border-red-500', header: 'bg-red-600/40', text: 'text-red-400' },
]

// Operation mode colors (used in App.jsx dropdowns)
export const MODE_COLORS: Record<string, string> = {
  query: 'bg-blue-600/30 text-blue-400 border-blue-500',
  create: 'bg-green-600/30 text-green-400 border-green-500',
  update: 'bg-yellow-600/30 text-yellow-400 border-yellow-500',
  rewrite: 'bg-orange-600/30 text-orange-400 border-orange-500',
  delete: 'bg-red-600/30 text-red-400 border-red-500',
  transaction: 'bg-purple-600/30 text-purple-400 border-purple-500',
}

// Mode indicator dot colors
export const MODE_DOT_COLORS: Record<string, string> = {
  query: 'bg-blue-500',
  create: 'bg-green-500',
  update: 'bg-yellow-500',
  rewrite: 'bg-orange-500',
  delete: 'bg-red-500',
  transaction: 'bg-purple-500',
}

// Mode hover colors
export const MODE_HOVER_COLORS: Record<string, string> = {
  query: 'hover:bg-blue-600/20',
  create: 'hover:bg-green-600/20',
  update: 'hover:bg-yellow-600/20',
  rewrite: 'hover:bg-orange-600/20',
  delete: 'hover:bg-red-600/20',
  transaction: 'hover:bg-purple-600/20',
}

// Execute button colors
export const MODE_BUTTON_COLORS: Record<string, string> = {
  query: 'bg-blue-600 hover:bg-blue-500',
  create: 'bg-green-600 hover:bg-green-500',
  update: 'bg-yellow-600 hover:bg-yellow-500',
  rewrite: 'bg-orange-600 hover:bg-orange-500',
  delete: 'bg-red-600 hover:bg-red-500',
  transaction: 'bg-purple-600 hover:bg-purple-500',
}

// Type badge colors (used in TypeBadge component)
export const TYPE_COLORS: Record<string, string> = {
  int: 'text-orange-400',
  string: 'text-green-400',
  bool: 'text-purple-400',
  datetime: 'text-cyan-400',
  date: 'text-cyan-300',
  json: 'text-yellow-400',
  enum: 'text-pink-400',
}

// Operation badge colors (used in TransactionBuilder)
export const OP_BADGE_COLORS: Record<string, string> = {
  create: 'bg-green-600 text-white',
  update: 'bg-yellow-600 text-white',
  delete: 'bg-red-600 text-white',
  get_or_create: 'bg-cyan-600 text-white',
}

// EnumBadge color palette (17 colors for visual variety)
export const ENUM_BADGE_COLORS = [
  'bg-blue-600/40 text-blue-300',
  'bg-green-600/40 text-green-300',
  'bg-yellow-600/40 text-yellow-300',
  'bg-red-600/40 text-red-300',
  'bg-purple-600/40 text-purple-300',
  'bg-pink-600/40 text-pink-300',
  'bg-indigo-600/40 text-indigo-300',
  'bg-cyan-600/40 text-cyan-300',
  'bg-orange-600/40 text-orange-300',
  'bg-teal-600/40 text-teal-300',
  'bg-lime-600/40 text-lime-300',
  'bg-amber-600/40 text-amber-300',
  'bg-emerald-600/40 text-emerald-300',
  'bg-sky-600/40 text-sky-300',
  'bg-violet-600/40 text-violet-300',
  'bg-fuchsia-600/40 text-fuchsia-300',
  'bg-rose-600/40 text-rose-300',
]

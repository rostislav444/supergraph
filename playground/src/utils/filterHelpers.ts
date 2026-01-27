// Convert UI filter mode to backend filter suffix
export function getBackendFilterSuffix(mode: string, colType: string): string {
  if (colType === 'number') {
    const map: Record<string, string> = {
      eq: '__eq',
      gt: '__gt',
      gte: '__gte',
      lt: '__lt',
      lte: '__lte',
    }
    return map[mode] || '__eq'
  }

  if (colType === 'boolean' || colType === 'enum') {
    return '__eq'
  }

  // String
  const map: Record<string, string> = {
    contains: '__icontains',
    exact: '__eq',
    starts: '__istartswith',
    ends: '__iendswith',
  }
  return map[mode] || '__icontains'
}

// Build backend filters object from UI filters
export function buildBackendFilters(
  filters: Record<string, { value: unknown; mode: string }>,
  columnTypes: Record<string, string>
): Record<string, unknown> {
  const backendFilters: Record<string, unknown> = {}

  for (const [field, filter] of Object.entries(filters)) {
    if (!filter?.value && filter?.value !== 0) continue

    const colType = columnTypes[field] || 'string'
    const suffix = getBackendFilterSuffix(filter.mode || 'contains', colType)

    // Convert value to proper type
    let value = filter.value
    if (colType === 'number') {
      value = Number(value)
      if (isNaN(value as number)) continue
    } else if (colType === 'boolean') {
      value = value === 'true'
    }

    backendFilters[`${field}${suffix}`] = value
  }

  return backendFilters
}

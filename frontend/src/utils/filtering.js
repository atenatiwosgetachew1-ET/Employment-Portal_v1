export function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase()
}

export function matchesSearchQuery(values, query) {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return true

  return values.some((value) => normalizeSearchValue(value).includes(normalizedQuery))
}

export function matchesExactFilter(value, selected) {
  if (!selected) return true
  return String(value || '') === String(selected)
}

export function matchesBooleanFilter(value, selected) {
  if (!selected) return true
  return String(Boolean(value)) === String(selected)
}

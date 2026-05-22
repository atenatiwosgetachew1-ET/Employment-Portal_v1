const DENSITY_STORAGE_KEY = 'employment-portal.density'

export const DENSITY_VALUES = ['compact', 'comfortable']
export const DEFAULT_DENSITY = 'compact'

function normalizeDensity(value) {
  return DENSITY_VALUES.includes(value) ? value : DEFAULT_DENSITY
}

export function applyDensity(value) {
  const density = normalizeDensity(value)
  const root = document.documentElement
  root.setAttribute('data-density', density)
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density)
  } catch {
    /* ignore */
  }
}

export function getStoredDensity() {
  try {
    return normalizeDensity(window.localStorage.getItem(DENSITY_STORAGE_KEY))
  } catch {
    return DEFAULT_DENSITY
  }
}

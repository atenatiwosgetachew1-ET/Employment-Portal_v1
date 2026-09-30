const THEME_STORAGE_KEY = 'employment-portal.theme'
const ACCENT_STORAGE_KEY = 'employment-portal.accent'

export const DEFAULT_THEME = 'dark'
export const DEFAULT_ACCENT = 'natural'
export const ACCENT_VALUES = ['natural', 'orange']

let systemThemeMedia = null
let detachSystemThemeListener = null

function normalizeTheme(theme) {
  return theme === 'light' ? 'light' : DEFAULT_THEME
}

function normalizeAccent(accent) {
  return ACCENT_VALUES.includes(accent) ? accent : DEFAULT_ACCENT
}

function resolveSystemTheme() {
  return DEFAULT_THEME
}

function setResolvedThemeAttributes(theme) {
  const root = document.documentElement
  const normalizedTheme = normalizeTheme(theme)
  const resolvedTheme = normalizedTheme === 'system' ? resolveSystemTheme() : normalizedTheme
  root.setAttribute('data-theme-mode', normalizedTheme)
  root.setAttribute('data-theme', resolvedTheme)
  root.style.colorScheme = resolvedTheme
}

function bindSystemThemeListener() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  if (!systemThemeMedia) {
    systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
  }
  if (detachSystemThemeListener) return

  const handleThemeChange = () => {
    if (getStoredTheme() === 'system') {
      setResolvedThemeAttributes('system')
    }
  }

  if (typeof systemThemeMedia.addEventListener === 'function') {
    systemThemeMedia.addEventListener('change', handleThemeChange)
    detachSystemThemeListener = () => systemThemeMedia.removeEventListener('change', handleThemeChange)
  } else if (typeof systemThemeMedia.addListener === 'function') {
    systemThemeMedia.addListener(handleThemeChange)
    detachSystemThemeListener = () => systemThemeMedia.removeListener(handleThemeChange)
  }
}

export function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme)
  setResolvedThemeAttributes(normalizedTheme)

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)
  } catch {
    /* ignore */
  }
}

export function getStoredTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

export function applyAccent(accent) {
  const root = document.documentElement
  root.setAttribute('data-accent', normalizeAccent(accent))
}

export function storeAccent(accent) {
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, normalizeAccent(accent))
  } catch {
    /* ignore */
  }
}

export function getStoredAccent() {
  try {
    return normalizeAccent(window.localStorage.getItem(ACCENT_STORAGE_KEY))
  } catch {
    return DEFAULT_ACCENT
  }
}

export function readAccentRgbTriplet() {
  if (typeof window === 'undefined') return [159, 106, 59]
  const root = document.documentElement
  const raw = getComputedStyle(root).getPropertyValue('--accent-active').trim()
  if (!raw) return [159, 106, 59]
  const values = raw
    .split(/\s+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part))
    .slice(0, 3)
  return values.length === 3 ? values : [159, 106, 59]
}

export function accentRgb(alpha = 1) {
  const [r, g, b] = readAccentRgbTriplet()
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

export function createAccentPalette(count) {
  const total = Math.max(count, 1)
  return Array.from({ length: total }, (_, index) => {
    const ratio = total === 1 ? 0.6 : index / Math.max(total - 1, 1)
    const alpha = 0.96 - ratio * 0.42
    return accentRgb(Math.max(0.34, alpha))
  })
}

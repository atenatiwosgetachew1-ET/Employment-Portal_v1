const THEME_STORAGE_KEY = 'employment-portal.theme'
const ACCENT_STORAGE_KEY = 'employment-portal.accent'

export const DEFAULT_THEME = 'dark'
export const DEFAULT_ACCENT = 'natural'
export const ACCENT_VALUES = ['natural', 'orange']

let systemThemeMedia = null
let detachSystemThemeListener = null

function normalizeTheme(theme) {
  return 'dark'
}

function normalizeAccent(accent) {
  return ACCENT_VALUES.includes(accent) ? accent : DEFAULT_ACCENT
}

function resolveSystemTheme() {
  return 'dark'
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
  const normalizedTheme = 'dark'
  setResolvedThemeAttributes(normalizedTheme)

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)
  } catch {
    /* ignore */
  }
}

export function getStoredTheme() {
  return 'dark'
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

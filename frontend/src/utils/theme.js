const THEME_STORAGE_KEY = 'employment-portal.theme'
const ACCENT_STORAGE_KEY = 'employment-portal.accent'
const DEFAULT_ACCENT = 'orange'

function normalizeAccent(_accent) {
  return DEFAULT_ACCENT
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function getStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) || 'system'
  } catch {
    return 'system'
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

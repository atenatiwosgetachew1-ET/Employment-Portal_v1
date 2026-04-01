const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** Django default; must match settings.CSRF_COOKIE_NAME */
const CSRF_COOKIE_NAME = 'csrftoken'

let csrfToken = null

function readCookie(name) {
  const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')
  const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function syncCsrfFromCookie() {
  const fromCookie = readCookie(CSRF_COOKIE_NAME)
  if (fromCookie) {
    csrfToken = fromCookie
  }
  return csrfToken
}

export async function ensureCsrfToken() {
  const r = await fetch(`${API_BASE_URL}/api/csrf/`, {
    credentials: 'include'
  })
  if (!r.ok) {
    throw new Error('Could not load security token.')
  }
  const data = await r.json()
  // Header must match the csrftoken cookie Django sets (not only the JSON body).
  syncCsrfFromCookie()
  if (!csrfToken && data.csrfToken) {
    csrfToken = data.csrfToken
  }
  if (!csrfToken) {
    throw new Error('Could not load security token.')
  }
  return csrfToken
}

/**
 * Fetch against Django API with JSON + session cookie + CSRF for unsafe methods.
 */
export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = { ...options.headers }
  const hasExplicitContentType =
    Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
  const isFormDataBody =
    typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!hasExplicitContentType && !isFormDataBody) {
    headers['Content-Type'] = 'application/json'
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (!csrfToken) {
      await ensureCsrfToken()
    }
    syncCsrfFromCookie()
    if (!csrfToken) {
      await ensureCsrfToken()
    }
    headers['X-CSRFToken'] = csrfToken
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers
  })

  // Wrong password on /api/login/ returns 401 — do not treat as session expiry.
  if (response.status === 401 && !path.includes('/api/login/')) {
    csrfToken = null
    window.dispatchEvent(new Event('auth:unauthorized'))
  }

  return response
}

export { API_BASE_URL }

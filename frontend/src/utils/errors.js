/**
 * Extracts a human-readable error message from an API response body,
 * error object, or unknown error payload.
 *
 * Handles Django REST Framework validation dictionaries, standard { detail },
 * { message }, raw strings, arrays of errors, and network errors.
 *
 * @param {unknown} data - The parsed error payload or Error instance
 * @param {string} [fallback='An unexpected error occurred'] - Fallback message
 * @returns {string} Human-readable error message
 */
export function extractApiErrorMessage(data, fallback = 'An unexpected error occurred') {
  if (!data) return fallback

  if (data instanceof Error) {
    return data.message || fallback
  }

  if (typeof data === 'string') {
    const text = data.trim()
    if (!text) return fallback
    return text.length > 300 ? `${text.slice(0, 300)}…` : text
  }

  if (typeof data !== 'object') {
    return String(data)
  }

  if (typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail.trim()
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }

  // Handle Django REST Framework field validation errors: { field: ["error1", "error2"] }
  const entries = Object.entries(data)
  if (entries.length === 1) {
    const [key, value] = entries[0]
    if (typeof value === 'string' && value.trim()) {
      return key === 'non_field_errors' ? value.trim() : `${key}: ${value.trim()}`
    }
    if (Array.isArray(value) && value.length > 0) {
      const joined = value.filter(Boolean).map(String).join(', ')
      return key === 'non_field_errors' ? joined : `${key}: ${joined}`
    }
  }

  if (entries.length > 1) {
    return entries
      .map(([key, value]) => {
        const valStr = Array.isArray(value)
          ? value.filter(Boolean).map(String).join(', ')
          : String(value ?? '')
        return key === 'non_field_errors' ? valStr : `${key}: ${valStr}`
      })
      .filter((part) => part.trim().length > 0)
      .join(' | ') || fallback
  }

  return fallback
}

/**
 * Safely reads response body from a Fetch Response object as JSON or text.
 *
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function readResponseBody(response) {
  try {
    return await response.clone().json()
  } catch {
    try {
      const text = await response.text()
      return text || {}
    } catch {
      return {}
    }
  }
}
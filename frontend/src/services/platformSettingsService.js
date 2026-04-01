import { apiFetch } from '../api/client'

function responseError(data, fallback) {
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.message === 'string') return data.message
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join(' ')
  }
  return fallback
}

export async function fetchPlatformSettings() {
  const response = await apiFetch('/api/platform-settings/')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to load platform settings'))
  }
  return data
}

export async function patchPlatformSettings(payload) {
  const response = await apiFetch('/api/platform-settings/', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to save platform settings'))
  }
  return data
}

export function defaultFeatureFlags() {
  return {
    registration_enabled: true,
    email_password_login_enabled: true,
    google_login_enabled: true,
    employees_enabled: true,
    users_management_enabled: true,
    audit_log_enabled: true
  }
}

export function defaultRolePermissions() {
  return {
    superadmin: ['users.manage_all', 'audit.view', 'platform.manage'],
    admin: ['users.manage_limited', 'audit.view'],
    staff: [],
    customer: []
  }
}

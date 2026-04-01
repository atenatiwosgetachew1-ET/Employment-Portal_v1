import { apiFetch } from '../api/client'

export async function fetchUsers({ page = 1, q = '', role = '', isActive = '' } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  if (q.trim()) params.set('q', q.trim())
  if (role) params.set('role', role)
  if (isActive) params.set('is_active', isActive)

  const response = await apiFetch(`/api/users/?${params.toString()}`)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || err.message || 'Failed to load users')
  }
  return response.json()
}

export async function createUser(payload) {
  const response = await apiFetch('/api/users/', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg =
      typeof data === 'object' && data !== null
        ? Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' ')
        : 'Failed to create user'
    throw new Error(msg || 'Failed to create user')
  }
  return data
}

export async function fetchStaffSideOptions() {
  const response = await apiFetch('/api/users/staff-side-options/')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.detail || data.message || 'Failed to load staff side options')
  }
  return Array.isArray(data.options) ? data.options : []
}

export async function patchUser(id, payload) {
  const response = await apiFetch(`/api/users/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg =
      typeof data === 'object' && data !== null
        ? Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' ')
        : 'Failed to update user'
    throw new Error(msg || 'Failed to update user')
  }
  return data
}

export async function deleteUser(id) {
  const response = await apiFetch(`/api/users/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to delete user')
  }
}

export async function resetUserPassword(id, newPassword, newPasswordConfirm) {
  const response = await apiFetch(`/api/users/${id}/reset-password/`, {
    method: 'POST',
    body: JSON.stringify({
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg =
      typeof data === 'object' && data !== null
        ? data.detail ||
          Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' ')
        : 'Failed to reset password'
    throw new Error(msg || 'Failed to reset password')
  }
  return data
}

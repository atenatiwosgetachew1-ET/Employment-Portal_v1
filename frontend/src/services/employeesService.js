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

export async function fetchEmployees({ page = 1, q = '', isActive = '' } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  if (q.trim()) params.set('q', q.trim())
  if (isActive) params.set('is_active', isActive)

  const response = await apiFetch(`/api/employees/?${params.toString()}`)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to load employees'))
  }
  return data
}

export async function fetchEmployeeFormOptions() {
  const response = await apiFetch('/api/employees/form-options/')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to load employee form options'))
  }
  return {
    destination_countries: Array.isArray(data.destination_countries)
      ? data.destination_countries
      : [],
    salary_options_by_country:
      data.salary_options_by_country && typeof data.salary_options_by_country === 'object'
        ? data.salary_options_by_country
        : {}
  }
}

export async function createEmployee(payload) {
  const response = await apiFetch('/api/employees/', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to create employee'))
  }
  return data
}

export async function fetchEmployee(id) {
  const response = await apiFetch(`/api/employees/${id}/`)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to load employee'))
  }
  return data
}

export async function updateEmployee(id, payload) {
  const response = await apiFetch(`/api/employees/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to update employee'))
  }
  return data
}

export async function deleteEmployee(id) {
  const response = await apiFetch(`/api/employees/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}))
    throw new Error(responseError(data, 'Failed to delete employee'))
  }
}

export async function uploadEmployeeDocument(employeeId, documentType, label, file, expiresOn = '') {
  const formData = new FormData()
  formData.append('document_type', documentType)
  if (label) formData.append('label', label)
  if (expiresOn) formData.append('expires_on', expiresOn)
  formData.append('file', file)

  const response = await apiFetch(`/api/employees/${employeeId}/documents/`, {
    method: 'POST',
    body: formData
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to upload document'))
  }
  return data
}

export async function deleteEmployeeDocument(id) {
  const response = await apiFetch(`/api/employee-documents/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}))
    throw new Error(responseError(data, 'Failed to delete document'))
  }
}

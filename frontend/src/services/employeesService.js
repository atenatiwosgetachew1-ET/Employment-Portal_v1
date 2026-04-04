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

export async function fetchEmployees({
  page = 1,
  q = '',
  isActive = '',
  mine = false,
  selectedScope = '',
  processScope = '',
  employedScope = '',
  returnedScope = ''
} = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  if (q.trim()) params.set('q', q.trim())
  if (isActive) params.set('is_active', isActive)
  if (mine) params.set('mine', 'true')
  if (selectedScope) params.set('selected_scope', selectedScope)
  if (processScope) params.set('process_scope', processScope)
  if (employedScope) params.set('employed_scope', employedScope)
  if (returnedScope) params.set('returned_scope', returnedScope)

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
        : {},
    agent_options: Array.isArray(data.agent_options) ? data.agent_options : []
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

export async function selectEmployee(id) {
  const response = await apiFetch(`/api/employees/${id}/selection/`, { method: 'POST' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to select employee'))
  }
  return data
}

export async function unselectEmployee(id) {
  const response = await apiFetch(`/api/employees/${id}/selection/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}))
    throw new Error(responseError(data, 'Failed to remove employee selection'))
  }
}

export async function startEmployeeProcess(id, { agentId } = {}) {
  const body = {}
  if (agentId) body.agent_id = agentId
  const response = await apiFetch(`/api/employees/${id}/process/`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to start employee process'))
  }
  return data
}

export async function declineEmployeeProcess(id) {
  const response = await apiFetch(`/api/employees/${id}/process/`, { method: 'DELETE' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to decline employee process'))
  }
  return data
}

export async function createEmployeeReturnRequest(id, { remark, evidenceFiles = [] } = {}) {
  const formData = new FormData()
  formData.append('remark', remark || '')
  evidenceFiles.slice(0, 3).forEach((file, index) => {
    if (file) formData.append(`evidence_file_${index + 1}`, file)
  })

  const response = await apiFetch(`/api/employees/${id}/return-request/`, {
    method: 'POST',
    body: formData
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to create return request'))
  }
  return data
}

export async function cancelEmployeeReturnRequest(id) {
  const response = await apiFetch(`/api/employees/${id}/return-request/`, { method: 'DELETE' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to cancel return request'))
  }
  return data
}

export async function approveEmployeeReturnRequest(id) {
  const response = await apiFetch(`/api/employees/${id}/return-request/approve/`, { method: 'POST' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to approve employee return'))
  }
  return data
}

export async function refuseEmployeeReturnRequest(id) {
  const response = await apiFetch(`/api/employees/${id}/return-request/refuse/`, { method: 'POST' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to refuse return request'))
  }
  return data
}

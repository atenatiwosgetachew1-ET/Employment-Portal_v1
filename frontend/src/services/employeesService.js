import { apiFetch } from '../api/client'

import { extractApiErrorMessage as responseError, readResponseBody } from '../utils/errors'

export async function fetchEmployees({
  page = 1,
  q = '',
  isActive = '',
  mine = false,
  selectedScope = '',
  processScope = '',
  employedScope = '',
  returnedScope = '',
  pageSize = '',
  page_size = '',
  returnRequestStatus = '',
  return_request_status = '',
  reversalRequestStatus = '',
  reversal_request_status = ''
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
  const size = pageSize || page_size
  if (size) params.set('page_size', String(size))
  const reqStatus = returnRequestStatus || return_request_status
  if (reqStatus) params.set('return_request_status', reqStatus)
  const revStatus = reversalRequestStatus || reversal_request_status
  if (revStatus) params.set('reversal_request_status', revStatus)

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

export async function extractEmployeeDocumentFields(file, stepIndex, formOptions = {}) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('step_index', String(stepIndex))
  formData.append('form_options', JSON.stringify(formOptions || {}))

  const response = await apiFetch('/api/employees/ocr/', {
    method: 'POST',
    body: formData
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to extract document fields'))
  }
  return {
    text: typeof data.text === 'string' ? data.text : '',
    rawText: typeof data.raw_text === 'string' ? data.raw_text : '',
    documentType: typeof data.document_type === 'string' ? data.document_type : '',
    fields: data.fields && typeof data.fields === 'object' ? data.fields : {},
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    updatesByStep: data.updates_by_step && typeof data.updates_by_step === 'object' ? data.updates_by_step : {},
    updates: data.updates && typeof data.updates === 'object' ? data.updates : {}
  }
}

export async function fetchEmployeeOcrStatus() {
  const response = await apiFetch('/api/employees/ocr/status/')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to check OCR setup'))
  }
  return {
    ready: Boolean(data.ready),
    message: typeof data.message === 'string' ? data.message : '',
    command: typeof data.command === 'string' ? data.command : '',
    engine: typeof data.engine === 'string' ? data.engine : ''
  }
}

export async function createEmployee(payload) {
  const response = await apiFetch('/api/employees/', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await readResponseBody(response)
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to create employee'))
  }
  return data
}

export const getEmployee = (id) => fetchEmployee(id)

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
  const data = await readResponseBody(response)
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
  const data = await readResponseBody(response)
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to upload document'))
  }
  return data
}

export async function deleteEmployeeDocument(id) {
  const response = await apiFetch(`/api/employee-documents/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const data = await readResponseBody(response)
    throw new Error(responseError(data, 'Failed to delete document'))
  }
}

export async function selectEmployee(id, { agentId } = {}) {
  const body = {}
  if (agentId) body.agent_id = agentId
  const response = await apiFetch(`/api/employees/${id}/selection/`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
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

export async function declineEmployeeProcess(id, { reason = '' } = {}) {
  const response = await apiFetch(`/api/employees/${id}/process/decline/`, {
    method: 'POST',
    body: JSON.stringify({ decline_reason: reason })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to decline employee process'))
  }
  return data
}

export async function confirmEmployeeTravel(id, payload = {}) {
  const response = await apiFetch(`/api/employees/${id}/travel-confirm/`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to confirm travel'))
  }
  return data
}

export async function confirmEmployeeArrival(id, payload = {}) {
  const response = await apiFetch(`/api/employees/${id}/arrival-confirm/`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to process arrival confirmation'))
  }
  return data
}

export async function confirmEmployeeReturn(id, payload = {}) {
  const response = await apiFetch(`/api/employees/${id}/return-confirm/`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to confirm return'))
  }
  return data
}

export async function saveEmployeeTravelBooking(id, payload) {
  const response = await apiFetch(`/api/employees/${id}/travel-booking/`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to save travel booking'))
  }
  return data
}

export async function updateEmployeeTravelBooking(id, payload) {
  const response = await apiFetch(`/api/employees/${id}/travel-booking/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to update travel booking'))
  }
  return data
}

export async function deleteEmployeeTravelBooking(id) {
  const response = await apiFetch(`/api/employees/${id}/travel-booking/`, {
    method: 'DELETE'
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to delete travel booking'))
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

export const approveReturn = approveEmployeeReturnRequest
export const refuseReturn = refuseEmployeeReturnRequest


export async function createEmployeeReversalRequest(id, { remark = '' } = {}) {
  const response = await apiFetch(`/api/employees/${id}/reversal-request/`, {
    method: 'POST',
    body: JSON.stringify({ remark: remark || '' })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to create reversal request'))
  }
  return data
}

export async function cancelEmployeeReversalRequest(id) {
  const response = await apiFetch(`/api/employees/${id}/reversal-request/`, { method: 'DELETE' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to cancel reversal request'))
  }
  return data
}

export async function approveEmployeeReversalRequest(id) {
  const response = await apiFetch(`/api/employees/${id}/reversal-request/approve/`, { method: 'POST' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to approve reversal request'))
  }
  return data
}

export async function refuseEmployeeReversalRequest(id) {
  const response = await apiFetch(`/api/employees/${id}/reversal-request/refuse/`, { method: 'POST' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to refuse reversal request'))
  }
  return data
}

export async function fetchCommissionRequests(params = {}) {
  const query = new URLSearchParams()
  if (params.agentId || params.agent_id) query.set('agent_id', params.agentId || params.agent_id)
  if (params.status) query.set('status', params.status)
  if (params.employeeId || params.employee_id) query.set('employee_id', params.employeeId || params.employee_id)
  const response = await apiFetch(`/api/commissions/requests/?${query.toString()}`)
  const data = await response.json().catch(() => ([]))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to fetch commission requests'))
  }
  return data
}

export async function createCommissionRequest(payload) {
  const response = await apiFetch('/api/commissions/requests/', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to create commission request'))
  }
  return data
}

export async function updateCommissionRequest(id, payload) {
  const response = await apiFetch(`/api/commissions/requests/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to update commission request'))
  }
  return data
}

export async function fetchCommissionSettlements(params = {}) {
  const query = new URLSearchParams()
  if (params.agentId || params.agent_id) query.set('agent_id', params.agentId || params.agent_id)
  const response = await apiFetch(`/api/commissions/settlements/?${query.toString()}`)
  const data = await response.json().catch(() => ([]))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to fetch commission settlements'))
  }
  return data
}

export async function createCommissionSettlement(payload) {
  let body
  if (payload instanceof FormData) {
    body = payload
  } else {
    body = JSON.stringify(payload)
  }
  const response = await apiFetch('/api/commissions/settlements/', {
    method: 'POST',
    body
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to record commission settlement'))
  }
  return data
}

export async function fetchRegulationSettlementRequests(params = {}) {
  const query = new URLSearchParams()
  if (params.agentId || params.agent_id) query.set('agent_id', params.agentId || params.agent_id)
  const response = await apiFetch(`/api/commissions/regulation-requests/?${query.toString()}`)
  const data = await response.json().catch(() => ([]))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to fetch regulation settlement requests'))
  }
  return data
}

export async function createRegulationSettlementRequest(payload) {
  const response = await apiFetch('/api/commissions/regulation-requests/', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to submit regulation settlement request'))
  }
  return data
}

export async function updateRegulationSettlementRequest(id, payload) {
  const response = await apiFetch(`/api/commissions/regulation-requests/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to update regulation settlement request'))
  }
  return data
}

export async function fetchRefundRecords(params = {}) {
  const query = new URLSearchParams()
  if (params.agentId || params.agent_id) query.set('agent_id', params.agentId || params.agent_id)
  if (params.status) query.set('status', params.status)
  const response = await apiFetch(`/api/commissions/refunds/?${query.toString()}`)
  const data = await response.json().catch(() => ([]))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to fetch refund records'))
  }
  return data
}

export async function fetchPenaltyRecords(params = {}) {
  const query = new URLSearchParams()
  if (params.agentId || params.agent_id) query.set('agent_id', params.agentId || params.agent_id)
  const response = await apiFetch(`/api/commissions/penalties/?${query.toString()}`)
  const data = await response.json().catch(() => ([]))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to fetch penalty records'))
  }
  return data
}

export async function createPenaltyRecord(payload) {
  const response = await apiFetch('/api/commissions/penalties/', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to create penalty record'))
  }
  return data
}

export async function updatePenaltyRecord(id, payload) {
  const response = await apiFetch(`/api/commissions/penalties/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(responseError(data, 'Failed to update penalty record'))
  }
  return data
}

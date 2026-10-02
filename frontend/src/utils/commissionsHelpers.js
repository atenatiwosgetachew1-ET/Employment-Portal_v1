import { normalizeSearchValue } from './filtering'
import * as usersService from '../services/usersService'
import * as employeesService from '../services/employeesService'

export const COMMISSION_SETTLEMENT_STORAGE_KEY = 'employment-portal.commission-settlements'
export const COMMISSION_SETTLEMENT_REQUESTS_STORAGE_KEY = 'employment-portal.commission-settlement-requests'
export const TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY = 'employment-portal.travel-confirmation-confirmed'
export const COMMISSION_STORAGE_DB_NAME = 'employment-portal-storage'
export const COMMISSION_STORAGE_DB_VERSION = 1
export const COMMISSION_STORAGE_SETTLEMENT_STORE = 'commission-settlements'
export const COMMISSION_STORAGE_PRIMARY_KEY = 'primary'
export const MAX_SETTLEMENT_RECEIPT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_SETTLEMENT_RECEIPT_TOTAL_BYTES = 15 * 1024 * 1024
export const MAX_SETTLEMENT_STORAGE_CHARS = 4_500_000
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

export function prettyStatus(value, fallback = '--') {
  if (!value) return fallback
  return String(value).replaceAll('_', ' ')
}

export function isReturnedEmployee(employee) {
  return Boolean(
    employee?.returned_from_employment ||
    employee?.return_request?.status === 'approved'
  )
}

export function isCommissionEligibleEmployee(employee) {
  return Boolean(
    !isReturnedEmployee(employee) &&
    employee?.did_travel
  )
}

export function isSettledCommissionEmployee(employee) {
  return Boolean(
    employee?.settled_commission ||
    isReturnedEmployee(employee) &&
    employee?.did_travel
  )
}

export function commissionStatus(employee) {
  if (employee?.settled_commission) return 'Settled commission'
  return isCommissionEligibleEmployee(employee) ? 'Unsettled commission' : 'Not commission-eligible'
}

export function settledCommissionStatus(employee) {
  return isSettledCommissionEmployee(employee) ? 'Settled commission' : 'Not settled'
}

export function statusTone(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!normalized) return ''
  if (['pending', 'requested'].includes(normalized)) return 'pending'
  if (['approved', 'active', 'fully_signed', 'success'].includes(normalized)) return 'success'
  if (normalized === 'selected') return 'selected'
  if (normalized === 'settled') return 'settled'
  if (['declined', 'failed', 'expired', 'cancelled'].includes(normalized)) return 'declined'
  return ''
}

export function employmentStage(employee) {
  if (isReturnedEmployee(employee)) return 'Returned'
  if (isCommissionEligibleEmployee(employee)) return 'Employed'
  return 'Travel pending'
}

export function agentNameForEmployee(employee) {
  return employee?.selection_state?.selection?.agent_name || 'Unassigned agent'
}

export function displayAgentName(agent) {
  return [agent?.first_name, agent?.last_name].filter(Boolean).join(' ') || agent?.username || 'Unknown agent'
}

export function employeeBelongsToAgent(employee, user) {
  const currentAgentId = user?.agent_context?.agent_id || null
  const employeeAgentId = employee?.selection_state?.selection?.agent || null

  if (currentAgentId && employeeAgentId) {
    return String(currentAgentId) === String(employeeAgentId)
  }

  const userCandidates = [
    displayActorName(user),
    displayAgentName(user),
    user?.agent_context?.agent_name,
    user?.staff_side,
    user?.username,
    user?.email
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  const employeeCandidates = [
    employee?.selection_state?.selection?.agent_name,
    employee?.selection_state?.selection?.agent_username,
    employee?.selection_state?.selection?.agent_email,
    employee?.selection_state?.agent_name,
    employee?.registered_by_username
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  return employeeCandidates.some((candidate) => userCandidates.includes(candidate))
}

export function employeeMovementDate(employee) {
  return employee?.departure_date || employee?.created_at || ''
}

export function findEmployeeDocument(employee, types) {
  return (employee?.documents || []).find((document) => types.includes(document.document_type)) || null
}

export function employeeProfilePhoto(employee) {
  return (
    findEmployeeDocument(employee, ['portrait_photo']) ||
    findEmployeeDocument(employee, ['full_photo']) ||
    findEmployeeDocument(employee, ['passport_photo', 'passport_document'])
  )
}

export function isImageDocument(document) {
  const mime = document?.file_type || document?.mime_type || ''
  const url = document?.file_url || ''
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(url)
}

export function readTravelConfirmationConfirmedIds() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function fileLabel(document) {
  return document?.label || document?.document_type?.replaceAll('_', ' ') || 'Document'
}

export function numericCommissionRate(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(value))
}

export function displayActorName(actor) {
  return [actor?.first_name, actor?.last_name].filter(Boolean).join(' ') || actor?.username || 'Unknown agent'
}

export function formatDateTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function formatDateOnly(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function collectedWeekNumber(date) {
  const year = date.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const diffDays = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

export function groupCollectedSettlementsByRange(source, range) {
  const datedSettlements = source
    .map((settlement) => {
      const rawDate = settlement.settledAt || settlement.createdAt || ''
      const parsed = new Date(rawDate)
      if (Number.isNaN(parsed.getTime())) return null
      return { settlement, parsed }
    })
    .filter(Boolean)

  if (datedSettlements.length === 0) return []

  const latestSettlementYear = datedSettlements.reduce(
    (latest, item) => Math.max(latest, item.parsed.getFullYear()),
    datedSettlements[0].parsed.getFullYear()
  )

  const grouped = datedSettlements.reduce((acc, item) => {
    const { settlement, parsed } = item
    const year = parsed.getFullYear()
    const month = parsed.getMonth()
    let key = ''
    let label = ''
    let order = parsed.getTime()
    let weekIndex = null
    let quarterIndex = null

    if (range === 'weekly') {
      if (year !== latestSettlementYear) {
        return acc
      }
      const week = collectedWeekNumber(parsed)
      weekIndex = week
      key = `${year}-W${String(week).padStart(2, '0')}`
      label = `W${week}`
      order = year * 100 + week
    } else if (range === 'quarterly') {
      const quarter = Math.floor(month / 3) + 1
      quarterIndex = quarter
      key = `${year}-Q${quarter}`
      label = `Q${quarter} ${year}`
      order = year * 10 + quarter
    } else if (range === 'yearly') {
      key = `${year}`
      label = `${year}`
      order = year
    } else {
      key = `${year}-${String(month + 1).padStart(2, '0')}`
      label = parsed.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      order = year * 100 + (month + 1)
    }

    if (!acc[key]) {
      acc[key] = {
        key,
        label,
        order,
        year,
        monthIndex: range === 'monthly' || range === 'weekly' ? month : null,
        weekIndex,
        quarterIndex,
        settlements: 0,
        employees: 0,
        amount: 0,
        firstDate: parsed.toISOString(),
        agentNames: new Set()
      }
    }

    acc[key].settlements += 1
    acc[key].employees += settlement.employees?.length || 0
    acc[key].amount += Number(settlement.totalCommissionValue || 0)
    if (settlement.agentName) {
      acc[key].agentNames.add(settlement.agentName)
    }
    if (parsed.toISOString() < acc[key].firstDate) {
      acc[key].firstDate = parsed.toISOString()
    }
    return acc
  }, {})

  const limit =
    range === 'weekly' ? 52
      : range === 'yearly' ? 6
        : range === 'quarterly' ? 8
          : 12

  return Object.values(grouped)
    .map((entry) => ({
      ...entry,
      agentNames: Array.from(entry.agentNames)
    }))
    .sort((a, b) => a.order - b.order)
    .slice(-limit)
}

export function filterSettlementsForCollectedEntry(source, range, entry) {
  return source.filter((settlement) => {
    const rawDate = settlement.settledAt || settlement.createdAt || ''
    const parsed = new Date(rawDate)
    if (Number.isNaN(parsed.getTime())) return false

    if (range === 'yearly') {
      return parsed.getFullYear() === entry.year
    }
    if (range === 'quarterly') {
      return parsed.getFullYear() === entry.year && Math.floor(parsed.getMonth() / 3) + 1 === entry.quarterIndex
    }
    if (range === 'monthly') {
      return parsed.getFullYear() === entry.year && parsed.getMonth() === entry.monthIndex
    }
    if (range === 'weekly') {
      return parsed.getFullYear() === entry.year && collectedWeekNumber(parsed) === entry.weekIndex
    }
    return false
  })
}

export function collectedChildRange(range) {
  if (range === 'yearly' || range === 'quarterly') return 'monthly'
  if (range === 'monthly') return 'weekly'
  return null
}

export function timePassedLabel(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'

  const now = new Date()
  const diffMs = Math.max(0, now.getTime() - parsed.getTime())
  const dayMs = 1000 * 60 * 60 * 24
  const days = Math.floor(diffMs / dayMs)

  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`

  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'}`
}

export function settlementOwnerKey(user) {
  if (user?.agent_context?.agent_id) return `agent:${user.agent_context.agent_id}`
  if (user?.id) return `user:${user.id}`
  return `workspace:${(user?.staff_side || user?.organization?.name || 'default').trim().toLowerCase()}`
}

export function openCommissionStorageDb() {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(COMMISSION_STORAGE_DB_NAME, COMMISSION_STORAGE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(COMMISSION_STORAGE_SETTLEMENT_STORE)) {
        db.createObjectStore(COMMISSION_STORAGE_SETTLEMENT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open browser storage'))
  })
}

export async function readStoredSettlements() {
  if (typeof window === 'undefined') return []
  try {
    const res = await employeesService.fetchCommissionSettlements()
    const backendItems = res?.results || (Array.isArray(res) ? res : null)
    if (backendItems && backendItems.length > 0) {
      return backendItems.map((item) => ({
        id: item.id,
        ownerKey: `agent:${item.agent}`,
        agentName: item.agent_name || 'Agent',
        employeeIds: (item.commission_requests_details || []).map((cr) => cr.employee_id).filter(Boolean),
        employees: (item.commission_requests_details || []).map((cr) => ({
          id: cr.employee_id,
          full_name: cr.employee_name,
          settled_commission: true,
        })),
        rate: item.total_amount,
        totalCommissionValue: Number(item.net_amount || item.total_amount || 0),
        settledAt: item.settled_at?.slice(0, 10) || item.created_at?.slice(0, 10),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        receipts: [
          item.receipt_file_1 ? { id: `r1-${item.id}`, label: 'Receipt 1', dataUrl: item.receipt_file_1 } : null,
          item.receipt_file_2 ? { id: `r2-${item.id}`, label: 'Receipt 2', dataUrl: item.receipt_file_2 } : null,
          item.receipt_file_3 ? { id: `r3-${item.id}`, label: 'Receipt 3', dataUrl: item.receipt_file_3 } : null,
        ].filter(Boolean),
      }))
    }
  } catch {
    // fall back to indexedDB / localStorage
  }

  try {
    const db = await openCommissionStorageDb()
    if (db) {
      const settlements = await new Promise((resolve, reject) => {
        const transaction = db.transaction(COMMISSION_STORAGE_SETTLEMENT_STORE, 'readonly')
        const store = transaction.objectStore(COMMISSION_STORAGE_SETTLEMENT_STORE)
        const request = store.get(COMMISSION_STORAGE_PRIMARY_KEY)
        request.onsuccess = () => {
          const value = request.result
          resolve(Array.isArray(value) ? value : [])
        }
        request.onerror = () => reject(request.error || new Error('Could not read settlement storage'))
      })
      db.close()
      if (settlements.length > 0) return settlements
    }
  } catch {
    // fall back to legacy localStorage below
  }

  try {
    const raw = window.localStorage.getItem(COMMISSION_SETTLEMENT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function writeStoredSettlements(settlements) {
  if (typeof window === 'undefined') return
  try {
    const db = await openCommissionStorageDb()
    if (db) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(COMMISSION_STORAGE_SETTLEMENT_STORE, 'readwrite')
        const store = transaction.objectStore(COMMISSION_STORAGE_SETTLEMENT_STORE)
        store.put(settlements, COMMISSION_STORAGE_PRIMARY_KEY)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error || new Error('Could not save payment receipts in browser storage'))
      })
      db.close()
      try {
        window.localStorage.removeItem(COMMISSION_SETTLEMENT_STORAGE_KEY)
      } catch {
        // ignore cleanup failure
      }
      return
    }
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      throw new Error('Receipt files are too large to save in the browser. Try smaller image/PDF files.')
    }
  }

  const serialized = JSON.stringify(settlements)
  if (serialized.length > MAX_SETTLEMENT_STORAGE_CHARS) {
    throw new Error('Receipt files are too large to save in the browser. Try smaller image/PDF files.')
  }
  try {
    window.localStorage.setItem(COMMISSION_SETTLEMENT_STORAGE_KEY, serialized)
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      throw new Error('Receipt files are too large to save in the browser. Try smaller image/PDF files.')
    }
    throw error
  }
}

export function readStoredSettlementRequests() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COMMISSION_SETTLEMENT_REQUESTS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeStoredSettlementRequests(requests) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(COMMISSION_SETTLEMENT_REQUESTS_STORAGE_KEY, JSON.stringify(requests))
}

export async function readStoredSettlementRequestsAsync() {
  if (typeof window === 'undefined') return []
  try {
    const res = await employeesService.fetchCommissionRequests()
    const backendItems = res?.results || (Array.isArray(res) ? res : null)
    if (backendItems && backendItems.length > 0) {
      const mapped = backendItems.map((item) => ({
        id: item.id,
        agentId: item.agent,
        agentName: item.agent_name,
        amount: Number(item.amount || 0),
        status: item.status,
        createdAt: item.created_at,
        employee: item.employee_details || { id: item.employee, full_name: item.employee_name },
        employees: item.employee_details ? [item.employee_details] : [{ id: item.employee, full_name: item.employee_name }],
        notes: item.notes,
        is_manual: item.is_manual,
      }))
      writeStoredSettlementRequests(mapped)
      return mapped
    }
  } catch {}
  return readStoredSettlementRequests()
}

export function buildEmployeeSettlementSnapshot(employee) {
  return {
    id: employee.id,
    full_name: employee.full_name,
    profession: employee.profession,
    professional_title: employee.professional_title,
    passport_number: employee.passport_number,
    mobile_number: employee.mobile_number,
    email: employee.email,
    nationality: employee.nationality,
    application_countries: employee.application_countries || [],
    application_salary: employee.application_salary,
    employment_type: employee.employment_type,
    registered_by_username: employee.registered_by_username,
    departure_date: employee.departure_date,
    created_at: employee.created_at,
    did_travel: employee.did_travel,
    travel_status: employee.travel_status,
    return_status: employee.return_status,
    settled_commission: true,
    return_request: employee.return_request || null,
    selection_state: employee.selection_state || null,
    documents: employee.documents || []
  }
}

export function requestBelongsToAgent(request, user) {
  const currentAgentId = user?.agent_context?.agent_id || null
  if (currentAgentId && request?.agentId) {
    return String(currentAgentId) === String(request.agentId)
  }

  const userCandidates = [
    displayActorName(user),
    displayAgentName(user),
    user?.username,
    user?.email
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  const requestCandidates = [
    request?.agentName,
    request?.agentUsername,
    request?.agentEmail
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  return requestCandidates.some((candidate) => userCandidates.includes(candidate))
}

export function settlementReceiptKind(receipt) {
  const mimeType = receipt?.mimeType || ''
  const name = receipt?.name || receipt?.label || ''
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) return 'image'
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  return 'file'
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read attachment'))
    reader.readAsDataURL(file)
  })
}

export async function fetchAllEmployeePages(params = {}) {
  let page = 1
  const results = []
  let hasNext = true

  while (hasNext) {
    const response = await employeesService.fetchEmployees({
      page,
      ...params
    })
    results.push(...(response.results || []))
    hasNext = Boolean(response.next)
    page += 1
  }

  return results
}

export async function fetchAllUsersByRole(role) {
  let page = 1
  const results = []
  let hasNext = true

  while (hasNext) {
    const response = await usersService.fetchUsers({ page, role })
    results.push(...(response.results || []))
    hasNext = Boolean(response.next)
    page += 1
  }

  return results
}




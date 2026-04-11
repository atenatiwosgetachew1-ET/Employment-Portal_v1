import { useCallback, useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUiFeedback } from '../context/UiFeedbackContext'
import * as employeesService from '../services/employeesService'
import * as usersService from '../services/usersService'

const COMMISSION_VIEW_TABS = [
  { id: 'requests' },
  { id: 'unsettled' },
  { id: 'settled' },
  { id: 'collected' },
  { id: 'agents' }
]
const COLLECTED_RANGE_TABS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' }
]
const COMMISSION_SETTLEMENT_STORAGE_KEY = 'employment-portal.commission-settlements'
const COMMISSION_SETTLEMENT_REQUESTS_STORAGE_KEY = 'employment-portal.commission-settlement-requests'
const TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY = 'employment-portal.travel-confirmation-confirmed'
const COMMISSION_STORAGE_DB_NAME = 'employment-portal-storage'
const COMMISSION_STORAGE_DB_VERSION = 1
const COMMISSION_STORAGE_SETTLEMENT_STORE = 'commission-settlements'
const COMMISSION_STORAGE_PRIMARY_KEY = 'primary'
const MAX_SETTLEMENT_RECEIPT_FILE_BYTES = 5 * 1024 * 1024
const MAX_SETTLEMENT_RECEIPT_TOTAL_BYTES = 15 * 1024 * 1024
const MAX_SETTLEMENT_STORAGE_CHARS = 4_500_000

function readAccentRgbTriplet() {
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

function isAgentSideWorkspace(user) {
  if (user?.agent_context?.is_agent_side) return true
  if (user?.role === 'customer') return true
  if (user?.role !== 'staff') return false
  const staffSide = (user?.staff_side || '').trim()
  const organizationName = (user?.organization?.name || '').trim()
  return Boolean(staffSide) && staffSide !== organizationName
}

function prettyStatus(value, fallback = '--') {
  if (!value) return fallback
  return String(value).replaceAll('_', ' ')
}

function isReturnedEmployee(employee) {
  return Boolean(
    employee?.returned_from_employment ||
    employee?.return_request?.status === 'approved'
  )
}

function isCommissionEligibleEmployee(employee) {
  return Boolean(
    !isReturnedEmployee(employee) &&
    employee?.did_travel
  )
}

function isSettledCommissionEmployee(employee) {
  return Boolean(
    employee?.settled_commission ||
    isReturnedEmployee(employee) &&
    employee?.did_travel
  )
}

function commissionStatus(employee) {
  if (employee?.settled_commission) return 'Settled commission'
  return isCommissionEligibleEmployee(employee) ? 'Unsettled commission' : 'Not commission-eligible'
}

function settledCommissionStatus(employee) {
  return isSettledCommissionEmployee(employee) ? 'Settled commission' : 'Not settled'
}

function employmentStage(employee) {
  if (isReturnedEmployee(employee)) return 'Returned'
  if (isCommissionEligibleEmployee(employee)) return 'Employed'
  return 'Travel pending'
}

function agentNameForEmployee(employee) {
  return employee?.selection_state?.selection?.agent_name || 'Unassigned agent'
}

function displayAgentName(agent) {
  return [agent?.first_name, agent?.last_name].filter(Boolean).join(' ') || agent?.username || 'Unknown agent'
}

function normalizeMatchValue(value) {
  return String(value || '').trim().toLowerCase()
}

function employeeBelongsToAgent(employee, user) {
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
    .map(normalizeMatchValue)
    .filter(Boolean)

  const employeeCandidates = [
    employee?.selection_state?.selection?.agent_name,
    employee?.selection_state?.selection?.agent_username,
    employee?.selection_state?.selection?.agent_email,
    employee?.selection_state?.agent_name,
    employee?.registered_by_username
  ]
    .map(normalizeMatchValue)
    .filter(Boolean)

  return employeeCandidates.some((candidate) => userCandidates.includes(candidate))
}

function employeeMovementDate(employee) {
  return employee?.departure_date || employee?.created_at || ''
}

function findEmployeeDocument(employee, types) {
  return (employee?.documents || []).find((document) => types.includes(document.document_type)) || null
}

function employeeProfilePhoto(employee) {
  return (
    findEmployeeDocument(employee, ['portrait_photo']) ||
    findEmployeeDocument(employee, ['full_photo']) ||
    findEmployeeDocument(employee, ['passport_photo', 'passport_document'])
  )
}

function isImageDocument(document) {
  const mime = document?.file_type || document?.mime_type || ''
  const url = document?.file_url || ''
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(url)
}

function readTravelConfirmationConfirmedIds() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(TRAVEL_CONFIRMATION_CONFIRMED_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function fileLabel(document) {
  return document?.label || document?.document_type?.replaceAll('_', ' ') || 'Document'
}

function numericCommissionRate(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(value))
}

function displayActorName(actor) {
  return [actor?.first_name, actor?.last_name].filter(Boolean).join(' ') || actor?.username || 'Unknown agent'
}

function formatDateTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function formatDateOnly(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function collectedWeekNumber(date) {
  const year = date.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const diffDays = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

function groupCollectedSettlementsByRange(source, range) {
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

function filterSettlementsForCollectedEntry(source, range, entry) {
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

function collectedChildRange(range) {
  if (range === 'yearly' || range === 'quarterly') return 'monthly'
  if (range === 'monthly') return 'weekly'
  return null
}

function timePassedLabel(value) {
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

function settlementOwnerKey(user) {
  if (user?.agent_context?.agent_id) return `agent:${user.agent_context.agent_id}`
  if (user?.id) return `user:${user.id}`
  return `workspace:${(user?.staff_side || user?.organization?.name || 'default').trim().toLowerCase()}`
}

function openCommissionStorageDb() {
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

async function readStoredSettlements() {
  if (typeof window === 'undefined') return []
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

async function writeStoredSettlements(settlements) {
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

function readStoredSettlementRequests() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COMMISSION_SETTLEMENT_REQUESTS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredSettlementRequests(requests) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(COMMISSION_SETTLEMENT_REQUESTS_STORAGE_KEY, JSON.stringify(requests))
}

function buildEmployeeSettlementSnapshot(employee) {
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

function requestBelongsToAgent(request, user) {
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
    .map(normalizeMatchValue)
    .filter(Boolean)

  const requestCandidates = [
    request?.agentName,
    request?.agentUsername,
    request?.agentEmail
  ]
    .map(normalizeMatchValue)
    .filter(Boolean)

  return requestCandidates.some((candidate) => userCandidates.includes(candidate))
}

function settlementReceiptKind(receipt) {
  const mimeType = receipt?.mimeType || ''
  const name = receipt?.name || receipt?.label || ''
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) return 'image'
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  return 'file'
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read attachment'))
    reader.readAsDataURL(file)
  })
}

async function fetchAllEmployeePages(params = {}) {
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

async function fetchAllUsersByRole(role) {
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

export default function CommissionsPage() {
  const { user } = useAuth()
  const { showToast } = useUiFeedback()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sourceUnsettledCases, setSourceUnsettledCases] = useState([])
  const [agentRates, setAgentRates] = useState([])
  const [openedEmployee, setOpenedEmployee] = useState(null)
  const [previewReceipt, setPreviewReceipt] = useState(null)
  const [expandedEmployee, setExpandedEmployee] = useState(null)
  const [currentView, setCurrentView] = useState('unsettled')
  const [collectedRange, setCollectedRange] = useState('monthly')
  const [collectedDrilldown, setCollectedDrilldown] = useState(null)
  const [collectedDetailLabelFilter, setCollectedDetailLabelFilter] = useState('all')
  const [collectedDetailAgentFilter, setCollectedDetailAgentFilter] = useState('all')
  const [hoveredCollectedPoint, setHoveredCollectedPoint] = useState(null)
  const [openUnsettledGroups, setOpenUnsettledGroups] = useState({})
  const [openSettledGroups, setOpenSettledGroups] = useState({})
  const [openSettlementEmployees, setOpenSettlementEmployees] = useState({})
  const [settlements, setSettlements] = useState([])
  const [settlementRequests, setSettlementRequests] = useState([])
  const [settlementModalOpen, setSettlementModalOpen] = useState(false)
  const [settlementSaving, setSettlementSaving] = useState(false)
  const [settlementError, setSettlementError] = useState('')
  const [selectedSettlementEmployeeIds, setSelectedSettlementEmployeeIds] = useState([])
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [settlementAmount, setSettlementAmount] = useState('')
  const [editingSettlementRecord, setEditingSettlementRecord] = useState(null)
  const [settlementAmountEditable, setSettlementAmountEditable] = useState(false)
  const [settlementAmountTouched, setSettlementAmountTouched] = useState(false)
  const [settlementReceiptFiles, setSettlementReceiptFiles] = useState([null, null, null])
  const [activeSettlementRequest, setActiveSettlementRequest] = useState(null)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [requestSaving, setRequestSaving] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [selectedRequestAgentName, setSelectedRequestAgentName] = useState('')
  const [selectedRequestEmployeeIds, setSelectedRequestEmployeeIds] = useState([])
  const [requestRemark, setRequestRemark] = useState('')
  const [travelConfirmationConfirmedIds] = useState(() => readTravelConfirmationConfirmedIds())

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canRegisterSettlements = isAgentSideUser
  const canCreateSettlementRequests = !isAgentSideUser
  const canViewCollectedAnalytics = !isAgentSideUser
  const canViewAgentDirectory = !isAgentSideUser
  const permissions = user?.permissions || []
  const canManageUsers =
    Boolean(user?.feature_flags?.users_management_enabled) &&
    (permissions.includes('users.manage_all') || permissions.includes('users.manage_limited'))
  const ownerKey = useMemo(() => settlementOwnerKey(user), [user])
  const currentAgentDisplayName = displayActorName(user)
  const visibleTabs = useMemo(
    () => COMMISSION_VIEW_TABS
      .filter((tab) => {
        if (tab.id === 'collected') return canViewCollectedAnalytics
        if (tab.id === 'agents') return canViewAgentDirectory
        return true
      })
      .map((tab) => {
        if (tab.id === 'settled') {
          return { ...tab, label: isAgentSideUser ? 'Settled payments' : 'Collected payments' }
        }
        if (tab.id === 'unsettled') {
          return { ...tab, label: isAgentSideUser ? 'Outstanding payments' : 'Pending collections' }
        }
        if (tab.id === 'collected') {
          return { ...tab, label: 'Collection analytics' }
        }
        if (tab.id === 'agents') {
          return { ...tab, label: 'Agents' }
        }
        return { ...tab, label: isAgentSideUser ? 'Payment requests' : 'Collection requests' }
      }),
    [canViewAgentDirectory, canViewCollectedAnalytics, isAgentSideUser]
  )

  useEffect(() => {
    if ((currentView === 'collected' && !canViewCollectedAnalytics) || (currentView === 'agents' && !canViewAgentDirectory)) {
      setCurrentView('unsettled')
    }
  }, [canViewAgentDirectory, canViewCollectedAnalytics, currentView])

  const handleCollectedRangeChange = useCallback((nextRange) => {
    setCollectedRange(nextRange)
    setCollectedDrilldown(null)
    setHoveredCollectedPoint(null)
  }, [])

  const handleCollectedDrilldownBack = useCallback(() => {
    if (!collectedDrilldown) return

    if (collectedDrilldown.type === 'month') {
      setCollectedRange('monthly')
      setCollectedDrilldown({ type: 'year', year: collectedDrilldown.year })
    } else {
      setCollectedRange('yearly')
      setCollectedDrilldown(null)
    }

    setHoveredCollectedPoint(null)
  }, [collectedDrilldown])

  const handleCollectedEntryDrilldown = useCallback((entry) => {
    if (collectedRange === 'yearly' && entry.year) {
      setCollectedRange('monthly')
      setCollectedDrilldown({ type: 'year', year: entry.year })
    } else if (collectedRange === 'monthly' && entry.year && Number.isInteger(entry.monthIndex)) {
      setCollectedRange('weekly')
      setCollectedDrilldown({ type: 'month', year: entry.year, monthIndex: entry.monthIndex })
    } else {
      return
    }

    setHoveredCollectedPoint(null)
  }, [collectedRange])

  const handleCollectedScopeChange = useCallback((value) => {
    if (value === 'root') {
      setCollectedRange('yearly')
      setCollectedDrilldown(null)
      setHoveredCollectedPoint(null)
      return
    }

    if (value.startsWith('year:')) {
      const year = Number(value.split(':')[1])
      if (Number.isFinite(year)) {
        setCollectedRange('monthly')
        setCollectedDrilldown({ type: 'year', year })
        setHoveredCollectedPoint(null)
      }
      return
    }

    if (value.startsWith('month:')) {
      const [, yearRaw, monthRaw] = value.split(':')
      const year = Number(yearRaw)
      const monthIndex = Number(monthRaw)
      if (Number.isFinite(year) && Number.isFinite(monthIndex)) {
        setCollectedRange('weekly')
        setCollectedDrilldown({ type: 'month', year, monthIndex })
        setHoveredCollectedPoint(null)
      }
    }
  }, [])

  const handleCollectedPointHover = useCallback((event, point, chartModel) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg || !chartModel) {
      setHoveredCollectedPoint(point)
      return
    }

    const rect = svg.getBoundingClientRect()
    const scaleX = chartModel.width / rect.width
    const scaleY = chartModel.height / rect.height
    const tooltipWidth = 188
    const tooltipHeight = 76
    const tooltipX = Math.min(
      Math.max((event.clientX - rect.left) * scaleX, 0),
      chartModel.width - tooltipWidth
    )
    const tooltipY = Math.min(
      Math.max((event.clientY - rect.top) * scaleY, 0),
      chartModel.height - tooltipHeight
    )

    setHoveredCollectedPoint({
      ...point,
      tooltipX,
      tooltipY
    })
  }, [])

  const loadCommissionBoard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const scope = isAgentSideUser ? 'mine' : 'organization'
      const [baseEmployees, processEmployees, employedEmployees] = await Promise.all([
        fetchAllEmployeePages({}),
        fetchAllEmployeePages({ processScope: scope }),
        fetchAllEmployeePages({ employedScope: scope })
      ])
      const applyTravelOverrides = (employee) => (
        travelConfirmationConfirmedIds.includes(employee?.id)
          ? {
              ...employee,
              did_travel: true,
              progress_override_complete: true
            }
          : employee
      )
      const uniqueUnsettledEmployees = new Map()
      baseEmployees.map(applyTravelOverrides).forEach((employee) => {
        if (
          isCommissionEligibleEmployee(employee) &&
          (!isAgentSideUser || employeeBelongsToAgent(employee, user))
        ) {
          uniqueUnsettledEmployees.set(employee.id, employee)
        }
      })
      processEmployees.map(applyTravelOverrides).forEach((employee) => {
        if (
          isCommissionEligibleEmployee(employee) &&
          (!isAgentSideUser || employeeBelongsToAgent(employee, user)) &&
          !uniqueUnsettledEmployees.has(employee.id)
        ) {
          uniqueUnsettledEmployees.set(employee.id, employee)
        }
      })
      employedEmployees.map(applyTravelOverrides).forEach((employee) => {
        if (
          isCommissionEligibleEmployee(employee) &&
          (!isAgentSideUser || employeeBelongsToAgent(employee, user)) &&
          !uniqueUnsettledEmployees.has(employee.id)
        ) {
          uniqueUnsettledEmployees.set(employee.id, employee)
        }
      })
      setSourceUnsettledCases(Array.from(uniqueUnsettledEmployees.values()))

      if (canManageUsers) {
        try {
          setAgentRates(await fetchAllUsersByRole('customer'))
        } catch {
          setAgentRates([])
        }
      } else {
        setAgentRates([])
      }
    } catch (err) {
      setError(err.message || 'Could not load commission cases')
      setSourceUnsettledCases([])
      setAgentRates([])
    } finally {
      setLoading(false)
    }
  }, [canManageUsers, isAgentSideUser, user, travelConfirmationConfirmedIds])

  useEffect(() => {
    if (canManageEmployees) {
      loadCommissionBoard()
    } else {
      setLoading(false)
    }
  }, [canManageEmployees, loadCommissionBoard])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const allSettlements = await readStoredSettlements()
      if (cancelled) return
      setSettlements(
        isAgentSideUser
          ? allSettlements.filter((item) => item.ownerKey === ownerKey)
          : allSettlements
      )
    })()
    return () => {
      cancelled = true
    }
  }, [isAgentSideUser, ownerKey])

  useEffect(() => {
    const allRequests = readStoredSettlementRequests()
    setSettlementRequests(
      isAgentSideUser
        ? allRequests.filter((item) => requestBelongsToAgent(item, user))
        : allRequests
    )
  }, [isAgentSideUser, user])

  const persistSettlements = useCallback(async (nextOwnedSettlements) => {
    const allSettlements = await readStoredSettlements()
    const otherSettlements = allSettlements.filter((item) => item.ownerKey !== ownerKey)
    const nextAllSettlements = [...otherSettlements, ...nextOwnedSettlements]
    await writeStoredSettlements(nextAllSettlements)
    setSettlements(isAgentSideUser ? nextOwnedSettlements : nextAllSettlements)
  }, [isAgentSideUser, ownerKey])

  const persistSettlementRequests = useCallback((nextVisibleRequests) => {
    const allRequests = readStoredSettlementRequests()
    const nextAllRequests = isAgentSideUser
      ? [
          ...allRequests.filter((item) => !requestBelongsToAgent(item, user)),
          ...nextVisibleRequests
        ]
      : nextVisibleRequests

    writeStoredSettlementRequests(nextAllRequests)
    setSettlementRequests(nextVisibleRequests)
  }, [isAgentSideUser, user])

  const settledEmployeeIds = useMemo(
    () => new Set(settlements.flatMap((settlement) => (settlement.employeeIds || []).map((id) => String(id)))),
    [settlements]
  )

  const unsettledCases = useMemo(
    () => sourceUnsettledCases.filter((employee) => !settledEmployeeIds.has(String(employee.id))),
    [settledEmployeeIds, sourceUnsettledCases]
  )

  const pendingSettlementRequests = useMemo(
    () => settlementRequests.filter((request) => request.status === 'pending'),
    [settlementRequests]
  )

  const pendingSettlementRequestedEmployeeIds = useMemo(
    () => new Set(pendingSettlementRequests.flatMap((request) => (request.employeeIds || []).map((id) => String(id)))),
    [pendingSettlementRequests]
  )

  const settlementEligibleEmployees = useMemo(() => {
    if (!canRegisterSettlements) return []

    if (activeSettlementRequest) {
      const requestedEmployeeIds = [
        ...(activeSettlementRequest.employeeIds || []),
        ...((activeSettlementRequest.employees || []).map((employee) => employee.id))
      ].map((id) => String(id))

      const matchingLiveEmployees = unsettledCases.filter((employee) => requestedEmployeeIds.includes(String(employee.id)))
      if (matchingLiveEmployees.length > 0) return matchingLiveEmployees

      return (activeSettlementRequest.employees || []).map((employee) => ({
        ...employee,
        settled_commission: false
      }))
    }

    return unsettledCases
  }, [activeSettlementRequest, canRegisterSettlements, unsettledCases])

  const unsettledVisibleCases = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return unsettledCases
    return unsettledCases.filter((employee) =>
      [
        employee.full_name,
        employee.profession,
        employee.professional_title,
        employee.passport_number,
        employee.mobile_number,
        agentNameForEmployee(employee)
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [search, unsettledCases])

  const visibleSettlements = useMemo(() => {
    const query = search.trim().toLowerCase()
    const normalizedSettlements = settlements.map((settlement) => ({
      ...settlement,
      employees: (settlement.employees || []).map((employee) => ({
        ...employee,
        settled_commission: true
      }))
    }))
    if (!query) return normalizedSettlements
    return normalizedSettlements.filter((settlement) =>
      [
        settlement.agentName,
        ...(settlement.employees || []).flatMap((employee) => [
          employee.full_name,
          employee.profession,
          employee.professional_title,
          employee.passport_number,
          employee.mobile_number
        ]),
        ...(settlement.receipts || []).map((receipt) => receipt.label)
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [search, settlements])

  const collectedSettlementSource = useMemo(() => {
    return visibleSettlements
  }, [visibleSettlements])

  const scopedCollectedSettlementSource = useMemo(() => {
    if (!collectedDrilldown) return collectedSettlementSource

    return collectedSettlementSource.filter((settlement) => {
      const rawDate = settlement.settledAt || settlement.createdAt || ''
      const parsed = new Date(rawDate)
      if (Number.isNaN(parsed.getTime())) return false

      if (collectedDrilldown.type === 'year') {
        return parsed.getFullYear() === collectedDrilldown.year
      }

      if (collectedDrilldown.type === 'month') {
        return parsed.getFullYear() === collectedDrilldown.year && parsed.getMonth() === collectedDrilldown.monthIndex
      }

      return true
    })
  }, [collectedDrilldown, collectedSettlementSource])

  const collectedScopeOptions = useMemo(() => {
    const datedSettlements = collectedSettlementSource
      .map((settlement) => {
        const rawDate = settlement.settledAt || settlement.createdAt || ''
        const parsed = new Date(rawDate)
        if (Number.isNaN(parsed.getTime())) return null
        return parsed
      })
      .filter(Boolean)

    const years = Array.from(new Set(datedSettlements.map((date) => date.getFullYear()))).sort((a, b) => a - b)
    const monthOptions = years.flatMap((year) => {
      const monthIndexes = Array.from(
        new Set(
          datedSettlements
            .filter((date) => date.getFullYear() === year)
            .map((date) => date.getMonth())
        )
      ).sort((a, b) => a - b)

      return monthIndexes.map((monthIndex) => ({
        value: `month:${year}:${monthIndex}`,
        label: `${year} / ${new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: 'long' })}`
      }))
    })

    return [
      { value: 'root', label: 'All years' },
      ...years.map((year) => ({ value: `year:${year}`, label: String(year) })),
      ...monthOptions
    ]
  }, [collectedSettlementSource])

  const selectedCollectedScope = useMemo(() => {
    if (!collectedDrilldown) return 'root'
    if (collectedDrilldown.type === 'year') return `year:${collectedDrilldown.year}`
    if (collectedDrilldown.type === 'month') return `month:${collectedDrilldown.year}:${collectedDrilldown.monthIndex}`
    return 'root'
  }, [collectedDrilldown])

  const requestEligibleEmployees = useMemo(() => {
    if (!canCreateSettlementRequests) return []
    return unsettledCases.filter((employee) => !pendingSettlementRequestedEmployeeIds.has(String(employee.id)))
  }, [canCreateSettlementRequests, pendingSettlementRequestedEmployeeIds, unsettledCases])

  const requestEligibleGroups = useMemo(() => {
    const grouped = requestEligibleEmployees.reduce((acc, employee) => {
      const key = agentNameForEmployee(employee)
      if (!acc[key]) {
        acc[key] = {
          agentName: key,
          agentId: employee?.selection_state?.selection?.agent || null,
          agentUsername: employee?.selection_state?.selection?.agent_username || '',
          agentEmail: employee?.selection_state?.selection?.agent_email || '',
          employees: []
        }
      }
      acc[key].employees.push(employee)
      return acc
    }, {})

    return Object.values(grouped).sort((a, b) => b.employees.length - a.employees.length || a.agentName.localeCompare(b.agentName))
  }, [requestEligibleEmployees])

  const selectedRequestGroup = useMemo(
    () => requestEligibleGroups.find((group) => group.agentName === selectedRequestAgentName) || null,
    [requestEligibleGroups, selectedRequestAgentName]
  )

  const visibleSettlementRequests = useMemo(() => {
    const query = search.trim().toLowerCase()
    const activeRequests = settlementRequests.filter((request) => request.status !== 'cancelled' && request.status !== 'acknowledged')
    if (!query) return activeRequests
    return activeRequests.filter((request) =>
      [
        request.agentName,
        request.requestedByName,
        request.note,
        ...(request.employees || []).flatMap((employee) => [
          employee.full_name,
          employee.profession,
          employee.professional_title,
          employee.passport_number
        ])
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [search, settlementRequests])

  const summary = useMemo(() => {
    if (currentView === 'settled') {
      const employeesCount = visibleSettlements.reduce((acc, settlement) => acc + (settlement.employees?.length || 0), 0)
      const receiptsCount = visibleSettlements.reduce((acc, settlement) => acc + (settlement.receipts?.length || 0), 0)
      const totalValue = visibleSettlements.reduce((acc, settlement) => acc + Number(settlement.totalCommissionValue || 0), 0)

      return {
        total: visibleSettlements.length,
        travelled: employeesCount,
        pendingReturnRequests: receiptsCount,
        agentCount: totalValue
      }
    }

    if (currentView === 'collected') {
      const employeesCount = scopedCollectedSettlementSource.reduce((acc, settlement) => acc + (settlement.employees?.length || 0), 0)
      const receiptsCount = scopedCollectedSettlementSource.reduce((acc, settlement) => acc + (settlement.receipts?.length || 0), 0)
      const totalValue = scopedCollectedSettlementSource.reduce((acc, settlement) => acc + Number(settlement.totalCommissionValue || 0), 0)

      return {
        total: scopedCollectedSettlementSource.length,
        travelled: employeesCount,
        pendingReturnRequests: receiptsCount,
        agentCount: totalValue
      }
    }

    if (currentView === 'requests') {
      const requestedEmployees = visibleSettlementRequests.reduce(
        (acc, request) => acc + Math.max(request.employees?.length || 0, request.employeeIds?.length || 0),
        0
      )
      const pendingCount = visibleSettlementRequests.filter((request) => request.status === 'pending').length
      const settledCount = visibleSettlementRequests.filter((request) => request.status === 'settled').length

      return {
        total: visibleSettlementRequests.length,
        travelled: requestedEmployees,
        pendingReturnRequests: pendingCount,
        agentCount: settledCount
      }
    }

    const agentCount = new Set(unsettledVisibleCases.map((employee) => agentNameForEmployee(employee))).size
    const travelled = unsettledVisibleCases.filter((employee) => employee.did_travel || employee.travel_status === 'travelled').length
    const pendingReturnRequests = unsettledVisibleCases.filter((employee) => employee.return_request?.status === 'pending').length

    return {
      total: unsettledVisibleCases.length,
      travelled,
      pendingReturnRequests,
      agentCount
    }
  }, [currentView, scopedCollectedSettlementSource, unsettledVisibleCases, visibleSettlements, visibleSettlementRequests])

  const collectedTimeline = useMemo(() => {
    return groupCollectedSettlementsByRange(scopedCollectedSettlementSource, collectedRange)
  }, [collectedRange, scopedCollectedSettlementSource])

  const maxCollectedAmount = useMemo(() => {
    const values = collectedTimeline.map((entry) => entry.amount)
    return values.length ? Math.max(...values, 1) : 1
  }, [collectedTimeline])

  const collectedDetailLabelOptions = useMemo(
    () => ['all', ...collectedTimeline.map((entry) => entry.label)],
    [collectedTimeline]
  )

  const collectedDetailAgentOptions = useMemo(
    () => ['all', ...Array.from(new Set(collectedTimeline.flatMap((entry) => entry.agentNames || [])))],
    [collectedTimeline]
  )

  const filteredCollectedTimelineDetails = useMemo(() => {
    return collectedTimeline.filter((entry) =>
      (collectedDetailLabelFilter === 'all' || entry.label === collectedDetailLabelFilter) &&
      (collectedDetailAgentFilter === 'all' || (entry.agentNames || []).includes(collectedDetailAgentFilter))
    )
  }, [collectedDetailAgentFilter, collectedDetailLabelFilter, collectedTimeline])

  const handlePrintCollectedReport = useCallback(() => {
    const timelineHeading =
      collectedRange === 'weekly'
        ? 'Weekly Timeline'
        : collectedRange === 'monthly'
        ? 'Monthly Timeline'
        : collectedRange === 'quarterly'
        ? 'Quarterly Timeline'
        : 'Yearly Timeline'

    const scopeLabel =
      collectedDrilldown?.type === 'month'
        ? new Date(collectedDrilldown.year, collectedDrilldown.monthIndex, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : collectedDrilldown?.type === 'year'
        ? String(collectedDrilldown.year)
        : 'All years'

    const sourceForChildren = scopedCollectedSettlementSource.filter((settlement) =>
      collectedDetailAgentFilter === 'all' ? true : settlement.agentName === collectedDetailAgentFilter
    )
    const childRange = collectedChildRange(collectedRange)
    const childHeading =
      childRange === 'weekly'
        ? 'Weekly Timeline'
        : childRange === 'monthly'
        ? 'Monthly Timeline'
        : childRange === 'quarterly'
        ? 'Quarterly Timeline'
        : childRange === 'yearly'
        ? 'Yearly Timeline'
        : 'Child Timeline'
    const childSections = childRange
      ? filteredCollectedTimelineDetails.map((entry) => ({
          entry,
          childRange,
          children: groupCollectedSettlementsByRange(
            filterSettlementsForCollectedEntry(sourceForChildren, collectedRange, entry),
            childRange
          )
        }))
      : []
    const rawSettlements =
      collectedRange === 'weekly'
        ? filteredCollectedTimelineDetails.map((entry) => ({
            entry,
            settlements: filterSettlementsForCollectedEntry(sourceForChildren, collectedRange, entry)
          }))
        : []

    const generatedOn = new Date()
    const dateLabel = formatDateOnly(generatedOn)
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const left = 42
    const right = pageWidth - 42
    const accent = readAccentRgbTriplet()
    const dark = [28, 28, 28]
    const muted = [99, 107, 122]
    let currentY = 46

    const getAutoTableEnd = () => doc.lastAutoTable?.finalY ?? currentY
    const addPageIfNeeded = (needed = 80) => {
      if (currentY + needed <= pageHeight - 42) return
      doc.addPage()
      currentY = 46
    }

    const addHeader = (title, subtitle) => {
      doc.setTextColor(...dark)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text(title, left, currentY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...muted)
      doc.text(subtitle, left, currentY + 16)
      doc.setDrawColor(225, 214, 201)
      doc.line(left, currentY + 28, right, currentY + 28)
      currentY += 46
    }

    const addSectionTitle = (title, note = '') => {
      addPageIfNeeded(64)
      doc.setTextColor(...accent)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(title, left, currentY)
      currentY += 10
      if (note) {
        doc.setTextColor(...muted)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lines = doc.splitTextToSize(note, right - left)
        doc.text(lines, left, currentY + 10)
        currentY += lines.length * 12 + 8
      } else {
        currentY += 8
      }
    }

    const addSummaryTable = (rows) => {
      autoTable(doc, {
        startY: currentY,
        margin: { left, right: pageWidth - right },
        head: [['Metric', 'Value']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 7, textColor: dark, overflow: 'linebreak' },
        headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 244, 239] }
      })
      currentY = getAutoTableEnd() + 18
    }

    const addDataTable = (title, rows, head, note = '') => {
      if (!rows.length) return
      addSectionTitle(title, note)
      autoTable(doc, {
        startY: currentY,
        margin: { left, right: pageWidth - right },
        head: [head],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 6, textColor: dark, overflow: 'linebreak' },
        headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 244, 239] }
      })
      currentY = getAutoTableEnd() + 18
    }

    addHeader('Collected Commissions Report', `Generated on ${generatedOn.toLocaleString()}`)

    addSectionTitle('Executive Summary', 'This PDF reflects the current collected-commissions timeline scope, filters, and only the visible child breakdowns below it.')
    addSummaryTable([
      ['Scope', scopeLabel],
      ['Timeline', timelineHeading],
      ['Period filter', collectedDetailLabelFilter === 'all' ? 'All periods' : collectedDetailLabelFilter],
      ['Agent filter', collectedDetailAgentFilter === 'all' ? 'All agents' : collectedDetailAgentFilter],
      ['Visible periods', String(filteredCollectedTimelineDetails.length)]
    ])

    addDataTable(
      timelineHeading,
      filteredCollectedTimelineDetails.map((entry) => [
        entry.label,
        formatCurrency(entry.amount),
        `${entry.settlements} settlement${entry.settlements === 1 ? '' : 's'}`,
        `${entry.employees} employee${entry.employees === 1 ? '' : 's'}`,
        formatDateOnly(entry.firstDate),
        (entry.agentNames || []).join(', ') || 'Unknown agent'
      ]),
      ['Period', 'Collected value', 'Settlements', 'Employees', 'Started', 'Agents'],
      `Current scope: ${scopeLabel}`
    )

    if (childSections.length) {
      childSections.forEach(({ entry, children }) => {
        addDataTable(
          `${childHeading}: ${entry.label}`,
          children.length
            ? children.map((child) => [
                child.label,
                formatCurrency(child.amount),
                `${child.settlements} settlement${child.settlements === 1 ? '' : 's'}`,
                `${child.employees} employee${child.employees === 1 ? '' : 's'}`,
                formatDateOnly(child.firstDate),
                (child.agentNames || []).join(', ') || 'Unknown agent'
              ])
            : [['No child breakdown available', '--', '--', '--', '--', '--']],
          ['Period', 'Collected value', 'Settlements', 'Employees', 'Started', 'Agents']
        )
      })
    }

    if (rawSettlements.length) {
      rawSettlements.forEach(({ entry, settlements }) => {
        addDataTable(
          `Weekly Settlements: ${entry.label}`,
          settlements.map((settlement) => [
            settlement.agentName || 'Unknown agent',
            formatCurrency(settlement.totalCommissionValue),
            formatDateOnly(settlement.settledAt || settlement.createdAt),
            (settlement.employees || []).map((employee) => employee.full_name).join(', ') || 'No employees listed',
            (settlement.receipts || []).map((receipt) => receipt.label || receipt.name).join(', ') || 'No receipt'
          ]),
          ['Agent', 'Collected value', 'Settled on', 'Employees', 'Receipts']
        )
      })
    }

    const pageCount = doc.getNumberOfPages()
    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      doc.setPage(pageIndex)
      doc.setDrawColor(225, 214, 201)
      doc.line(left, pageHeight - 28, right, pageHeight - 28)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...muted)
      doc.text(`Collected Commissions Report | Page ${pageIndex} of ${pageCount}`, left, pageHeight - 14)
      doc.text('Employment Portal', right, pageHeight - 14, { align: 'right' })
    }

    doc.save(`commissions-collected-report-${dateLabel}.pdf`)
  }, [
    collectedDetailAgentFilter,
    collectedDetailLabelFilter,
    collectedDrilldown,
    collectedRange,
    filteredCollectedTimelineDetails,
    scopedCollectedSettlementSource
  ])

  const collectedChartModel = useMemo(() => {
    if (collectedTimeline.length === 0) return null

    const width = 760
    const height = 280
    const padding = { top: 20, right: 20, bottom: 44, left: 20 }
    const innerWidth = width - padding.left - padding.right
    const innerHeight = height - padding.top - padding.bottom
    const denominator = Math.max(collectedTimeline.length - 1, 1)

    const points = collectedTimeline.map((entry, index) => {
      const x = padding.left + (innerWidth * (collectedTimeline.length === 1 ? 0.5 : index / denominator))
      const y = padding.top + innerHeight - ((entry.amount / maxCollectedAmount) * innerHeight)
      return { ...entry, x, y }
    })

    const linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ')

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: padding.top + innerHeight - (innerHeight * ratio),
      value: formatCurrency(maxCollectedAmount * ratio)
    }))

    return {
      width,
      height,
      points,
      linePath,
      gridLines,
      baselineY: padding.top + innerHeight
    }
  }, [collectedTimeline, maxCollectedAmount])

  const casesByAgent = useMemo(() => {
    const grouped = unsettledVisibleCases.reduce((acc, employee) => {
      const key = agentNameForEmployee(employee)
      if (!acc[key]) acc[key] = []
      acc[key].push(employee)
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([agentName, employees]) => ({
        agentName,
        employees: employees.sort((a, b) => a.full_name.localeCompare(b.full_name)),
        startingFrom: employees
          .map((employee) => employeeMovementDate(employee))
          .filter(Boolean)
          .sort()[0] || ''
      }))
      .sort((a, b) => b.employees.length - a.employees.length || a.agentName.localeCompare(b.agentName))
  }, [unsettledVisibleCases])

  const agentSettlementMetrics = useMemo(() => {
    return unsettledVisibleCases.reduce((acc, employee) => {
      const key = agentNameForEmployee(employee)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [unsettledVisibleCases])

  const agentRateLookup = useMemo(() => {
    return agentRates.reduce((acc, agent) => {
      acc[displayAgentName(agent)] = numericCommissionRate(agent.agent_commission)
      return acc
    }, {})
  }, [agentRates])

  const expectedSettlementAmount = useMemo(() => {
    const fallbackRate = numericCommissionRate(user?.agent_commission || user?.profile?.agent_commission)
    const effectiveRate = agentRateLookup[currentAgentDisplayName] ?? fallbackRate ?? null
    return effectiveRate === null ? null : effectiveRate * selectedSettlementEmployeeIds.length
  }, [agentRateLookup, currentAgentDisplayName, selectedSettlementEmployeeIds.length, user])

  useEffect(() => {
    if (!settlementAmountEditable) {
      setSettlementAmount(expectedSettlementAmount === null ? '' : String(expectedSettlementAmount))
    }
  }, [expectedSettlementAmount, settlementAmountEditable])

  const agentSettlementCounts = useMemo(() => {
    return settlements.reduce((acc, settlement) => {
      const key = settlement.agentName || 'Unknown agent'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [settlements])

  const agentsSummary = useMemo(() => {
    const activeAgents = agentRates.filter((agent) => {
      const name = displayAgentName(agent)
      return (agentSettlementMetrics[name] || 0) > 0 || (agentSettlementCounts[name] || 0) > 0
    }).length

    return {
      totalProfiles: agentRates.length,
      unsettledCases: unsettledVisibleCases.length,
      settlements: settlements.length,
      activeAgents
    }
  }, [agentRates, agentSettlementCounts, agentSettlementMetrics, settlements.length, unsettledVisibleCases.length])

  const maxUnsettledCases = useMemo(() => {
    const values = Object.values(agentSettlementMetrics)
    return values.length ? Math.max(...values, 1) : 1
  }, [agentSettlementMetrics])

  const summaryDisplay = useMemo(() => {
    if (currentView === 'settled') {
      return {
        firstLabel: isAgentSideUser ? 'Settlements made' : 'Collections received',
        firstValue: summary.total,
        secondLabel: isAgentSideUser ? 'Employees paid for' : 'Employees settled',
        secondValue: summary.travelled,
        thirdLabel: 'Receipt files',
        thirdValue: summary.pendingReturnRequests,
        fourthLabel: isAgentSideUser ? 'Total paid' : 'Total collected',
        fourthValue: formatCurrency(summary.agentCount)
      }
    }

    if (currentView === 'requests') {
      return {
        firstLabel: isAgentSideUser ? 'Requests received' : 'Requests sent',
        firstValue: summary.total,
        secondLabel: 'Employees requested',
        secondValue: summary.travelled,
        thirdLabel: isAgentSideUser ? 'Pending payments' : 'Pending requests',
        thirdValue: summary.pendingReturnRequests,
        fourthLabel: isAgentSideUser ? 'Paid requests' : 'Collected requests',
        fourthValue: summary.agentCount
      }
    }

    if (currentView === 'collected') {
      return {
        firstLabel: 'Collection windows',
        firstValue: summary.total,
        secondLabel: 'Employees covered',
        secondValue: summary.travelled,
        thirdLabel: 'Receipt files',
        thirdValue: summary.pendingReturnRequests,
        fourthLabel: 'Collected value',
        fourthValue: formatCurrency(summary.agentCount)
      }
    }

    if (currentView === 'agents') {
      return {
        firstLabel: 'Agent profiles',
        firstValue: agentsSummary.totalProfiles,
        secondLabel: 'Unsettled cases',
        secondValue: agentsSummary.unsettledCases,
        thirdLabel: 'Settlements logged',
        thirdValue: agentsSummary.settlements,
        fourthLabel: 'Active agents',
        fourthValue: agentsSummary.activeAgents
      }
    }

    return {
      firstLabel: isAgentSideUser ? 'Outstanding payments' : 'Pending collections',
      firstValue: summary.total,
      secondLabel: isAgentSideUser ? 'Employees to pay for' : 'Employees awaiting collection',
      secondValue: summary.travelled,
      thirdLabel: 'Pending return requests',
      thirdValue: summary.pendingReturnRequests,
      fourthLabel: isAgentSideUser ? 'Paying agent' : 'Responsible agents',
      fourthValue: isAgentSideUser ? currentAgentDisplayName : summary.agentCount
    }
  }, [
    agentsSummary.activeAgents,
    agentsSummary.settlements,
    agentsSummary.totalProfiles,
    agentsSummary.unsettledCases,
    currentAgentDisplayName,
    currentView,
    isAgentSideUser,
    summary.agentCount,
    summary.pendingReturnRequests,
    summary.total,
    summary.travelled
  ])

  const settledSettlements = useMemo(() => {
    return visibleSettlements.slice().sort((a, b) => new Date(b.settledAt || 0) - new Date(a.settledAt || 0))
  }, [visibleSettlements])

  const toggleUnsettledGroup = useCallback((groupName) => {
    setOpenUnsettledGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
  }, [])

  const toggleSettledGroup = useCallback((settlementId) => {
    setOpenSettledGroups((prev) => ({ ...prev, [settlementId]: !prev[settlementId] }))
  }, [])

  const toggleSettlementEmployees = useCallback((settlementId) => {
    setOpenSettlementEmployees((prev) => ({ ...prev, [settlementId]: !prev[settlementId] }))
  }, [])

  const resetSettlementForm = useCallback(() => {
    setSelectedSettlementEmployeeIds([])
    setSettlementDate(new Date().toISOString().slice(0, 10))
    setSettlementAmount('')
    setEditingSettlementRecord(null)
    setSettlementAmountEditable(false)
    setSettlementAmountTouched(false)
    setSettlementReceiptFiles([null, null, null])
    setSettlementError('')
    setActiveSettlementRequest(null)
  }, [])

  const openSettlementModal = useCallback((request = null) => {
    const normalizedRequest = request && typeof request === 'object' && !('nativeEvent' in request) ? request : null
    resetSettlementForm()
    setActiveSettlementRequest(normalizedRequest)
    const requestEmployeeIds = normalizedRequest
      ? [
          ...(normalizedRequest.employeeIds || []),
          ...((normalizedRequest.employees || []).map((employee) => employee.id))
        ]
      : []
    if (requestEmployeeIds.length) {
      setSelectedSettlementEmployeeIds(Array.from(new Set(requestEmployeeIds)))
    }
    const linkedSettlement = normalizedRequest?.settlementId
      ? settlements.find((item) => String(item.id) === String(normalizedRequest.settlementId)) || null
      : null
    if (linkedSettlement) {
      setEditingSettlementRecord(linkedSettlement)
      setSettlementAmount(linkedSettlement.totalCommissionValue === null || linkedSettlement.totalCommissionValue === undefined ? '' : String(linkedSettlement.totalCommissionValue))
      setSettlementAmountTouched(true)
      setSettlementAmountEditable(true)
    }
    setSettlementModalOpen(true)
  }, [resetSettlementForm, settlements])

  const closeSettlementModal = useCallback(() => {
    setSettlementModalOpen(false)
    resetSettlementForm()
  }, [resetSettlementForm])

  const handleSettlementReceiptPick = useCallback((index, file) => {
    if (file && file.size > MAX_SETTLEMENT_RECEIPT_FILE_BYTES) {
      setSettlementError(`Receipt "${file.name}" is too large. Keep each receipt under ${Math.round(MAX_SETTLEMENT_RECEIPT_FILE_BYTES / 1024)} KB.`)
      return
    }

    const nextFiles = settlementReceiptFiles.map((item, itemIndex) => (itemIndex === index ? file || null : item))
    const totalBytes = nextFiles.reduce((sum, item) => sum + (item?.size || 0), 0)
    if (totalBytes > MAX_SETTLEMENT_RECEIPT_TOTAL_BYTES) {
      setSettlementError(`Receipt files are too large together. Keep the total under ${Math.round(MAX_SETTLEMENT_RECEIPT_TOTAL_BYTES / 1024)} KB.`)
      return
    }

    setSettlementError('')
    setSettlementReceiptFiles((prev) => prev.map((item, itemIndex) => (itemIndex === index ? file || null : item)))
  }, [settlementReceiptFiles])

  const handleSettlementEmployeeToggle = useCallback((employeeId) => {
    if (activeSettlementRequest) return
    setSelectedSettlementEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    )
  }, [activeSettlementRequest])

  const allSettlementEmployeesSelected =
    !activeSettlementRequest &&
    settlementEligibleEmployees.length > 0 &&
    settlementEligibleEmployees.every((employee) => selectedSettlementEmployeeIds.includes(employee.id))

  const handleToggleAllSettlementEmployees = useCallback(() => {
    if (activeSettlementRequest) return
    setSelectedSettlementEmployeeIds((prev) => {
      const allIds = settlementEligibleEmployees.map((employee) => employee.id)
      const areAllSelected = allIds.length > 0 && allIds.every((id) => prev.includes(id))
      return areAllSelected ? [] : allIds
    })
  }, [activeSettlementRequest, settlementEligibleEmployees])

  const resetSettlementRequestForm = useCallback(() => {
    setSelectedRequestAgentName('')
    setSelectedRequestEmployeeIds([])
    setRequestRemark('')
    setRequestError('')
  }, [])

  const openRequestModal = useCallback(() => {
    resetSettlementRequestForm()
    setRequestModalOpen(true)
  }, [resetSettlementRequestForm])

  const closeRequestModal = useCallback(() => {
    setRequestModalOpen(false)
    resetSettlementRequestForm()
  }, [resetSettlementRequestForm])

  const handleSelectRequestAgent = useCallback((agentName) => {
    setSelectedRequestAgentName(agentName)
    setSelectedRequestEmployeeIds([])
  }, [])

  const handleSettlementRequestEmployeeToggle = useCallback((employeeId) => {
    setSelectedRequestEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    )
  }, [])

  const handleCreateSettlementRequest = useCallback(async () => {
    if (!selectedRequestGroup) {
      setRequestError('Choose the responsible agent first.')
      return
    }

    if (selectedRequestEmployeeIds.length === 0) {
      setRequestError('Select at least one employee for the settlement request.')
      return
    }

    setRequestSaving(true)
    setRequestError('')
    try {
      const selectedEmployees = selectedRequestGroup.employees.filter((employee) => selectedRequestEmployeeIds.includes(employee.id))
      const requestRecord = {
        id: `settlement-request-${Date.now()}`,
        status: 'pending',
        agentId: selectedRequestGroup.agentId,
        agentName: selectedRequestGroup.agentName,
        agentUsername: selectedRequestGroup.agentUsername,
        agentEmail: selectedRequestGroup.agentEmail,
        employeeIds: selectedEmployees.map((employee) => employee.id),
        employees: selectedEmployees.map(buildEmployeeSettlementSnapshot),
        requestedAt: new Date().toISOString(),
        requestedById: user?.id || null,
        requestedByName: displayActorName(user),
        note: requestRemark.trim()
      }

      const nextRequests = [requestRecord, ...settlementRequests]
      persistSettlementRequests(nextRequests)
      closeRequestModal()
      setCurrentView('requests')
      showToast('Settlement request created successfully.', { tone: 'success' })
    } catch (err) {
      setRequestError(err.message || 'Could not create settlement request')
      showToast(err.message || 'Could not create settlement request', { tone: 'danger', title: 'Action failed' })
    } finally {
      setRequestSaving(false)
    }
  }, [
    closeRequestModal,
    persistSettlementRequests,
    requestRemark,
    selectedRequestEmployeeIds,
    selectedRequestGroup,
    settlementRequests,
    showToast,
    user
  ])

  const handleCancelSettlementRequest = useCallback((request) => {
    const nextRequests = settlementRequests.map((item) =>
      item.id === request.id
        ? {
            ...item,
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledById: user?.id || null,
            cancelledByName: displayActorName(user)
          }
        : item
    )

    persistSettlementRequests(
      isAgentSideUser
        ? nextRequests.filter((item) => requestBelongsToAgent(item, user))
        : nextRequests
    )
    showToast('Settlement request cancelled.', { tone: 'success' })
  }, [isAgentSideUser, persistSettlementRequests, settlementRequests, showToast, user])

  const handleAcknowledgeSettlementRequest = useCallback((request) => {
    const nextRequests = settlementRequests.map((item) =>
      item.id === request.id
        ? {
            ...item,
            status: 'acknowledged',
            acknowledgedAt: new Date().toISOString(),
            acknowledgedById: user?.id || null,
            acknowledgedByName: displayActorName(user)
          }
        : item
    )

    persistSettlementRequests(nextRequests)
    showToast('Settlement acknowledged successfully.', { tone: 'success' })
  }, [persistSettlementRequests, settlementRequests, showToast, user])

  const handleRegisterSettlement = useCallback(async () => {
    if (selectedSettlementEmployeeIds.length === 0) {
      setSettlementError('Select at least one employee to register this payment.')
      return
    }

    if (!settlementReceiptFiles.some(Boolean) && !(editingSettlementRecord?.receipts || []).length) {
      setSettlementError('Attach at least one bank receipt before submitting this payment.')
      return
    }

      const selectedEmployees = settlementEligibleEmployees.filter((employee) => selectedSettlementEmployeeIds.includes(employee.id))
      if (selectedEmployees.length === 0) {
        setSettlementError('No eligible employees are currently available for this payment.')
        return
      }
      const parsedSettlementAmount = settlementAmount === '' ? null : Number(settlementAmount)
      if (settlementAmount === '' || Number.isNaN(parsedSettlementAmount) || parsedSettlementAmount < 0) {
        setSettlementError('Enter a valid settlement amount before submitting this payment.')
        return
      }

    setSettlementSaving(true)
    setSettlementError('')
    try {
      const fallbackRate = numericCommissionRate(user?.agent_commission || user?.profile?.agent_commission)
      const agentName = selectedEmployees[0] ? agentNameForEmployee(selectedEmployees[0]) : currentAgentDisplayName
      const effectiveRate = agentRateLookup[agentName] ?? fallbackRate ?? null
      const pickedReceiptFiles = settlementReceiptFiles.filter(Boolean)
      const receipts = pickedReceiptFiles.length > 0
        ? await Promise.all(
            pickedReceiptFiles.map(async (file, index) => ({
              id: `${Date.now()}-receipt-${index}`,
              label: file.name,
              note: 'Bank receipt attachment',
              name: file.name,
              mimeType: file.type || '',
              dataUrl: await readFileAsDataUrl(file)
            }))
          )
        : (editingSettlementRecord?.receipts || [])

      const settlementRecord = {
        id: editingSettlementRecord?.id || `settlement-${Date.now()}`,
        ownerKey,
        agentName,
        employeeIds: selectedEmployees.map((employee) => employee.id),
        employees: selectedEmployees.map(buildEmployeeSettlementSnapshot),
        rate: effectiveRate,
        totalCommissionValue: parsedSettlementAmount,
        settledAt: new Date().toISOString().slice(0, 10),
        createdAt: editingSettlementRecord?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        receipts
      }

      const nextSettlements = editingSettlementRecord
        ? settlements.map((item) => (item.id === editingSettlementRecord.id ? settlementRecord : item))
        : [...settlements, settlementRecord]
      persistSettlements(nextSettlements)
      if (activeSettlementRequest) {
        const nextRequests = settlementRequests.map((request) =>
          request.id === activeSettlementRequest.id
            ? {
                ...request,
                status: 'settled',
                settledAt: settlementRecord.settledAt,
                settlementId: settlementRecord.id,
                employees: (request.employees || []).map((employee) => ({
                  ...employee,
                  settled_commission: true
                }))
              }
            : request
        )
        persistSettlementRequests(
          isAgentSideUser
            ? nextRequests.filter((request) => requestBelongsToAgent(request, user))
            : nextRequests
        )
      }
      setCurrentView('settled')
      setOpenSettledGroups((prev) => ({ ...prev, [settlementRecord.id]: true }))
      setOpenSettlementEmployees((prev) => ({ ...prev, [settlementRecord.id]: false }))
      closeSettlementModal()
      showToast(
        editingSettlementRecord
          ? 'Payment updated successfully.'
          : activeSettlementRequest
            ? 'Payment request settled successfully.'
            : 'Payment registered successfully.',
        { tone: 'success' }
      )
    } catch (err) {
      const message = err.message || 'Could not save this payment'
      setSettlementError(message)
      showToast(message, { tone: 'danger', title: 'Action failed' })
    } finally {
      setSettlementSaving(false)
    }
  }, [
    editingSettlementRecord,
    agentRateLookup,
    closeSettlementModal,
    currentAgentDisplayName,
    ownerKey,
    persistSettlements,
    selectedSettlementEmployeeIds,
    settlementAmount,
    settlementDate,
    settlementReceiptFiles,
    settlements,
    showToast,
    settlementEligibleEmployees,
    settlementRequests,
    activeSettlementRequest,
    persistSettlementRequests,
    isAgentSideUser,
    user
  ])

  const closeReceiptPreview = useCallback(() => {
    setPreviewReceipt(null)
  }, [])

  if (!canManageEmployees) return <Navigate to="/dashboard" replace />

  return (
    <section className="dashboard-panel commissions-page">
      <div className="users-management-header">
        <div>
          <h1>Commissions</h1>
          <p className="muted-text">
            {currentView === 'settled'
              ? isAgentSideUser
                ? 'This board tracks commission payments your agent side has already settled to the organization, together with the covered employees and receipt attachments.'
                : 'This board tracks commission collections already received by the organization from the agent side, including the grouped employees, settled amount, and attached bank receipts.'
              : currentView === 'collected'
              ? 'This tab evaluates commission collections already received by the organization across time so you can see the collection rhythm and value movement.'
              : currentView === 'requests'
              ? isAgentSideUser
                ? 'Payment requests tell your agent side which employee commissions the organization is asking you to pay, then let you settle that request with receipts.'
                : 'Collection requests let the organization ask the responsible agent to settle commission for specific employed employees, then let the agent complete that request with receipts.'
              : currentView === 'agents'
              ? 'This tab tracks configured agent commission rates together with their current unpaid exposure to the organization.'
              : isAgentSideUser
                ? 'This board tracks employed employees whose commission your agent side still owes to the organization.'
                : 'This board tracks employed employees whose commission is still outstanding from the responsible agent side to the organization.'}
          </p>
          <p className="muted-text">
            {currentView === 'collected'
              ? 'The timeline uses registered settlement records already captured in the system and summarizes recent collection windows.'
              : currentView === 'requests'
              ? canCreateSettlementRequests
                ? 'Create a request from the organization side by selecting unsettled employed employees that belong to one responsible agent.'
                : 'Review the payment requests assigned to your agent side and settle them directly from the request when receipts are ready.'
              : canRegisterSettlements
              ? 'Payment registration is available only for your own employed employees whose commission your agent side must pay.'
              : 'Payment registration is handled from the payer side and appears here to the organization as a collection ledger.'}
          </p>
        </div>
      </div>

      <div className="employee-subtabs" role="tablist" aria-label="Commission views">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-subtab${currentView === tab.id ? ' is-active' : ''}`}
            onClick={() => setCurrentView(tab.id)}
            aria-pressed={currentView === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="concept-summary-strip">
        <div className="concept-summary-pill">
          <strong>{summaryDisplay.firstLabel}</strong>
          <span>{summaryDisplay.firstValue}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>{summaryDisplay.secondLabel}</strong>
          <span>{summaryDisplay.secondValue}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>{summaryDisplay.thirdLabel}</strong>
          <span>{summaryDisplay.thirdValue}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>{summaryDisplay.fourthLabel}</strong>
          <span>{summaryDisplay.fourthValue}</span>
        </div>
      </div>

      <div className="commission-toolbar">
        <label className="commission-search">
          Search {currentView === 'requests' ? (isAgentSideUser ? 'payment requests' : 'collection requests') : currentView === 'agents' ? 'agents' : currentView === 'collected' ? 'collection analytics' : 'commission cases'}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={currentView === 'requests' ? 'Agent, employee, requester, passport' : currentView === 'agents' ? 'Agent, country, email' : currentView === 'collected' ? 'Agent, employee, receipt' : 'Employee, agent, passport, profession'}
          />
        </label>
        <div className="employees-header-actions">
          {currentView === 'requests' && canCreateSettlementRequests ? (
            <button type="button" className="btn-warning" onClick={openRequestModal}>
              Create collection request
            </button>
          ) : null}
          {currentView === 'unsettled' && canRegisterSettlements ? (
            <button type="button" className="btn-warning" onClick={() => openSettlementModal()}>
              Register payment
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={loadCommissionBoard} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {currentView === 'agents' ? (
        <section className="concept-section">
          <h2>Configured agent commission rates</h2>
          {agentRates.length === 0 ? (
            <p className="muted-text">No agent commission profiles found for this scope.</p>
          ) : (
            <div className="commission-agents-list">
              {agentRates.map((agent) => {
                const unsettledCases = agentSettlementMetrics[displayAgentName(agent)] || 0
                const settlementCount = agentSettlementCounts[displayAgentName(agent)] || 0
                const activityBase = unsettledCases + settlementCount
                const activityRate = activityBase > 0 ? Math.round((settlementCount / activityBase) * 100) : 0
                const configuredRate = numericCommissionRate(agent.agent_commission)
                const configuredRateValue = configuredRate === null ? 0 : Math.min(Math.max(configuredRate, 0), 100)
                const unsettledValue = Math.round((unsettledCases / maxUnsettledCases) * 100)
                const score = Math.round((activityRate * 0.7) + ((100 - unsettledValue) * 0.3))
                const scoreTone =
                  score >= 75 ? 'is-strong'
                    : score >= 45 ? 'is-balanced'
                      : 'is-watch'

                const unsettledExposure = configuredRate === null ? null : configuredRate * unsettledCases

                return (
                  <article key={agent.id} className="commission-agent-card">
                    <div className="commission-agent-card-main">
                      <p className="commission-agent-card-kicker">Agent profile</p>
                      <div className="commission-agent-card-heading">
                        <h3>{displayAgentName(agent)}</h3>
                        <span className="badge badge-muted">
                          {agent.username ? `@${agent.username}` : 'Username missing'}
                        </span>
                      </div>
                      <div className="commission-agent-card-meta">
                        <span>{agent.agent_country || 'Country --'}</span>
                        <span>{agent.email || 'Email missing'}</span>
                      </div>
                      <p className="muted-text commission-agent-card-description">
                        Tracks current commission exposure, registered settlements, and the configured collection rate for this agent.
                      </p>
                    </div>

                    <div className="commission-agent-card-stats">
                      <div className="commission-agent-stat">
                        <strong>{agent.agent_commission ?? '--'}</strong>
                        <span>Configured rate</span>
                      </div>
                      <div className="commission-agent-stat">
                        <strong>{unsettledCases}</strong>
                        <span>Unsettled cases</span>
                      </div>
                      <div className="commission-agent-stat">
                        <strong>{settlementCount}</strong>
                        <span>Settlements</span>
                      </div>
                      <div className="commission-agent-stat">
                        <strong>{formatCurrency(unsettledExposure)}</strong>
                        <span>Open exposure</span>
                      </div>
                    </div>

                    <div className="commission-agent-card-graph commission-rate-graph-wrap">
                      <div className="commission-rate-graph" aria-label={`Commission overview for ${displayAgentName(agent)}`}>
                        <div className="commission-rate-graph-row">
                          <span className="commission-rate-graph-label">Rate</span>
                          <div className="commission-rate-graph-bar">
                            <span className="commission-rate-graph-fill commission-rate-graph-fill--rate" style={{ width: `${configuredRateValue}%` }} />
                          </div>
                          <span className="commission-rate-graph-value">{agent.agent_commission ?? '--'}</span>
                        </div>
                        <div className="commission-rate-graph-row">
                          <span className="commission-rate-graph-label">Cases</span>
                          <div className="commission-rate-graph-bar">
                            <span className="commission-rate-graph-fill commission-rate-graph-fill--cases" style={{ width: `${unsettledValue}%` }} />
                          </div>
                          <span className="commission-rate-graph-value">{unsettledCases}</span>
                        </div>
                        <div className="commission-rate-graph-row">
                          <span className="commission-rate-graph-label">Settled</span>
                          <div className="commission-rate-graph-bar">
                            <span className="commission-rate-graph-fill commission-rate-graph-fill--activity" style={{ width: `${activityRate}%` }} />
                          </div>
                          <span className="commission-rate-graph-value">{activityRate}%</span>
                        </div>
                      </div>
                      <div className="commission-rate-popover">
                        <p className="muted-text">Configured rate: {agent.agent_commission ?? '--'}</p>
                        <p className="muted-text">Unsettled cases: {unsettledCases}</p>
                        <p className="muted-text">Settlement activity rate: {activityRate}%</p>
                        <p className="muted-text">Settlements registered: {settlementCount}</p>
                      </div>
                    </div>

                    <div className={`commission-agent-card-score ${scoreTone}`} aria-label={`Agent score ${score} out of 100`}>
                      <span className="commission-agent-card-score-label">Score</span>
                      <strong>{score}</strong>
                      <span className="commission-agent-card-score-note">
                        {score >= 75 ? 'Strong' : score >= 45 ? 'Balanced' : 'Needs follow-up'}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {currentView === 'requests' ? (
        <section className="concept-section">
          <h2>{isAgentSideUser ? 'Payment request board' : 'Collection request board'}</h2>
          {loading ? (
            <p className="muted-text">Loading {isAgentSideUser ? 'payment' : 'collection'} requests...</p>
          ) : visibleSettlementRequests.length === 0 ? (
            <p className="muted-text">
              {canCreateSettlementRequests
                ? 'No collection requests have been logged yet for this organization.'
                : 'No payment requests are currently assigned to your agent side.'}
            </p>
          ) : (
            <div className="commission-request-list">
              {visibleSettlementRequests.map((request) => {
                const isPending = request.status === 'pending'
                const isAwaitingAcknowledgement = request.status === 'settled'
                const canSettleRequest = isPending && canRegisterSettlements && requestBelongsToAgent(request, user)
                const canCancelRequest = isPending && canCreateSettlementRequests
                const canAcknowledgeRequest = isAwaitingAcknowledgement && canCreateSettlementRequests
                const canModifySettledRequest = isAwaitingAcknowledgement && canRegisterSettlements && requestBelongsToAgent(request, user)
                return (
                  <article key={request.id} className="commission-request-card">
                    <div className="commission-request-card-header">
                      <div>
                        <p className="commission-agent-card-kicker">{isAgentSideUser ? 'Payment request' : 'Collection request'}</p>
                        <h3>{request.agentName || 'Unassigned agent'}</h3>
                        <p className="muted-text">
                          {(request.employees?.length || 0)} employee{request.employees?.length === 1 ? '' : 's'} | Requested {formatDateTime(request.requestedAt)}
                        </p>
                        <p className="muted-text">
                          Requested by {request.requestedByName || '--'}
                          {request.note ? ` | ${request.note}` : ''}
                        </p>
                      </div>
                      <div className="commission-request-card-actions">
                        <span className={`badge ${isPending ? 'badge-warning' : request.status === 'cancelled' ? 'badge-muted' : 'badge-success'}`}>
                          {isPending
                            ? (isAgentSideUser ? 'Pending payment' : 'Pending collection')
                            : request.status === 'cancelled'
                              ? 'Cancelled'
                              : isAgentSideUser
                                ? 'Awaiting acknowledgment'
                                : 'Verify settlement'}
                        </span>
                        {canSettleRequest ? (
                          <button type="button" className="btn-warning" onClick={() => openSettlementModal(request)}>
                            Settle payment
                          </button>
                        ) : null}
                        {canModifySettledRequest ? (
                          <button type="button" className="btn-secondary" onClick={() => openSettlementModal(request)}>
                            Modify payment
                          </button>
                        ) : null}
                        {canAcknowledgeRequest ? (
                          <button type="button" className="btn-warning" onClick={() => handleAcknowledgeSettlementRequest(request)}>
                            Acknowledge settlement
                          </button>
                        ) : null}
                        {canCancelRequest ? (
                          <button type="button" className="btn-secondary" onClick={() => handleCancelSettlementRequest(request)}>
                            Cancel request
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="commission-request-employee-list">
                      {(request.employees || []).map((employee) => (
                        <button
                          key={employee.id}
                          type="button"
                          className="commission-request-employee-item"
                          onClick={() => setOpenedEmployee(employee)}
                        >
                          <span>
                            <strong>{employee.full_name}</strong>
                            <span className="commission-request-employee-meta">
                              {employee.profession || employee.professional_title || '--'} | Passport {employee.passport_number || '--'}
                            </span>
                          </span>
                          <span className="commission-request-employee-state">
                            {request.status === 'settled'
                              ? isAgentSideUser
                                ? 'Paid, awaiting acknowledgment'
                                : 'Awaiting organization verification'
                              : isAgentSideUser
                                ? 'Awaiting payment'
                                : 'Requested'}
                          </span>
                        </button>
                      ))}
                    </div>

                    {request.settlementId ? (
                      <p className="muted-text commission-request-card-footer">
                        {canCreateSettlementRequests
                          ? `Paid on ${formatDateTime(request.settledAt)} under settlement ${request.settlementId}. Acknowledge it to close this request.`
                          : `Paid on ${formatDateTime(request.settledAt)} under settlement ${request.settlementId}. Waiting for organization acknowledgment.`}
                      </p>
                    ) : request.status === 'cancelled' ? (
                      <p className="muted-text commission-request-card-footer">
                        Cancelled on {formatDateTime(request.cancelledAt)} by {request.cancelledByName || '--'}.
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {currentView === 'collected' ? (
        <section className="concept-section">
          <h2>Collected commission timeline</h2>
          {loading ? (
            <p className="muted-text">Loading collected commissions...</p>
          ) : collectedTimeline.length === 0 ? (
            <p className="muted-text">No settled commission records are available yet to build a timeline.</p>
          ) : (
            <div className="commission-timeline-card">
              <div className="commission-timeline-header">
                <div>
                  <p className="commission-agent-card-kicker">Timeline window</p>
                  <h3>Recent collection movement</h3>
                  <p className="muted-text">
                    Each row represents one {collectedRange === 'weekly' ? 'week' : collectedRange === 'monthly' ? 'month' : collectedRange === 'quarterly' ? 'quarter' : 'year'}
                    {' '}and the total collected commission logged in that range.
                  </p>
                </div>
                {collectedDrilldown ? (
                  <div className="commission-collected-breadcrumb">
                    <p className="muted-text">
                      {collectedDrilldown.type === 'year'
                        ? `Viewing monthly breakdown for ${collectedDrilldown.year}`
                        : `Viewing weekly breakdown for ${new Date(collectedDrilldown.year, collectedDrilldown.monthIndex, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}
                    </p>
                    <button type="button" className="btn-secondary" onClick={handleCollectedDrilldownBack}>
                      Back
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="employee-subtabs commission-range-tabs" role="tablist" aria-label="Collected commission ranges">
                {COLLECTED_RANGE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`employee-subtab${collectedRange === tab.id ? ' is-active' : ''}`}
                    onClick={() => handleCollectedRangeChange(tab.id)}
                    aria-pressed={collectedRange === tab.id}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {collectedChartModel ? (
                <div className="commission-chart-card">
                  <div className="commission-chart-surface">
                    <svg
                      className="commission-chart-svg"
                      viewBox={`0 0 ${collectedChartModel.width} ${collectedChartModel.height}`}
                      role="img"
                      aria-label={`Collected commission ${collectedRange} chart`}
                    >
                      {collectedChartModel.gridLines.map((line) => (
                        <g key={line.y}>
                          <line
                            x1="20"
                            y1={line.y}
                            x2={collectedChartModel.width - 20}
                            y2={line.y}
                            className="commission-chart-grid-line"
                          />
                          <text x="24" y={line.y - 6} className="commission-chart-grid-label">
                            {line.value}
                          </text>
                        </g>
                      ))}

                      {collectedChartModel.points.map((point) => (
                        <line
                          key={`${point.key}-vertical-guide`}
                          x1={point.x}
                          y1="20"
                          x2={point.x}
                          y2={collectedChartModel.baselineY}
                          className="commission-chart-vertical-guide"
                        />
                      ))}

                      <path d={collectedChartModel.linePath} className="commission-chart-line" />

                      {collectedChartModel.points.map((point, index) => (
                        <g
                          key={point.key}
                          className="commission-chart-node"
                          onMouseEnter={(event) => handleCollectedPointHover(event, point, collectedChartModel)}
                          onMouseMove={(event) => handleCollectedPointHover(event, point, collectedChartModel)}
                          onMouseLeave={() => setHoveredCollectedPoint(null)}
                        >
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="4"
                            className={`commission-chart-point${hoveredCollectedPoint?.key === point.key ? ' is-active' : ''}`}
                          />
                          {(
                            collectedRange !== 'weekly' ||
                            index % 4 === 0 ||
                            index === collectedChartModel.points.length - 1
                          ) ? (
                            <text x={point.x} y={collectedChartModel.baselineY + 24} textAnchor="middle" className="commission-chart-axis-label">
                              {point.label}
                            </text>
                          ) : null}
                        </g>
                      ))}

                      {hoveredCollectedPoint ? (
                        <g className="commission-chart-tooltip" transform={`translate(${hoveredCollectedPoint.tooltipX ?? hoveredCollectedPoint.x}, ${hoveredCollectedPoint.tooltipY ?? hoveredCollectedPoint.y})`}>
                          <rect width="188" height="76" rx="3" className="commission-chart-tooltip-box" />
                          <text x="12" y="16" className="commission-chart-tooltip-title">{hoveredCollectedPoint.label}</text>
                          <text x="12" y="29" className="commission-chart-tooltip-text">{formatCurrency(hoveredCollectedPoint.amount)}</text>
                          <text x="12" y="41" className="commission-chart-tooltip-text">
                            {hoveredCollectedPoint.settlements} settlement{hoveredCollectedPoint.settlements === 1 ? '' : 's'}
                          </text>
                          {(() => {
                            const agentNames = (hoveredCollectedPoint.agentNames || []).length
                              ? hoveredCollectedPoint.agentNames
                              : ['Unknown agent']
                            const firstLine = agentNames.slice(0, 2).join(', ')
                            const secondLine = agentNames.slice(2).join(', ')
                            return (
                              <>
                                <text x="12" y="53" className="commission-chart-tooltip-text">{firstLine}</text>
                                {secondLine ? (
                                  <text x="12" y="65" className="commission-chart-tooltip-text">{secondLine}</text>
                                ) : null}
                              </>
                            )
                          })()}
                        </g>
                      ) : null}
                    </svg>
                  </div>

                  <div className="commission-chart-detail-filter">
                    <label className="commission-search">
                      Timeline scope
                      <select
                        value={selectedCollectedScope}
                        onChange={(event) => handleCollectedScopeChange(event.target.value)}
                      >
                        {collectedScopeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="commission-search">
                      Period
                      <select
                        value={collectedDetailLabelFilter}
                        onChange={(event) => setCollectedDetailLabelFilter(event.target.value)}
                      >
                        {collectedDetailLabelOptions.map((option) => (
                          <option key={option} value={option}>
                            {option === 'all' ? 'All periods' : option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="commission-search">
                      Agent
                      <select
                        value={collectedDetailAgentFilter}
                        onChange={(event) => setCollectedDetailAgentFilter(event.target.value)}
                      >
                        {collectedDetailAgentOptions.map((option) => (
                          <option key={option} value={option}>
                            {option === 'all' ? 'All agents' : option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setCollectedDetailLabelFilter('all')
                        setCollectedDetailAgentFilter('all')
                      }}
                      disabled={collectedDetailLabelFilter === 'all' && collectedDetailAgentFilter === 'all'}
                    >
                      Reset filter
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleCollectedDrilldownBack}
                      disabled={!collectedDrilldown}
                      aria-label="Return to parent"
                      title="Return to parent"
                    >
                      ↩
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handlePrintCollectedReport}
                    >
                      Download PDF
                    </button>
                  </div>

                  <div className="commission-chart-details">
                    {filteredCollectedTimelineDetails.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className={`commission-timeline-item${collectedRange === 'yearly' || collectedRange === 'monthly' ? ' is-drillable' : ''}`}
                        onClick={() => handleCollectedEntryDrilldown(entry)}
                        disabled={!(collectedRange === 'yearly' || collectedRange === 'monthly')}
                      >
                        <div className="commission-timeline-meta">
                          <strong>{entry.label}</strong>
                          <span>{entry.settlements} settlement{entry.settlements === 1 ? '' : 's'} | {entry.employees} employee{entry.employees === 1 ? '' : 's'}</span>
                          <span>Started {formatDateOnly(entry.firstDate)}</span>
                        </div>
                        <strong className="commission-timeline-value">{formatCurrency(entry.amount)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {currentView !== 'agents' && currentView !== 'requests' && currentView !== 'collected' ? (
      <section className="concept-section">
        <h2>
          {currentView === 'settled'
            ? isAgentSideUser
              ? 'Settled payment board'
              : 'Collected commission board'
            : isAgentSideUser
              ? 'Outstanding payment board'
              : 'Pending collection board'}
        </h2>
        {loading ? (
          <p className="muted-text">Loading commission cases...</p>
        ) : currentView === 'settled' ? (
          settledSettlements.length === 0 ? (
            <p className="muted-text">
              {isAgentSideUser
                ? 'No settled commission payments found for your agent side yet.'
                : 'No collected commission payments have been logged for this scope yet.'}
            </p>
          ) : (
            <div className="commission-group-list">
              {settledSettlements.map((settlement) => (
                <section key={settlement.id} className="commission-group">
                  <div className="commission-group-header">
                    <div>
                      <h3>{settlement.agentName}</h3>
                      <p className="muted-text">
                        {settlement.employees.length} settled employee{settlement.employees.length === 1 ? '' : 's'} | Settled amount {formatCurrency(settlement.totalCommissionValue)}
                      </p>
                      <p className="muted-text">
                        Settlement date: {formatDateTime(settlement.settledAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="commission-group-toggle-button"
                      onClick={() => toggleSettledGroup(settlement.id)}
                      aria-label={openSettledGroups[settlement.id] ? 'Collapse settlement' : 'Expand settlement'}
                      aria-expanded={Boolean(openSettledGroups[settlement.id])}
                    >
                      <span className={`commission-group-toggle-icon${openSettledGroups[settlement.id] ? ' is-open' : ''}`}>▸</span>
                    </button>
                  </div>

                  {openSettledGroups[settlement.id] ? (
                  <div className="commission-settlement-surface">
                    <div className="commission-settlement-meta">
                      <div className="concept-summary-pill">
                        <strong>Settlement value</strong>
                        <span>{formatCurrency(settlement.totalCommissionValue)}</span>
                      </div>
                      <div className="concept-summary-pill">
                        <strong>Configured rate</strong>
                        <span>{settlement.rate === null || settlement.rate === undefined ? '--' : formatCurrency(settlement.rate)}</span>
                      </div>
                      <div className="concept-summary-pill">
                        <strong>Settled at</strong>
                        <span>{formatDateTime(settlement.settledAt)}</span>
                      </div>
                    </div>

                    <div className="commission-settlement-grid">
                      <div className="commission-settlement-card">
                        <h4>Employees</h4>
                        <div className="commission-settlement-employees">
                          <div className="commission-settlement-employees-toggle">
                            <span>{settlement.employees.length} employee{settlement.employees.length === 1 ? '' : 's'}</span>
                            <button
                              type="button"
                              className="commission-group-toggle-button"
                              onClick={() => toggleSettlementEmployees(settlement.id)}
                              aria-label={openSettlementEmployees[settlement.id] ? 'Collapse employees' : 'Expand employees'}
                              aria-expanded={Boolean(openSettlementEmployees[settlement.id])}
                            >
                              <span className={`commission-group-toggle-icon${openSettlementEmployees[settlement.id] ? ' is-open' : ''}`}>▸</span>
                            </button>
                          </div>
                          {openSettlementEmployees[settlement.id] ? (
                          <div className="commission-settlement-employee-list">
                            {settlement.employees.map((employee) => (
                              <article key={employee.id} className="commission-case-card">
                                <div className="commission-case-topline">
                                  <div>
                                    <strong>{employee.full_name}</strong>
                                    <p className="muted-text">{employee.profession || employee.professional_title || '--'}</p>
                                  </div>
                                  <span className="badge badge-muted commission-settled-badge">{settledCommissionStatus(employee)}</span>
                                </div>
                                <div className="commission-case-meta">
                                  <span><strong>Travel:</strong> {prettyStatus(employee.travel_status, 'pending')}</span>
                                  <span><strong>Return:</strong> {prettyStatus(employee.return_status)}</span>
                                  <span><strong>Commission rate:</strong> {settlement.rate === null || settlement.rate === undefined ? '--' : formatCurrency(settlement.rate)}</span>
                                </div>
                                <div className="employee-card-detail-links" style={{ marginTop: 12 }}>
                                  <button type="button" className="btn-secondary" onClick={() => setOpenedEmployee(employee)}>
                                    View employee details
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="commission-settlement-card">
                        <h4>Bank receipts</h4>
                        {settlement.receipts.length === 0 ? (
                          <p className="muted-text">No receipt attachments mapped yet for this settlement.</p>
                        ) : (
                          <div className="commission-receipt-list">
                            {settlement.receipts.map((receipt) => (
                              <div key={receipt.id} className="commission-receipt-item">
                                <div className="commission-receipt-icon">RC</div>
                                <div>
                                  {receipt.dataUrl && settlementReceiptKind(receipt) === 'image' ? (
                                    <button
                                      type="button"
                                      className="commission-receipt-link link-button"
                                      onClick={() => setPreviewReceipt(receipt)}
                                    >
                                      {receipt.label}
                                    </button>
                                  ) : receipt.dataUrl ? (
                                    <a href={receipt.dataUrl} download={receipt.name || receipt.label} className="commission-receipt-link">
                                      {receipt.label}
                                    </a>
                                  ) : (
                                    <strong>{receipt.label}</strong>
                                  )}
                                  <p className="muted-text">{receipt.note}</p>
                                  <p className="muted-text">Type: {prettyStatus(settlementReceiptKind(receipt))}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  ) : null}
                </section>
              ))}
            </div>
          )
        ) : casesByAgent.length === 0 ? (
          <p className="muted-text">
            {isAgentSideUser
              ? 'No outstanding commission payments are currently due from your agent side.'
              : 'No pending commission collections are currently outstanding for this scope.'}
          </p>
        ) : (
          <div className="commission-group-list">
            {casesByAgent.map((group) => (
              <section key={group.agentName} className="commission-group">
                <div className="commission-group-header">
                  <div>
                    <h3>{group.agentName}</h3>
                    <p className="muted-text">
                      {group.employees.length} unsettled case{group.employees.length === 1 ? '' : 's'}
                    </p>
                    <p className="muted-text">
                      Starting from: {formatDateTime(group.startingFrom)} | Passed {timePassedLabel(group.startingFrom)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="commission-group-toggle-button"
                    onClick={() => toggleUnsettledGroup(group.agentName)}
                    aria-label={openUnsettledGroups[group.agentName] ? 'Collapse commission group' : 'Expand commission group'}
                    aria-expanded={Boolean(openUnsettledGroups[group.agentName])}
                  >
                    <span className={`commission-group-toggle-icon${openUnsettledGroups[group.agentName] ? ' is-open' : ''}`}>▸</span>
                  </button>
                </div>

                {openUnsettledGroups[group.agentName] ? (
                <div className="commission-case-list">
                  {group.employees.map((employee) => (
                    <article key={employee.id} className="commission-case-card">
                      <div className="commission-case-topline">
                        <div>
                          <strong>{employee.full_name}</strong>
                          <p className="muted-text">{employee.profession || employee.professional_title || '--'}</p>
                        </div>
                        <span className={`badge ${employee?.settled_commission ? 'badge-muted commission-settled-badge' : 'badge-warning'}`.trim()}>
                          {commissionStatus(employee)}
                        </span>
                      </div>

                      <div className="commission-case-meta">
                        <span><strong>Employment:</strong> {employmentStage(employee)}</span>
                        <span><strong>Travel:</strong> {prettyStatus(employee.travel_status, 'pending')}</span>
                        <span><strong>Return:</strong> {prettyStatus(employee.return_status)}</span>
                        <span><strong>Last movement:</strong> {formatDateTime(employeeMovementDate(employee))}</span>
                      </div>

                      <div className="employee-card-detail-links" style={{ marginTop: 12 }}>
                        <button type="button" className="btn-secondary" onClick={() => setOpenedEmployee(employee)}>
                          View employee details
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {openedEmployee ? (
        <div className="employee-review-backdrop" role="presentation" onClick={() => setOpenedEmployee(null)}>
          <div className="employee-review-modal" role="dialog" aria-modal="true" aria-labelledby="commission-employee-title" onClick={(event) => event.stopPropagation()}>
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">Commission case</p>
                <h2 id="commission-employee-title">{openedEmployee.full_name}</h2>
                <p className="muted-text">{openedEmployee.profession || openedEmployee.professional_title || '--'} | {employmentStage(openedEmployee)}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary" onClick={() => setExpandedEmployee(openedEmployee)}>
                  Open employee details
                </button>
                <button type="button" className="btn-secondary" onClick={() => setOpenedEmployee(null)}>Close</button>
              </div>
            </div>
            <div className="employee-review-grid">
              <div className="employee-summary-card">
                <h3>Commission</h3>
                <p><strong>Status:</strong> {currentView === 'settled' ? settledCommissionStatus(openedEmployee) : commissionStatus(openedEmployee)}</p>
                <p className="muted-text">Collection from the agent side to the organization is a future settlement concept.</p>
              </div>
              <div className="employee-summary-card">
                <h3>Movement</h3>
                <p><strong>Travel:</strong> {prettyStatus(openedEmployee.travel_status, 'pending')}</p>
                <p><strong>Return:</strong> {prettyStatus(openedEmployee.return_status)}</p>
                <p><strong>Last movement:</strong> {formatDateTime(employeeMovementDate(openedEmployee))}</p>
              </div>
              <div className="employee-summary-card">
                <h3>Employee</h3>
                <p><strong>Passport:</strong> {openedEmployee.passport_number || '--'}</p>
                <p><strong>Mobile:</strong> {openedEmployee.mobile_number || '--'}</p>
                <p><strong>Agent side:</strong> {agentNameForEmployee(openedEmployee)}</p>
              </div>
              <div className="employee-summary-card">
                <h3>Last return request</h3>
                {openedEmployee.return_request ? (
                  <>
                    <p><strong>Status:</strong> {prettyStatus(openedEmployee.return_request.status)}</p>
                    <p><strong>Remark:</strong> {openedEmployee.return_request.remark || '--'}</p>
                    <p><strong>Requested by:</strong> {openedEmployee.return_request.requested_by_username || '--'}</p>
                    <p><strong>Requested at:</strong> {formatDateTime(openedEmployee.return_request.requested_at)}</p>
                  </>
                ) : (
                  <p>None</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {expandedEmployee ? (
        <div className="employee-review-backdrop" role="presentation" onClick={() => setExpandedEmployee(null)}>
          <div
            className="employee-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commission-expanded-employee-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <div className="employee-card-identity">
                <div className="employee-review-avatar employee-card-avatar">
                  {employeeProfilePhoto(expandedEmployee)?.file_url && isImageDocument(employeeProfilePhoto(expandedEmployee)) ? (
                    <img src={employeeProfilePhoto(expandedEmployee).file_url} alt={`${expandedEmployee.full_name} profile`} />
                  ) : (
                    <span>{expandedEmployee.full_name?.charAt(0) || '?'}</span>
                  )}
                </div>
                <div>
                  <p className="employee-modal-eyebrow">Employee details</p>
                  <h2 id="commission-expanded-employee-title">{expandedEmployee.full_name}</h2>
                  <p className="muted-text">{expandedEmployee.profession || expandedEmployee.professional_title || '--'} | {employmentStage(expandedEmployee)}</p>
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setExpandedEmployee(null)}>Close</button>
            </div>
            <div className="employee-review-grid">
              <div className="employee-summary-card">
                <h3>Overview</h3>
                <p><strong>Passport:</strong> {expandedEmployee.passport_number || '--'}</p>
                <p><strong>Phone:</strong> {expandedEmployee.mobile_number || '--'}</p>
                <p><strong>Email:</strong> {expandedEmployee.email || '--'}</p>
                <p><strong>Nationality:</strong> {expandedEmployee.nationality || '--'}</p>
                <p><strong>Registered by:</strong> {expandedEmployee.registered_by_username || '--'}</p>
              </div>
              <div className="employee-summary-card">
                <h3>Application</h3>
                <p><strong>Profession:</strong> {expandedEmployee.profession || expandedEmployee.professional_title || '--'}</p>
                <p><strong>Destination countries:</strong> {expandedEmployee.application_countries?.join(', ') || '--'}</p>
                <p><strong>Employment type:</strong> {prettyStatus(expandedEmployee.employment_type)}</p>
                <p><strong>Salary:</strong> {expandedEmployee.application_salary || '--'}</p>
              </div>
              <div className="employee-summary-card">
                <h3>Movement</h3>
                <p><strong>Status:</strong> {employmentStage(expandedEmployee)}</p>
                <p><strong>Travel:</strong> {prettyStatus(expandedEmployee.travel_status, 'pending')}</p>
                <p><strong>Return:</strong> {prettyStatus(expandedEmployee.return_status)}</p>
                <p><strong>Last movement:</strong> {formatDateTime(employeeMovementDate(expandedEmployee))}</p>
              </div>
              <div className="employee-summary-card">
                <h3>Commission</h3>
                <p><strong>Status:</strong> {currentView === 'settled' ? settledCommissionStatus(expandedEmployee) : commissionStatus(expandedEmployee)}</p>
                <p><strong>Agent side:</strong> {agentNameForEmployee(expandedEmployee)}</p>
                <p className="muted-text">Collection from the agent side to the organization is a future settlement concept.</p>
              </div>
              <div className="employee-summary-card">
                <h3>Last return request</h3>
                {expandedEmployee.return_request ? (
                  <>
                    <p><strong>Status:</strong> {prettyStatus(expandedEmployee.return_request.status)}</p>
                    <p><strong>Remark:</strong> {expandedEmployee.return_request.remark || '--'}</p>
                    <p><strong>Requested by:</strong> {expandedEmployee.return_request.requested_by_username || '--'}</p>
                    <p><strong>Requested at:</strong> {formatDateTime(expandedEmployee.return_request.requested_at)}</p>
                  </>
                ) : (
                  <p className="muted-text">No return request recorded.</p>
                )}
              </div>
              <div className="employee-summary-card employee-review-documents">
                <h3>Documents</h3>
                <div className="employee-modal-document-strip">
                  {(expandedEmployee.documents || []).length === 0 ? (
                    <span className="muted-text">No documents uploaded.</span>
                  ) : (
                    expandedEmployee.documents.map((document) => (
                      <div key={document.id} className="employee-modal-document-card" title={fileLabel(document)}>
                        <div className="employee-modal-document-tile">
                          {isImageDocument(document) ? (
                            <img src={document.file_url} alt={fileLabel(document)} />
                          ) : (
                            <span>{fileLabel(document).slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {requestModalOpen ? (
        <div className="employee-review-backdrop" role="presentation" onClick={closeRequestModal}>
          <div
            className="employee-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-settlement-request-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">Settlement requests</p>
                <h2 id="register-settlement-request-title">Create settlement request</h2>
                <p className="muted-text">Choose one responsible agent, then select the employed employees whose commission should now be settled from that agent side.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={closeRequestModal}>
                Close
              </button>
            </div>

            {requestError ? <p className="error-message">{requestError}</p> : null}

            <div className="employee-summary-grid">
              <div className="employee-summary-card">
                <h3>Responsible agent</h3>
                {requestEligibleGroups.length === 0 ? (
                  <p className="muted-text">No unsettled employed employees are currently available to request.</p>
                ) : (
                  <div className="return-request-employee-list">
                    {requestEligibleGroups.map((group) => {
                      const isSelected = selectedRequestAgentName === group.agentName
                      return (
                        <button
                          key={group.agentName}
                          type="button"
                          className={`return-request-employee-option${isSelected ? ' is-selected' : ''}`}
                          onClick={() => handleSelectRequestAgent(group.agentName)}
                          aria-pressed={isSelected}
                        >
                          <div>
                            <strong>{group.agentName}</strong>
                            <span className="return-request-employee-meta">
                              {group.employees.length} unsettled employee{group.employees.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <span className="return-request-employee-state">{isSelected ? 'Selected' : 'Select'}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="employee-summary-card">
                <h3>Employees under request</h3>
                {!selectedRequestGroup ? (
                  <p className="muted-text">Select the responsible agent first.</p>
                ) : (
                  <div className="return-request-employee-list">
                    {selectedRequestGroup.employees.map((employee) => {
                      const isSelected = selectedRequestEmployeeIds.includes(employee.id)
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          className={`return-request-employee-option${isSelected ? ' is-selected' : ''}`}
                          onClick={() => handleSettlementRequestEmployeeToggle(employee.id)}
                          aria-pressed={isSelected}
                        >
                          <div>
                            <strong>{employee.full_name}</strong>
                            <span className="return-request-employee-meta">
                              {employee.profession || employee.professional_title || '--'} | Passport {employee.passport_number || '--'}
                            </span>
                          </div>
                          <span className="return-request-employee-state">{isSelected ? 'Selected' : 'Select'}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="employee-summary-card employee-review-documents" style={{ marginTop: 16 }}>
              <h3>Request note</h3>
              <div className="settings-form" style={{ maxWidth: 'none', marginTop: 0 }}>
                <label>
                  Internal note
                  <input
                    type="text"
                    value={requestRemark}
                    onChange={(event) => setRequestRemark(event.target.value)}
                    placeholder="Optional note for the agent about this settlement request"
                  />
                </label>
              </div>
            </div>

            <div className="employee-modal-actions">
              <button type="button" className="btn-secondary" onClick={closeRequestModal}>
                Cancel
              </button>
              <button type="button" className="btn-warning" onClick={handleCreateSettlementRequest} disabled={requestSaving || requestEligibleGroups.length === 0}>
                {requestSaving ? 'Saving...' : 'Create request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settlementModalOpen ? (
        <div className="employee-review-backdrop" role="presentation" onClick={closeSettlementModal}>
          <div
            className="employee-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-settlement-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">{activeSettlementRequest ? 'Payment request' : 'Outstanding payments'}</p>
                <h2 id="register-settlement-title">
                  {editingSettlementRecord ? 'Modify payment' : activeSettlementRequest ? 'Settle payment request' : 'Register payment'}
                </h2>
                <p className="muted-text">
                  {editingSettlementRecord
                    ? 'Adjust the payment details before the organization acknowledges this settlement.'
                    : activeSettlementRequest
                      ? 'Enter the settlement amount and attach the bank receipts to complete this payment request for the selected employees.'
                      : 'Select from your employed employees with unsettled commission, confirm the payment amount, and attach the bank receipts for the payment record.'}
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={closeSettlementModal}>
                Close
              </button>
            </div>

            {settlementError ? <p className="error-message">{settlementError}</p> : null}

            <div className="employee-summary-grid">
              <div className="employee-summary-card">
                <h3>Employees</h3>
                {settlementEligibleEmployees.length === 0 ? (
                  <p className="muted-text">No unsettled employed employees are available for settlement.</p>
                ) : (
                  <>
                    {!activeSettlementRequest ? (
                      <label className="employee-selection-select-all">
                        <input
                          type="checkbox"
                          checked={allSettlementEmployeesSelected}
                          onChange={handleToggleAllSettlementEmployees}
                        />
                        <span>Select all employees</span>
                      </label>
                    ) : null}
                    <div className="return-request-employee-list">
                      {settlementEligibleEmployees.map((employee) => {
                        const isSelected = selectedSettlementEmployeeIds.includes(employee.id)
                        return activeSettlementRequest ? (
                          <div key={employee.id} className="return-request-employee-option is-selected">
                            <div>
                              <strong>{employee.full_name}</strong>
                              <span className="return-request-employee-meta">
                                {employee.profession || employee.professional_title || '--'} | Travel {prettyStatus(employee.travel_status, 'pending')}
                              </span>
                            </div>
                            <span className="return-request-employee-state">Requested</span>
                          </div>
                        ) : (
                          <button
                            key={employee.id}
                            type="button"
                            className={`return-request-employee-option${isSelected ? ' is-selected' : ''}`}
                            onClick={() => handleSettlementEmployeeToggle(employee.id)}
                            aria-pressed={isSelected}
                          >
                            <div>
                              <strong>{employee.full_name}</strong>
                              <span className="return-request-employee-meta">
                                {employee.profession || employee.professional_title || '--'} | Travel {prettyStatus(employee.travel_status, 'pending')}
                              </span>
                            </div>
                            <span className="return-request-employee-state">{isSelected ? 'Selected' : 'Select'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="employee-summary-card">
                <h3>Settlement details</h3>
                <div className="settings-form" style={{ maxWidth: 'none', marginTop: 0 }}>
                  <label>
                    Settlement date
                    <input type="date" value={settlementDate} disabled readOnly />
                  </label>
                  <div>
                    <div className="settlement-amount-row">
                      <span className="settings-form-label">Settlement amount</span>
                      <label className="settlement-amount-toggle">
                        <input
                          type="checkbox"
                          checked={settlementAmountEditable}
                          onChange={(event) => {
                            const nextEditable = event.target.checked
                            setSettlementAmountEditable(nextEditable)
                            if (!nextEditable) {
                              setSettlementAmountTouched(false)
                              setSettlementAmount(expectedSettlementAmount === null ? '' : String(expectedSettlementAmount))
                            }
                          }}
                        />
                        <span>Edit amount</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={settlementAmount}
                      disabled={!settlementAmountEditable}
                      onChange={(event) => {
                        setSettlementAmount(event.target.value)
                        setSettlementAmountTouched(true)
                      }}
                    />
                  </div>
                </div>
                <p><strong>Selected employees:</strong> {selectedSettlementEmployeeIds.length}</p>
                <p><strong>Agent side:</strong> {currentAgentDisplayName}</p>
                <p>
                  <strong>Expected amount:</strong>{' '}
                  {formatCurrency(expectedSettlementAmount)}
                </p>
              </div>
            </div>

            <div className="employee-summary-card employee-review-documents" style={{ marginTop: 16 }}>
              <h3>Bank receipts</h3>
              <div className="attachment-grid">
                {[0, 1, 2].map((index) => {
                  const file = settlementReceiptFiles[index]
                  const inputId = `settlement-receipt-${index}`
                  return (
                    <label key={inputId} htmlFor={inputId} className="attachment-box">
                      <span className="attachment-box-title">Receipt {index + 1}</span>
                      <div className="attachment-file-row">
                        <span className="attachment-file-name">{file?.name || 'No file chosen'}</span>
                        <span className="attachment-file-trigger btn-secondary">Choose file</span>
                      </div>
                      <input
                        id={inputId}
                        className="visually-hidden-file"
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        onChange={(event) => handleSettlementReceiptPick(index, event.target.files?.[0] || null)}
                      />
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="employee-modal-actions">
              <button type="button" className="btn-secondary" onClick={closeSettlementModal}>
                Cancel
              </button>
              <button type="button" className="btn-warning" onClick={handleRegisterSettlement} disabled={settlementSaving || settlementEligibleEmployees.length === 0}>
                {settlementSaving ? 'Saving...' : editingSettlementRecord ? 'Update payment' : activeSettlementRequest ? 'Settle payment' : 'Register payment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewReceipt ? (
        <div className="document-preview-backdrop" role="presentation" onClick={closeReceiptPreview}>
          <div
            className="document-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commission-receipt-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="employee-review-header">
              <div>
                <p className="employee-modal-eyebrow">Settlement receipt</p>
                <h2 id="commission-receipt-preview-title">{previewReceipt.label}</h2>
                <p className="muted-text">{previewReceipt.note || 'Receipt preview'}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={closeReceiptPreview}>
                Close
              </button>
            </div>

            <div className="employee-summary-card employee-review-documents">
              <img
                src={previewReceipt.dataUrl}
                alt={previewReceipt.label}
                className="employee-attachment-preview-image"
                style={{ width: '100%', height: 'auto', maxHeight: '72vh', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

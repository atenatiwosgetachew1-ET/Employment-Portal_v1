import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUiFeedback } from '../context/UiFeedbackContext'
import * as employeesService from '../services/employeesService'
import * as usersService from '../services/usersService'

const COMMISSION_VIEW_TABS = [
  { id: 'unsettled', label: 'Unsettled commissions' },
  { id: 'settled', label: 'Settled commissions' }
]
const COMMISSION_SETTLEMENT_STORAGE_KEY = 'employment-portal.commission-settlements'

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
    (employee?.did_travel || employee?.travel_status === 'travelled')
  )
}

function isSettledCommissionEmployee(employee) {
  return Boolean(
    isReturnedEmployee(employee) &&
    (employee?.did_travel || employee?.travel_status === 'travelled')
  )
}

function commissionStatus(employee) {
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
  const userCandidates = [
    displayActorName(user),
    displayAgentName(user),
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

function readStoredSettlements() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COMMISSION_SETTLEMENT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredSettlements(settlements) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(COMMISSION_SETTLEMENT_STORAGE_KEY, JSON.stringify(settlements))
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
    return_request: employee.return_request || null,
    selection_state: employee.selection_state || null,
    documents: employee.documents || []
  }
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

async function fetchAllEmployeePages(scopeKey, scopeValue) {
  let page = 1
  const results = []
  let hasNext = true

  while (hasNext) {
    const response = await employeesService.fetchEmployees({
      page,
      [scopeKey]: scopeValue
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
  const [expandedEmployee, setExpandedEmployee] = useState(null)
  const [currentView, setCurrentView] = useState('unsettled')
  const [openUnsettledGroups, setOpenUnsettledGroups] = useState({})
  const [openSettledGroups, setOpenSettledGroups] = useState({})
  const [openSettlementEmployees, setOpenSettlementEmployees] = useState({})
  const [settlements, setSettlements] = useState([])
  const [settlementModalOpen, setSettlementModalOpen] = useState(false)
  const [settlementSaving, setSettlementSaving] = useState(false)
  const [settlementError, setSettlementError] = useState('')
  const [selectedSettlementEmployeeIds, setSelectedSettlementEmployeeIds] = useState([])
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [settlementReceiptFiles, setSettlementReceiptFiles] = useState([null, null, null])

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const isAgentSideUser = isAgentSideWorkspace(user)
  const canRegisterSettlements = isAgentSideUser && user?.role === 'customer'
  const permissions = user?.permissions || []
  const canManageUsers =
    Boolean(user?.feature_flags?.users_management_enabled) &&
    (permissions.includes('users.manage_all') || permissions.includes('users.manage_limited'))
  const ownerKey = useMemo(() => settlementOwnerKey(user), [user])
  const currentAgentDisplayName = displayActorName(user)

  const loadCommissionBoard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const scope = isAgentSideUser ? 'mine' : 'organization'
      const employedEmployees = await fetchAllEmployeePages('employedScope', scope)
      const uniqueUnsettledEmployees = new Map()
      employedEmployees.forEach((employee) => {
        if (isCommissionEligibleEmployee(employee)) uniqueUnsettledEmployees.set(employee.id, employee)
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
  }, [canManageUsers, isAgentSideUser])

  useEffect(() => {
    if (canManageEmployees) {
      loadCommissionBoard()
    } else {
      setLoading(false)
    }
  }, [canManageEmployees, loadCommissionBoard])

  useEffect(() => {
    const allSettlements = readStoredSettlements()
    setSettlements(allSettlements.filter((item) => item.ownerKey === ownerKey))
  }, [ownerKey])

  const persistSettlements = useCallback((nextOwnedSettlements) => {
    const allSettlements = readStoredSettlements()
    const otherSettlements = allSettlements.filter((item) => item.ownerKey !== ownerKey)
    const nextAllSettlements = [...otherSettlements, ...nextOwnedSettlements]
    writeStoredSettlements(nextAllSettlements)
    setSettlements(nextOwnedSettlements)
  }, [ownerKey])

  const settledEmployeeIds = useMemo(
    () => new Set(settlements.flatMap((settlement) => settlement.employeeIds || [])),
    [settlements]
  )

  const unsettledCases = useMemo(
    () => sourceUnsettledCases.filter((employee) => !settledEmployeeIds.has(employee.id)),
    [settledEmployeeIds, sourceUnsettledCases]
  )

  const settlementEligibleEmployees = useMemo(() => {
    if (!canRegisterSettlements) return []

    const ownedEmployees = unsettledCases.filter((employee) => employeeBelongsToAgent(employee, user))
    return ownedEmployees.length > 0 ? ownedEmployees : unsettledCases
  }, [canRegisterSettlements, unsettledCases, user])

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
    if (!query) return settlements
    return settlements.filter((settlement) =>
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

    const agentCount = new Set(unsettledVisibleCases.map((employee) => agentNameForEmployee(employee))).size
    const travelled = unsettledVisibleCases.filter((employee) => employee.did_travel || employee.travel_status === 'travelled').length
    const pendingReturnRequests = unsettledVisibleCases.filter((employee) => employee.return_request?.status === 'pending').length

    return {
      total: unsettledVisibleCases.length,
      travelled,
      pendingReturnRequests,
      agentCount
    }
  }, [currentView, unsettledVisibleCases, visibleSettlements])

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

  const maxUnsettledCases = useMemo(() => {
    const values = Object.values(agentSettlementMetrics)
    return values.length ? Math.max(...values, 1) : 1
  }, [agentSettlementMetrics])

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
    setSettlementReceiptFiles([null, null, null])
    setSettlementError('')
  }, [])

  const openSettlementModal = useCallback(() => {
    resetSettlementForm()
    setSettlementModalOpen(true)
  }, [resetSettlementForm])

  const closeSettlementModal = useCallback(() => {
    setSettlementModalOpen(false)
    resetSettlementForm()
  }, [resetSettlementForm])

  const handleSettlementReceiptPick = useCallback((index, file) => {
    setSettlementReceiptFiles((prev) => prev.map((item, itemIndex) => (itemIndex === index ? file || null : item)))
  }, [])

  const handleSettlementEmployeeToggle = useCallback((employeeId) => {
    setSelectedSettlementEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    )
  }, [])

  const handleRegisterSettlement = useCallback(async () => {
    if (selectedSettlementEmployeeIds.length === 0) {
      setSettlementError('Choose at least one employee for this settlement.')
      return
    }

    if (!settlementReceiptFiles.some(Boolean)) {
      setSettlementError('Attach at least one bank receipt for this settlement.')
      return
    }

      const selectedEmployees = settlementEligibleEmployees.filter((employee) => selectedSettlementEmployeeIds.includes(employee.id))
      if (selectedEmployees.length === 0) {
        setSettlementError('The selected employees are no longer available for settlement.')
        return
      }

    setSettlementSaving(true)
    setSettlementError('')
    try {
      const fallbackRate = numericCommissionRate(user?.agent_commission || user?.profile?.agent_commission)
      const agentName = selectedEmployees[0] ? agentNameForEmployee(selectedEmployees[0]) : currentAgentDisplayName
      const effectiveRate = agentRateLookup[agentName] ?? fallbackRate ?? null
      const receipts = await Promise.all(
        settlementReceiptFiles
          .filter(Boolean)
          .map(async (file, index) => ({
            id: `${Date.now()}-receipt-${index}`,
            label: file.name,
            note: 'Bank receipt attachment',
            name: file.name,
            mimeType: file.type || '',
            dataUrl: await readFileAsDataUrl(file)
          }))
      )

      const settlementRecord = {
        id: `settlement-${Date.now()}`,
        ownerKey,
        agentName,
        employeeIds: selectedEmployees.map((employee) => employee.id),
        employees: selectedEmployees.map(buildEmployeeSettlementSnapshot),
        rate: effectiveRate,
        totalCommissionValue: effectiveRate === null ? null : effectiveRate * selectedEmployees.length,
        settledAt: settlementDate || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        receipts
      }

      persistSettlements([...settlements, settlementRecord])
      setCurrentView('settled')
      setOpenSettledGroups((prev) => ({ ...prev, [settlementRecord.id]: true }))
      setOpenSettlementEmployees((prev) => ({ ...prev, [settlementRecord.id]: false }))
      closeSettlementModal()
      showToast('Settlement registered successfully.', { tone: 'success' })
    } catch (err) {
      setSettlementError(err.message || 'Could not register settlement')
      showToast(err.message || 'Could not register settlement', { tone: 'danger', title: 'Action failed' })
    } finally {
      setSettlementSaving(false)
    }
  }, [
    agentRateLookup,
    closeSettlementModal,
    currentAgentDisplayName,
    ownerKey,
    persistSettlements,
    selectedSettlementEmployeeIds,
    settlementDate,
    settlementReceiptFiles,
    settlements,
    showToast,
    settlementEligibleEmployees,
    user
  ])

  if (!canManageEmployees) return <Navigate to="/dashboard" replace />

  return (
    <section className="dashboard-panel commissions-page">
      <div className="users-management-header">
        <div>
          <h1>Commissions</h1>
          <p className="muted-text">
            {currentView === 'settled'
              ? 'This board tracks settlements registered from the agent side, including the grouped employed employees, settled amount, and attached bank receipts.'
              : 'This board tracks currently employed employees that still carry unsettled commission responsibility from the agent side to the organization.'}
          </p>
          <p className="muted-text">
            {canRegisterSettlements
              ? 'Settlement registration is available only for your own employed employees with unsettled commission.'
              : 'Settlement registration is handled from the agent-side admin workspace and appears here as an operational ledger.'}
          </p>
        </div>
      </div>

      <div className="employee-subtabs" role="tablist" aria-label="Commission views">
        {COMMISSION_VIEW_TABS.map((tab) => (
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
          <strong>{currentView === 'settled' ? 'Settled cases' : 'Unsettled cases'}</strong>
          <span>{summary.total}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>{currentView === 'settled' ? 'Employees settled' : 'Travel completed'}</strong>
          <span>{summary.travelled}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>{currentView === 'settled' ? 'Receipt files' : 'Pending return requests'}</strong>
          <span>{summary.pendingReturnRequests}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>{currentView === 'settled' ? 'Total value' : 'Active agents'}</strong>
          <span>{currentView === 'settled' ? formatCurrency(summary.agentCount) : summary.agentCount}</span>
        </div>
      </div>

      <div className="commission-toolbar">
        <label className="commission-search">
          Search commission cases
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Employee, agent, passport, profession"
          />
        </label>
        <div className="employees-header-actions">
          {canRegisterSettlements ? (
            <button type="button" className="btn-warning" onClick={openSettlementModal}>
              Register settlement
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={loadCommissionBoard} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {agentRates.length > 0 && currentView === 'unsettled' ? (
        <section className="concept-section">
          <h2>Configured agent commission rates</h2>
          <div className="commission-rate-grid">
            {agentRates.map((agent) => {
              const unsettledCases = agentSettlementMetrics[displayAgentName(agent)] || 0
              const activityRate = summary.total > 0 ? Math.round((unsettledCases / summary.total) * 100) : 0
              const configuredRate = numericCommissionRate(agent.agent_commission)
              const configuredRateValue = configuredRate === null ? 0 : Math.min(Math.max(configuredRate, 0), 100)
              const unsettledValue = Math.round((unsettledCases / maxUnsettledCases) * 100)

              return (
                <article key={agent.id} className="concept-card">
                  <p className="concept-card-kicker">Agents</p>
                  <h3>{displayAgentName(agent)}</h3>
                  <p className="muted-text">Country: {agent.agent_country || '--'}</p>
                  <div className="commission-rate-graph-wrap">
                    <div className="commission-rate-graph" aria-label={`Commission overview for ${displayAgentName(agent)}`}>
                      <div className="commission-rate-graph-bar">
                        <span className="commission-rate-graph-fill commission-rate-graph-fill--rate" style={{ width: `${configuredRateValue}%` }} />
                      </div>
                      <div className="commission-rate-graph-bar">
                        <span className="commission-rate-graph-fill commission-rate-graph-fill--cases" style={{ width: `${unsettledValue}%` }} />
                      </div>
                      <div className="commission-rate-graph-bar">
                        <span className="commission-rate-graph-fill commission-rate-graph-fill--activity" style={{ width: `${activityRate}%` }} />
                      </div>
                    </div>
                    <div className="commission-rate-popover">
                      <p className="muted-text">Configured rate: {agent.agent_commission ?? '--'}</p>
                      <p className="muted-text">Unsettled cases: {unsettledCases}</p>
                      <p className="muted-text">Settlement activity rate: {activityRate}%</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="concept-section">
        <h2>{currentView === 'settled' ? 'Settled commission board' : 'Commission board'}</h2>
        {loading ? (
          <p className="muted-text">Loading commission cases...</p>
        ) : currentView === 'settled' ? (
          settledSettlements.length === 0 ? (
            <p className="muted-text">No settled commission cases found for this scope.</p>
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
                                  <span className="badge badge-success">{settledCommissionStatus(employee)}</span>
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
                                  {receipt.dataUrl ? (
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
          <p className="muted-text">No unsettled commission cases found for this scope.</p>
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
                        <span className="badge badge-warning">
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
                <p className="employee-modal-eyebrow">Settled commissions</p>
                <h2 id="register-settlement-title">Register settlement</h2>
                <p className="muted-text">Select from your employed employees with unsettled commission and attach the bank receipts for the settlement record.</p>
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
                  <div className="return-request-employee-list">
                    {settlementEligibleEmployees.map((employee) => {
                      const isSelected = selectedSettlementEmployeeIds.includes(employee.id)
                      return (
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
                )}
              </div>

              <div className="employee-summary-card">
                <h3>Settlement details</h3>
                <div className="settings-form" style={{ maxWidth: 'none', marginTop: 0 }}>
                  <label>
                    Settlement date
                    <input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} />
                  </label>
                </div>
                <p><strong>Selected employees:</strong> {selectedSettlementEmployeeIds.length}</p>
                <p><strong>Agent side:</strong> {currentAgentDisplayName}</p>
                <p>
                  <strong>Expected amount:</strong>{' '}
                  {formatCurrency(
                    (() => {
                      const fallbackRate = numericCommissionRate(user?.agent_commission || user?.profile?.agent_commission)
                      const effectiveRate = agentRateLookup[currentAgentDisplayName] ?? fallbackRate ?? null
                      return effectiveRate === null ? null : effectiveRate * selectedSettlementEmployeeIds.length
                    })()
                  )}
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
                {settlementSaving ? 'Saving...' : 'Register settlement'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

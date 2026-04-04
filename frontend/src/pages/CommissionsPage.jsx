import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import * as employeesService from '../services/employeesService'
import * as usersService from '../services/usersService'

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

function commissionStatus(employee) {
  return employee?.did_travel ? 'Unsettled commission' : 'Commission pending travel'
}

function employmentStage(employee) {
  if (employee?.returned_from_employment) return 'Returned'
  return employee?.did_travel ? 'Employed' : 'Travel pending'
}

function agentNameForEmployee(employee) {
  return employee?.selection_state?.selection?.agent_name || 'Unassigned agent'
}

function displayAgentName(agent) {
  return [agent?.first_name, agent?.last_name].filter(Boolean).join(' ') || agent?.username || 'Unknown agent'
}

function employeeMovementDate(employee) {
  return employee?.departure_date || employee?.created_at || ''
}

function formatDateTime(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [cases, setCases] = useState([])
  const [agentRates, setAgentRates] = useState([])
  const [openedEmployee, setOpenedEmployee] = useState(null)

  const canManageEmployees = Boolean(user?.feature_flags?.employees_enabled)
  const isAgentSideUser = isAgentSideWorkspace(user)
  const permissions = user?.permissions || []
  const canManageUsers =
    Boolean(user?.feature_flags?.users_management_enabled) &&
    (permissions.includes('users.manage_all') || permissions.includes('users.manage_limited'))

  const loadCommissionBoard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const scope = isAgentSideUser ? 'mine' : 'organization'
      const employedEmployees = await fetchAllEmployeePages('employedScope', scope)
      const uniqueEmployees = new Map()
      employedEmployees.forEach((employee) => {
        if (!employee.returned_from_employment) uniqueEmployees.set(employee.id, employee)
      })
      setCases(Array.from(uniqueEmployees.values()))

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
      setCases([])
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

  const visibleCases = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return cases
    return cases.filter((employee) =>
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
  }, [cases, search])

  const summary = useMemo(() => {
    const agentCount = new Set(visibleCases.map((employee) => agentNameForEmployee(employee))).size
    const travelled = visibleCases.filter((employee) => employee.did_travel).length
    const pendingReturnRequests = visibleCases.filter((employee) => employee.return_request?.status === 'pending').length

    return {
      total: visibleCases.length,
      travelled,
      pendingReturnRequests,
      agentCount
    }
  }, [visibleCases])

  const casesByAgent = useMemo(() => {
    const grouped = visibleCases.reduce((acc, employee) => {
      const key = agentNameForEmployee(employee)
      if (!acc[key]) acc[key] = []
      acc[key].push(employee)
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([agentName, employees]) => ({
        agentName,
        employees: employees.sort((a, b) => a.full_name.localeCompare(b.full_name))
      }))
      .sort((a, b) => b.employees.length - a.employees.length || a.agentName.localeCompare(b.agentName))
  }, [visibleCases])

  const agentSettlementMetrics = useMemo(() => {
    return visibleCases.reduce((acc, employee) => {
      const key = agentNameForEmployee(employee)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [visibleCases])

  if (!canManageEmployees) return <Navigate to="/dashboard" replace />

  return (
    <section className="dashboard-panel commissions-page">
      <div className="users-management-header">
        <div>
          <h1>Commissions</h1>
          <p className="muted-text">
            This board tracks currently employed employees that still carry unsettled commission responsibility from the agent side to the organization.
          </p>
          <p className="muted-text">
            Settlement posting, paid amounts, and finance approval history are not implemented yet, so this page acts as an operational board rather than a full accounting ledger.
          </p>
        </div>
      </div>

      <div className="concept-summary-strip">
        <div className="concept-summary-pill">
          <strong>Unsettled cases</strong>
          <span>{summary.total}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>Travel completed</strong>
          <span>{summary.travelled}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>Pending return requests</strong>
          <span>{summary.pendingReturnRequests}</span>
        </div>
        <div className="concept-summary-pill">
          <strong>Active agent sides</strong>
          <span>{summary.agentCount}</span>
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
        <button type="button" className="btn-secondary" onClick={loadCommissionBoard} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {agentRates.length > 0 ? (
        <section className="concept-section">
          <h2>Configured agent commission rates</h2>
          <div className="commission-rate-grid">
            {agentRates.map((agent) => {
              const unsettledCases = agentSettlementMetrics[displayAgentName(agent)] || 0
              const activityRate = summary.total > 0 ? Math.round((unsettledCases / summary.total) * 100) : 0

              return (
                <article key={agent.id} className="concept-card">
                  <p className="concept-card-kicker">Agent side</p>
                  <h3>{displayAgentName(agent)}</h3>
                  <p className="muted-text">Country: {agent.agent_country || '--'}</p>
                  <p className="muted-text">Configured rate: {agent.agent_commission ?? '--'}</p>
                  <p className="muted-text">Unsettled cases: {unsettledCases}</p>
                  <p className="muted-text">Settlement activity rate: {activityRate}%</p>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="concept-section">
        <h2>Commission board</h2>
        {loading ? (
          <p className="muted-text">Loading commission cases...</p>
        ) : casesByAgent.length === 0 ? (
          <p className="muted-text">No unsettled commission cases found for this scope.</p>
        ) : (
          <div className="commission-group-list">
            {casesByAgent.map((group) => (
              <details key={group.agentName} className="commission-group">
                <summary className="commission-group-header">
                  <div>
                    <h3>{group.agentName}</h3>
                    <p className="muted-text">{group.employees.length} unsettled case{group.employees.length === 1 ? '' : 's'}</p>
                  </div>
                  <span className="commission-group-toggle">Expand</span>
                </summary>

                <div className="commission-case-list">
                  {group.employees.map((employee) => (
                    <article key={employee.id} className="commission-case-card">
                      <div className="commission-case-topline">
                        <div>
                          <strong>{employee.full_name}</strong>
                          <p className="muted-text">{employee.profession || employee.professional_title || '--'}</p>
                        </div>
                        <span className="badge badge-warning">{commissionStatus(employee)}</span>
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
              </details>
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
              <button type="button" className="btn-secondary" onClick={() => setOpenedEmployee(null)}>Close</button>
            </div>
            <div className="employee-review-grid">
              <div className="employee-summary-card">
                <h3>Commission</h3>
                <p><strong>Status:</strong> {commissionStatus(openedEmployee)}</p>
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
    </section>
  )
}

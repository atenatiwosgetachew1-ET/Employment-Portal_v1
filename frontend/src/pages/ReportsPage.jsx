import { useCallback, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useAuth } from '../context/AuthContext'
import * as employeesService from '../services/employeesService'
import * as usersService from '../services/usersService'
import * as auditLogService from '../services/auditLogService'

const REPORT_TABS = [
  { id: 'employees', label: 'Employees' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'users', label: 'Users' },
  { id: 'system', label: 'System' }
]
const COMMISSION_SETTLEMENT_STORAGE_KEY = 'employment-portal.commission-settlements'

function formatPercent(value) {
  if (!Number.isFinite(value)) return '--'
  return `${Math.round(value)}%`
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return '--'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(value))
}

function formatReportDate(value = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function daysBetween(start, end = new Date()) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
}

function actorName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Unknown'
}

function employeeAgentName(employee) {
  return employee?.selection_state?.selection?.agent_name || 'Unassigned agent'
}

function isReturned(employee) {
  return Boolean(employee?.returned_from_employment || employee?.return_request?.status === 'approved')
}

function isEmployed(employee) {
  return Boolean(!isReturned(employee) && employee?.did_travel)
}

function isUnderProcess(employee) {
  return Boolean(!isReturned(employee) && !employee?.did_travel && employee?.selection_state?.status === 'under_process')
}

function returnBucket(employee) {
  const text = `${employee?.return_status || ''} ${employee?.return_request?.remark || ''}`.toLowerCase()
  if (text.includes('finish') || text.includes('complete') || text.includes('contract date')) return 'Completed contract'
  if (text.includes('discontinue') || text.includes('terminate') || text.includes('ended early')) return 'Discontinued contract'
  return 'Other return'
}

function sentimentScore(rows) {
  const positive = ['approve', 'approved', 'success', 'created', 'settled', 'completed', 'verified']
  const negative = ['refuse', 'refused', 'decline', 'declined', 'cancel', 'cancelled', 'delete', 'error', 'failed']
  const score = rows.reduce((sum, row) => {
    const text = `${row?.action || ''} ${row?.summary || ''}`.toLowerCase()
    const plus = positive.some((word) => text.includes(word)) ? 1 : 0
    const minus = negative.some((word) => text.includes(word)) ? 1 : 0
    return sum + plus - minus
  }, 0)
  if (!rows.length) return 0
  return Math.round((score / rows.length) * 100)
}

function topEntries(mapObject, metricLabel, formatter = (value) => value) {
  return Object.entries(mapObject)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([label, value]) => ({ label, value: formatter(value), raw: value, metricLabel }))
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

async function fetchAllEmployeePages(params = {}) {
  let page = 1
  const results = []
  let hasNext = true

  while (hasNext) {
    const response = await employeesService.fetchEmployees({ page, ...params })
    results.push(...(response.results || []))
    hasNext = Boolean(response.next)
    page += 1
  }

  return results
}

async function fetchAllUsers(params = {}) {
  let page = 1
  const results = []
  let hasNext = true

  while (hasNext) {
    const response = await usersService.fetchUsers({ page, ...params })
    results.push(...(response.results || []))
    hasNext = Boolean(response.next)
    page += 1
  }

  return results
}

async function fetchAllAuditLogs() {
  let page = 1
  const results = []
  let hasNext = true

  while (hasNext && page <= 10) {
    const response = await auditLogService.fetchAuditLogs({ page })
    results.push(...(response.results || []))
    hasNext = Boolean(response.next)
    page += 1
  }

  return results
}

function D3HorizontalBarChart({ data, title, subtitle, color = '#c97f3d', formatter = (value) => value, compact = false }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value))) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const rowHeight = 42
  const margin = { top: 18, right: 28, bottom: 24, left: 158 }
  const innerHeight = chartData.length * rowHeight
  const height = margin.top + innerHeight + margin.bottom
  const maxValue = d3.max(chartData, (item) => Number(item.value)) || 0
  const xScale = d3.scaleLinear().domain([0, Math.max(maxValue, 1)]).range([margin.left, width - margin.right])
  const yScale = d3
    .scaleBand()
    .domain(chartData.map((item) => item.label))
    .range([margin.top, margin.top + innerHeight])
    .padding(0.28)
  const ticks = xScale.ticks(4)

  return (
    <article className={`reports-chart-card${compact ? ' is-compact' : ''}`}>
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={xScale(tick)}
                x2={xScale(tick)}
                y1={margin.top - 4}
                y2={margin.top + innerHeight + 4}
                className="reports-chart-grid-line"
              />
              <text x={xScale(tick)} y={height - 6} textAnchor="middle" className="reports-chart-grid-label">
                {formatter(tick)}
              </text>
            </g>
          ))}
          {chartData.map((item) => {
            const y = yScale(item.label) ?? margin.top
            const barHeight = yScale.bandwidth()
            const barWidth = Math.max(0, xScale(Number(item.value)) - margin.left)
            return (
              <g key={item.label}>
                <text x={margin.left - 12} y={y + barHeight / 2 + 4} textAnchor="end" className="reports-chart-axis-label">
                  {item.label}
                </text>
                <rect
                  x={margin.left}
                  y={y}
                  width={width - margin.left - margin.right}
                  height={barHeight}
                  rx="8"
                  className="reports-chart-track"
                />
                <rect
                  x={margin.left}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="8"
                  fill={color}
                  className="reports-chart-bar"
                />
                <text
                  x={Math.min(width - margin.right - 4, margin.left + barWidth + 8)}
                  y={y + barHeight / 2 + 4}
                  textAnchor={margin.left + barWidth + 82 > width - margin.right ? 'end' : 'start'}
                  className="reports-chart-value"
                >
                  {formatter(item.value)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </article>
  )
}

function D3StageChart({ data, title, subtitle }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value))) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 240
  const margin = { top: 28, right: 24, bottom: 52, left: 24 }
  const maxValue = d3.max(chartData, (item) => Number(item.value)) || 1
  const xScale = d3
    .scaleBand()
    .domain(chartData.map((item) => item.label))
    .range([margin.left, width - margin.right])
    .padding(0.16)
  const yScale = d3.scaleLinear().domain([0, maxValue]).range([height - margin.bottom, margin.top])

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {chartData.map((item, index) => {
            const x = xScale(item.label) ?? margin.left
            const next = chartData[index + 1]
            const currentCenter = x + xScale.bandwidth() / 2
            const y = yScale(Number(item.value))
            const boxHeight = height - margin.bottom - y
            const nextCenter = next ? (xScale(next.label) ?? margin.left) + xScale.bandwidth() / 2 : null
            return (
              <g key={item.label}>
                {nextCenter !== null ? (
                  <line
                    x1={currentCenter}
                    x2={nextCenter}
                    y1={y + boxHeight / 2}
                    y2={yScale(Number(next.value)) + (height - margin.bottom - yScale(Number(next.value))) / 2}
                    className="reports-stage-link"
                  />
                ) : null}
                <rect x={x} y={y} width={xScale.bandwidth()} height={boxHeight} rx="14" className="reports-stage-bar" />
                <text x={currentCenter} y={y - 10} textAnchor="middle" className="reports-stage-value">
                  {item.value}
                </text>
                <text x={currentCenter} y={height - 20} textAnchor="middle" className="reports-chart-axis-label">
                  {item.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </article>
  )
}

function D3DonutChart({ data, title, subtitle, formatter = (value) => value }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value)) && Number(item.value) > 0) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 260
  const radius = 78
  const centerX = 158
  const centerY = 128
  const colors = ['#c97f3d', '#8f5d34', '#6d452b', '#d89b62', '#4d3325', '#a66937']
  const pie = d3.pie().value((item) => Number(item.value)).sort(null)(chartData)
  const arc = d3.arc().innerRadius(radius * 0.58).outerRadius(radius)
  const total = d3.sum(chartData, (item) => Number(item.value))

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          <g transform={`translate(${centerX}, ${centerY})`}>
            {pie.map((segment, index) => (
              <path key={segment.data.label} d={arc(segment) || ''} fill={colors[index % colors.length]} className="reports-donut-segment" />
            ))}
            <text textAnchor="middle" y="-4" className="reports-donut-total-value">{total}</text>
            <text textAnchor="middle" y="14" className="reports-donut-total-label">Total</text>
          </g>
          <g transform="translate(320, 42)">
            {chartData.map((item, index) => (
              <g key={item.label} transform={`translate(0, ${index * 32})`}>
                <rect width="12" height="12" rx="3" fill={colors[index % colors.length]} />
                <text x="22" y="10" className="reports-chart-axis-label">{item.label}</text>
                <text x="240" y="10" textAnchor="end" className="reports-chart-value">{formatter(item.value)}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </article>
  )
}

function D3LineChart({ data, title, subtitle, formatter = (value) => value }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value))) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 280
  const margin = { top: 22, right: 26, bottom: 42, left: 64 }
  const xScale = d3
    .scalePoint()
    .domain(chartData.map((item) => item.label))
    .range([margin.left, width - margin.right])
  const maxValue = d3.max(chartData, (item) => Number(item.value)) || 1
  const yScale = d3.scaleLinear().domain([0, maxValue]).nice().range([height - margin.bottom, margin.top])
  const line = d3
    .line()
    .x((item) => xScale(item.label) ?? margin.left)
    .y((item) => yScale(Number(item.value)))
  const ticks = yScale.ticks(4)

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={yScale(tick)} y2={yScale(tick)} className="reports-chart-grid-line" />
              <text x={margin.left - 10} y={yScale(tick) + 4} textAnchor="end" className="reports-chart-grid-label">
                {formatter(tick)}
              </text>
            </g>
          ))}
          <path d={line(chartData) || ''} className="reports-line-path" />
          {chartData.map((item) => {
            const x = xScale(item.label) ?? margin.left
            const y = yScale(Number(item.value))
            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r="4.5" className="reports-line-point" />
                <text x={x} y={height - 16} textAnchor="middle" className="reports-chart-axis-label">{item.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </article>
  )
}

function D3ScatterChart({ data, title, subtitle, xLabel, yLabel }) {
  const chartData = Array.isArray(data)
    ? data.filter((item) => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)))
    : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 300
  const margin = { top: 22, right: 28, bottom: 54, left: 60 }
  const xScale = d3
    .scaleLinear()
    .domain([0, d3.max(chartData, (item) => Number(item.x)) || 1])
    .nice()
    .range([margin.left, width - margin.right])
  const yScale = d3
    .scaleLinear()
    .domain([d3.min(chartData, (item) => Number(item.y)) || 0, d3.max(chartData, (item) => Number(item.y)) || 1])
    .nice()
    .range([height - margin.bottom, margin.top])
  const rScale = d3
    .scaleSqrt()
    .domain([0, d3.max(chartData, (item) => Number(item.size ?? 1)) || 1])
    .range([6, 16])
  const xTicks = xScale.ticks(4)
  const yTicks = yScale.ticks(4)

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line x1={xScale(tick)} x2={xScale(tick)} y1={margin.top} y2={height - margin.bottom} className="reports-chart-grid-line" />
              <text x={xScale(tick)} y={height - 16} textAnchor="middle" className="reports-chart-grid-label">{tick}</text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={margin.left} x2={width - margin.right} y1={yScale(tick)} y2={yScale(tick)} className="reports-chart-grid-line" />
              <text x={margin.left - 10} y={yScale(tick) + 4} textAnchor="end" className="reports-chart-grid-label">{tick}</text>
            </g>
          ))}
          {chartData.map((item) => {
            const x = xScale(Number(item.x))
            const y = yScale(Number(item.y))
            const radius = rScale(Number(item.size ?? 1))
            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r={radius} className="reports-scatter-point" />
                <text x={x} y={y - radius - 6} textAnchor="middle" className="reports-chart-axis-label">{item.label}</text>
              </g>
            )
          })}
          <text x={(margin.left + width - margin.right) / 2} y={height - 2} textAnchor="middle" className="reports-chart-grid-label">
            {xLabel}
          </text>
          <text
            x="14"
            y={(margin.top + height - margin.bottom) / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${(margin.top + height - margin.bottom) / 2})`}
            className="reports-chart-grid-label"
          >
            {yLabel}
          </text>
        </svg>
      </div>
    </article>
  )
}

export default function ReportsPage() {
  const { user } = useAuth()
  const [currentTab, setCurrentTab] = useState('employees')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [users, setUsers] = useState([])
  const [auditRows, setAuditRows] = useState([])

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const canViewAudit = user?.permissions?.includes('audit.view')
      const [employeeData, userData, auditData] = await Promise.all([
        fetchAllEmployeePages({}),
        fetchAllUsers({}),
        canViewAudit ? fetchAllAuditLogs() : Promise.resolve([])
      ])
      setEmployees(employeeData)
      setUsers(userData)
      setAuditRows(auditData)
    } catch (err) {
      setError(err.message || 'Could not load reports')
      setEmployees([])
      setUsers([])
      setAuditRows([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const settlements = useMemo(() => readStoredSettlements(), [])

  const employeeReport = useMemo(() => {
    const now = new Date()
    const last30 = employees.filter((employee) => daysBetween(employee.created_at, now) <= 30).length
    const previous30 = employees.filter((employee) => {
      const age = daysBetween(employee.created_at, now)
      return age > 30 && age <= 60
    }).length
    const registrationRate = previous30 > 0 ? ((last30 - previous30) / previous30) * 100 : last30 > 0 ? 100 : 0
    const employedCount = employees.filter(isEmployed).length
    const employedRate = employees.length > 0 ? (employedCount / employees.length) * 100 : 0
    const processDurations = employees
      .filter(isUnderProcess)
      .map((employee) => daysBetween(employee.created_at))
      .filter((value) => value !== null)
    const avgProcessDays = processDurations.length
      ? Math.round(processDurations.reduce((sum, value) => sum + value, 0) / processDurations.length)
      : 0
    const returnedEmployees = employees.filter(isReturned)
    const returnCounts = returnedEmployees.reduce((acc, employee) => {
      const bucket = returnBucket(employee)
      acc[bucket] = (acc[bucket] || 0) + 1
      return acc
    }, {})
    const returnRate = (returnedEmployees.length / Math.max(employedCount + returnedEmployees.length, 1)) * 100
    const monthlyRegistrations = d3.rollups(
      employees,
      (items) => items.length,
      (employee) => {
        const date = new Date(employee.created_at)
        if (Number.isNaN(date.getTime())) return 'Unknown'
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }
    )
      .filter(([label]) => label !== 'Unknown')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([label, value]) => ({ label, value }))
    const processAgeBuckets = [
      { label: '0-15 days', value: 0 },
      { label: '16-30 days', value: 0 },
      { label: '31-60 days', value: 0 },
      { label: '61+ days', value: 0 }
    ]
    processDurations.forEach((value) => {
      if (value <= 15) processAgeBuckets[0].value += 1
      else if (value <= 30) processAgeBuckets[1].value += 1
      else if (value <= 60) processAgeBuckets[2].value += 1
      else processAgeBuckets[3].value += 1
    })

    return {
      summary: [
        { label: 'Registration velocity', value: `${last30} recent | ${formatPercent(registrationRate)}` },
        { label: 'Employment conversion', value: formatPercent(employedRate) },
        { label: 'Average active process age', value: `${avgProcessDays} days` },
        { label: 'Return rate', value: formatPercent(returnRate) }
      ],
      stageChart: [
        { label: 'Registered', value: employees.length },
        { label: 'Under process', value: employees.filter(isUnderProcess).length },
        { label: 'Employed', value: employedCount },
        { label: 'Returned', value: returnedEmployees.length }
      ],
      returnChart: Object.entries(returnCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
      registrationTrend: monthlyRegistrations,
      processAgeChart: processAgeBuckets,
      details: [
        { title: 'Registration pace', body: `${last30} employees were registered in the last 30 days compared with ${previous30} in the prior 30-day window.` },
        { title: 'Employment completion', body: `${employedCount} employees are currently employed based on confirmed travel and non-returned status.` },
        { title: 'Under-process timing', body: `${processDurations.length} active under-process employees are averaging ${avgProcessDays} days inside the process stage.` },
        { title: 'Return analysis', body: Object.entries(returnCounts).map(([label, count]) => `${label}: ${count}`).join(' | ') || 'No return cases recorded.' }
      ]
    }
  }, [employees])

  const commissionReport = useMemo(() => {
    const agentRows = {}
    employees.forEach((employee) => {
      const agent = employeeAgentName(employee)
      if (!agentRows[agent]) {
        agentRows[agent] = {
          collected: 0,
          initiated: 0,
          employed: 0,
          returnedDiscontinued: 0,
          settledCases: 0
        }
      }
      if (employee.selection_state?.status) agentRows[agent].initiated += 1
      if (isEmployed(employee)) agentRows[agent].employed += 1
      if (isReturned(employee) && returnBucket(employee) === 'Discontinued contract') {
        agentRows[agent].returnedDiscontinued += 1
      }
    })
    settlements.forEach((settlement) => {
      const agent = settlement.agentName || 'Unknown agent'
      if (!agentRows[agent]) {
        agentRows[agent] = {
          collected: 0,
          initiated: 0,
          employed: 0,
          returnedDiscontinued: 0,
          settledCases: 0
        }
      }
      agentRows[agent].collected += Number(settlement.totalCommissionValue || 0)
      agentRows[agent].settledCases += settlement.employeeIds?.length || 0
    })

    const rows = Object.entries(agentRows).map(([agent, metrics]) => {
      const participation = metrics.initiated > 0 ? Math.round((metrics.employed / metrics.initiated) * 100) : 0
      const score = Math.round((participation * 0.55) + (Math.min(metrics.collected / 500, 100) * 0.45))
      return {
        agent,
        ...metrics,
        participation,
        score
      }
    }).sort((a, b) => b.collected - a.collected || b.score - a.score)

    const collectedTimeline = d3.rollups(
      settlements,
      (items) => d3.sum(items, (item) => Number(item.totalCommissionValue || 0)),
      (item) => {
        const date = new Date(item.settledAt || item.created_at || item.createdAt)
        if (Number.isNaN(date.getTime())) return 'Unknown'
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }
    )
      .filter(([label]) => label !== 'Unknown')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([label, value]) => ({ label, value }))

    return {
      summary: [
        { label: 'Collected commissions', value: formatCurrency(rows.reduce((sum, row) => sum + row.collected, 0)) },
        { label: 'Active commission agents', value: rows.length },
        { label: 'Settled employee cases', value: rows.reduce((sum, row) => sum + row.settledCases, 0) },
        { label: 'Avg participation', value: formatPercent(rows.length ? rows.reduce((sum, row) => sum + row.participation, 0) / rows.length : 0) }
      ],
      collectedChart: rows
        .slice(0, 6)
        .map((row) => ({ label: row.agent, value: row.collected })),
      scoreChart: rows
        .slice(0, 6)
        .map((row) => ({ label: row.agent, value: row.score })),
      settlementCasesChart: rows
        .slice(0, 6)
        .map((row) => ({ label: row.agent, value: row.settledCases })),
      performanceScatter: rows.slice(0, 8).map((row) => ({
        label: row.agent,
        x: row.participation,
        y: row.score,
        size: Math.max(row.collected, 1)
      })),
      collectedTimeline,
      rows: rows.slice(0, 8)
    }
  }, [employees, settlements])

  const userReport = useMemo(() => {
    const registrationsByUser = {}
    const docsByUser = {}
    const agentFavorites = {}
    const employedByRegistrar = {}

    employees.forEach((employee) => {
      const registrar = employee.registered_by_username || 'Unknown user'
      registrationsByUser[registrar] = (registrationsByUser[registrar] || 0) + 1
      docsByUser[registrar] = (docsByUser[registrar] || 0) + (employee.documents?.length || 0)
      if (employee.selection_state?.selection?.agent_name) {
        agentFavorites[registrar] = (agentFavorites[registrar] || 0) + 1
      }
      if (isEmployed(employee)) {
        employedByRegistrar[registrar] = (employedByRegistrar[registrar] || 0) + 1
      }
    })

    const activityByActor = {}
    const chatLikeRows = auditRows.filter((row) =>
      `${row.action || ''} ${row.resource_type || ''} ${row.summary || ''}`.toLowerCase().includes('chat')
    )
    const participationRows = chatLikeRows.length ? chatLikeRows : auditRows
    participationRows.forEach((row) => {
      const actor = row.actor_username || 'Unknown user'
      if (!activityByActor[actor]) activityByActor[actor] = []
      activityByActor[actor].push(row)
    })

    const chatParticipation = Object.entries(activityByActor)
      .map(([actor, rows]) => ({
        label: actor,
        value: `${rows.length} entries | Sentiment ${sentimentScore(rows)}`,
        raw: rows.length,
        sentiment: sentimentScore(rows)
      }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 5)

    const topRegistrars = topEntries(registrationsByUser, 'registrations')
    const documentAttachers = topEntries(docsByUser, 'documents')
    const favoriteUsers = topEntries(agentFavorites, 'agent selections')

    const underrated = Object.keys(registrationsByUser)
      .map((name) => ({
        label: name,
        raw: (registrationsByUser[name] || 0) - ((agentFavorites[name] || 0) + (employedByRegistrar[name] || 0)),
        value: `${registrationsByUser[name] || 0} registrations | ${agentFavorites[name] || 0} agent picks`
      }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 5)

    return {
      participationChart: chatParticipation.map((item) => ({ label: item.label, x: item.raw, y: item.sentiment, size: item.raw })),
      registrarChart: topRegistrars.map((item) => ({ label: item.label, value: item.raw })),
      attachmentChart: documentAttachers.map((item) => ({ label: item.label, value: item.raw })),
      favoriteChart: favoriteUsers.map((item) => ({ label: item.label, value: item.raw })),
      cards: [
        { title: 'Chat participation', items: chatParticipation, note: chatLikeRows.length ? 'Chat-derived activity' : 'Activity-log proxy due limited chat backend data' },
        { title: 'Top registrars', items: topRegistrars, note: 'Users registering the most employees' },
        { title: 'Document attachment proxy', items: documentAttachers, note: 'Measured from employee document totals under each registrar' },
        { title: 'Agent favourites from org side', items: favoriteUsers, note: 'Organization-side users whose employees are selected most often by agents' },
        { title: 'Underrated contributors', items: underrated, note: 'High registration effort but lower downstream picks/employment' }
      ]
    }
  }, [auditRows, employees])

  const systemReport = useMemo(() => {
    const activeUsers = users.filter((item) => item.is_active).length
    const roleCounts = users.reduce((acc, item) => {
      const role = item.role || 'unknown'
      acc[role] = (acc[role] || 0) + 1
      return acc
    }, {})
    const planCounts = users.reduce((acc, item) => {
      const plan = item.subscription?.plan_name || 'Unassigned'
      acc[plan] = (acc[plan] || 0) + 1
      return acc
    }, {})
    const statusCounts = users.reduce((acc, item) => {
      const status = item.subscription?.status || 'Unknown'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {})
    const activeSessionsEstimate = new Set(
      auditRows
        .filter((row) => daysBetween(row.created_at) !== null && daysBetween(row.created_at) <= 1)
        .map((row) => row.actor_username)
        .filter(Boolean)
    ).size
    const actionCounts = auditRows.reduce((acc, row) => {
      acc[row.action || 'unknown'] = (acc[row.action || 'unknown'] || 0) + 1
      return acc
    }, {})
    const resourceCounts = auditRows.reduce((acc, row) => {
      acc[row.resource_type || 'unknown'] = (acc[row.resource_type || 'unknown'] || 0) + 1
      return acc
    }, {})

    const heavyAreas = [
      { label: 'Under-process employees', value: employees.filter(isUnderProcess).length },
      { label: 'Returned employees', value: employees.filter(isReturned).length },
      { label: 'Pending return requests', value: employees.filter((employee) => employee.return_request?.status === 'pending').length },
      { label: 'Documents under management', value: employees.reduce((sum, employee) => sum + (employee.documents?.length || 0), 0) }
    ]

    return {
      summary: [
        { label: 'Active accounts', value: activeUsers },
        { label: 'Active sessions estimate', value: activeSessionsEstimate },
        { label: 'Plan families', value: Object.keys(planCounts).length },
        { label: 'Activity actions observed', value: auditRows.length }
      ],
      roleChart: topEntries(roleCounts, 'users').map((item) => ({ label: item.label, value: item.raw })),
      heavyChart: heavyAreas.map((item) => ({ label: item.label, value: item.value })),
      roleItems: topEntries(roleCounts, 'users'),
      planItems: topEntries(planCounts, 'subscriptions'),
      statusItems: topEntries(statusCounts, 'status'),
      actionItems: topEntries(actionCounts, 'actions'),
      resourceItems: topEntries(resourceCounts, 'resources'),
      heavyAreas
    }
  }, [auditRows, employees, users])

  const currentSummary = useMemo(() => {
    if (currentTab === 'employees') return employeeReport.summary
    if (currentTab === 'commissions') return commissionReport.summary
    if (currentTab === 'system') return systemReport.summary
    return [
      { label: 'Ranking groups', value: userReport.cards.length },
      { label: 'Employees observed', value: employees.length },
      { label: 'Users observed', value: users.length },
      { label: 'Audit entries used', value: auditRows.length }
    ]
  }, [auditRows.length, commissionReport.summary, currentTab, employeeReport.summary, employees.length, systemReport.summary, userReport.cards.length, users.length])

  const handleDownloadReport = useCallback(() => {
    const generatedOn = new Date()
    const dateLabel = formatReportDate(generatedOn)
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const left = 42
    const right = pageWidth - 42
    const accent = [159, 106, 59]
    const dark = [28, 28, 28]
    const muted = [99, 107, 122]
    const sectionGap = 18
    let currentY = 44

    const getAutoTableEnd = () => doc.lastAutoTable?.finalY ?? currentY

    const addPageIfNeeded = (needed = 80) => {
      if (currentY + needed <= pageHeight - 42) return
      doc.addPage()
      currentY = 44
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

    const addParagraph = (text) => {
      addPageIfNeeded(60)
      doc.setTextColor(...muted)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const lines = doc.splitTextToSize(text, right - left)
      doc.text(lines, left, currentY)
      currentY += lines.length * 13 + 10
    }

    const addSummaryTable = (items) => {
      autoTable(doc, {
        startY: currentY,
        margin: { left, right: pageWidth - right },
        head: [['Metric', 'Value']],
        body: items.map((item) => [item.label, String(item.value)]),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 7, textColor: dark },
        headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 244, 239] }
      })
      currentY = getAutoTableEnd() + sectionGap
    }

    const addDataTable = (title, rows, head) => {
      if (!rows.length) return
      addSectionTitle(title)
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
      currentY = getAutoTableEnd() + sectionGap
    }

    const reportTitle =
      currentTab === 'employees'
        ? 'Employee Report'
        : currentTab === 'commissions'
          ? 'Commission Report'
          : currentTab === 'users'
            ? 'User Report'
            : 'System Report'

    addHeader(reportTitle, `Generated on ${generatedOn.toLocaleString()}`)
    addSectionTitle('Executive Summary', 'This PDF reflects the current report tab only and expands the visible findings into a structured printable format.')
    addSummaryTable(currentSummary)

    if (currentTab === 'employees') {
      addSectionTitle('Report Highlights')
      employeeReport.details.forEach((item) => addParagraph(`${item.title}: ${item.body}`))

      addDataTable(
        'Employee Lifecycle Snapshot',
        employeeReport.stageChart.map((item) => [item.label, String(item.value)]),
        ['Stage', 'Employees']
      )
      addDataTable(
        'Registration Trend',
        employeeReport.registrationTrend.map((item) => [item.label, String(item.value)]),
        ['Period', 'Registrations']
      )
      addDataTable(
        'Under-process Age Buckets',
        employeeReport.processAgeChart.map((item) => [item.label, String(item.value)]),
        ['Age bucket', 'Employees']
      )
      addDataTable(
        'Return Breakdown',
        employeeReport.returnChart.map((item) => [item.label, String(item.value)]),
        ['Return category', 'Employees']
      )
    } else if (currentTab === 'commissions') {
      addSectionTitle('Commission Findings')
      addParagraph('This section summarizes collection performance, settlement throughput, and operational participation by agent based on stored settlements and current employee lifecycle signals.')

      addDataTable(
        'Collected Timeline',
        commissionReport.collectedTimeline.map((item) => [item.label, formatCurrency(item.value)]),
        ['Period', 'Collected amount']
      )
      addDataTable(
        'Agent Performance',
        commissionReport.rows.map((row) => [
          row.agent,
          formatCurrency(row.collected),
          formatPercent(row.participation),
          String(row.score),
          String(row.initiated),
          String(row.employed),
          String(row.returnedDiscontinued),
          String(row.settledCases)
        ]),
        ['Agent', 'Collected', 'Participation', 'Score', 'Initiated', 'Employed', 'Returned', 'Settled']
      )
    } else if (currentTab === 'users') {
      addSectionTitle('User Insights')
      addParagraph('The user report combines registration activity, audit-derived participation, document-attachment proxies, downstream agent preference, and under-recognized contribution signals.')

      userReport.cards.forEach((card) => {
        addDataTable(
          card.title,
          card.items.length
            ? card.items.map((item) => [item.label, String(item.value)])
            : [['No signal available yet', '--']],
          ['User or metric', 'Observed value']
        )
      })
    } else {
      addSectionTitle('System Overview')
      addParagraph('The system report blends user footprint, subscription posture, audit-log findings, and operational load areas to highlight overall platform health and management pressure points.')

      addDataTable(
        'Role Distribution',
        systemReport.roleItems.map((item) => [item.label, String(item.value)]),
        ['Role', 'Users']
      )
      addDataTable(
        'Plans and Subscription Status',
        [...systemReport.planItems, ...systemReport.statusItems.map((item) => ({ ...item, label: `Status: ${item.label}` }))].map((item) => [
          item.label,
          String(item.value)
        ]),
        ['Plan or status', 'Accounts']
      )
      addDataTable(
        'Activity Findings',
        systemReport.actionItems.map((item) => [item.label, String(item.value)]),
        ['Action', 'Events']
      )
      addDataTable(
        'Resource Findings',
        systemReport.resourceItems.map((item) => [item.label, String(item.value)]),
        ['Resource', 'Events']
      )
      addDataTable(
        'Heavy Loading Areas',
        systemReport.heavyAreas.map((item) => [item.label, String(item.value)]),
        ['Area', 'Volume']
      )
    }

    const pageCount = doc.getNumberOfPages()
    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      doc.setPage(pageIndex)
      doc.setDrawColor(225, 214, 201)
      doc.line(left, pageHeight - 28, right, pageHeight - 28)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...muted)
      doc.text(`${reportTitle} | Page ${pageIndex} of ${pageCount}`, left, pageHeight - 14)
      doc.text('Employment Portal', right, pageHeight - 14, { align: 'right' })
    }

    doc.save(`reports-${currentTab}-${dateLabel}.pdf`)
  }, [commissionReport.collectedTimeline, commissionReport.rows, currentSummary, currentTab, employeeReport.details, employeeReport.processAgeChart, employeeReport.registrationTrend, employeeReport.returnChart, employeeReport.stageChart, systemReport.actionItems, systemReport.heavyAreas, systemReport.planItems, systemReport.resourceItems, systemReport.roleItems, systemReport.statusItems, userReport.cards])

  return (
    <section className="dashboard-panel reports-page">
      <div className="users-management-header">
        <div>
          <h1>Reports</h1>
          <p className="muted-text">
            Operational reporting across employee flow, commissions, user participation, and system-level platform signals.
          </p>
          <p className="muted-text">
            Some user and system metrics are derived operational signals from currently available employee, audit-log, and subscription data.
          </p>
        </div>
        <div className="employees-header-actions">
          <button type="button" className="btn-secondary" onClick={handleDownloadReport} disabled={loading}>
            Download PDF
          </button>
          <button type="button" className="btn-secondary" onClick={loadReports} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="employee-subtabs" role="tablist" aria-label="Report categories">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-subtab${currentTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setCurrentTab(tab.id)}
            aria-pressed={currentTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="concept-summary-strip">
        {currentSummary.map((item) => (
          <div key={item.label} className="concept-summary-pill">
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </div>
        ))}
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted-text">Loading reports...</p> : null}

      {!loading && currentTab === 'employees' ? (
        <section className="concept-section">
          <h2>Employee Reports</h2>
          <div className="reports-chart-grid">
            <D3StageChart
              title="Employee stage volume"
              subtitle="Current employee flow split across the core lifecycle states."
              data={employeeReport.stageChart}
            />
            <D3DonutChart
              title="Return breakdown"
              subtitle="Returned employees grouped by the reason bucket currently inferred from the data."
              data={employeeReport.returnChart}
              formatter={(value) => `${value}`}
            />
          </div>
          <div className="reports-chart-grid">
            <D3LineChart
              title="Registration trend"
              subtitle="Recent registration volume across the last visible monthly windows."
              data={employeeReport.registrationTrend}
              formatter={(value) => `${value}`}
            />
            <D3HorizontalBarChart
              title="Under-process age buckets"
              subtitle="Active under-process employees grouped by how long they have been sitting in process."
              data={employeeReport.processAgeChart}
              color="#8f5d34"
              formatter={(value) => `${value} employees`}
            />
          </div>
          <div className="reports-grid">
            {employeeReport.details.map((item) => (
              <article key={item.title} className="concept-card">
                <p className="concept-card-kicker">Employees</p>
                <h3>{item.title}</h3>
                <p className="muted-text">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && currentTab === 'commissions' ? (
        <section className="concept-section">
          <h2>Commission Reports</h2>
          <div className="reports-chart-grid">
            <D3LineChart
              title="Collected commission over time"
              subtitle="Settled commission value across the latest recorded month windows."
              data={commissionReport.collectedTimeline}
              formatter={(value) => formatCurrency(value)}
            />
            <D3ScatterChart
              title="Agent score vs participation"
              subtitle="Each point maps an agent by participation rate, commission score, and collected-value size."
              data={commissionReport.performanceScatter}
              xLabel="Participation"
              yLabel="Score"
            />
          </div>
          <div className="reports-chart-grid">
            <D3HorizontalBarChart
              title="Top collected by agent"
              subtitle="Fast ranking view for the highest collected commission totals."
              data={commissionReport.collectedChart}
              formatter={(value) => formatCurrency(value)}
            />
            <D3HorizontalBarChart
              title="Settled cases by agent"
              subtitle="How many employee commission cases each top agent has already settled."
              data={commissionReport.settlementCasesChart}
              color="#8f5d34"
              formatter={(value) => `${value} cases`}
            />
          </div>
          <div className="reports-list">
            {commissionReport.rows.map((row) => (
              <article key={row.agent} className="reports-list-item">
                <div>
                  <h3>{row.agent}</h3>
                  <p className="muted-text">
                    Collected {formatCurrency(row.collected)} | Participation {formatPercent(row.participation)} | Score {row.score}
                  </p>
                </div>
                <div className="reports-inline-metrics">
                  <span>Initiated: {row.initiated}</span>
                  <span>Employed: {row.employed}</span>
                  <span>Returned(discontinued): {row.returnedDiscontinued}</span>
                  <span>Settled cases: {row.settledCases}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && currentTab === 'users' ? (
        <section className="concept-section">
          <h2>User Reports</h2>
          <div className="reports-chart-grid">
            <D3ScatterChart
              title="Participation vs sentiment"
              subtitle="User activity plotted against the current sentiment score derived from chat-like or audit signals."
              data={userReport.participationChart}
              xLabel="Participation entries"
              yLabel="Sentiment"
            />
            <D3HorizontalBarChart
              title="Registration leaderboard"
              subtitle="Users with the strongest employee registration volume."
              data={userReport.registrarChart}
              color="#8f5d34"
              formatter={(value) => `${value} registrations`}
            />
          </div>
          <div className="reports-chart-grid">
            <D3HorizontalBarChart
              title="Document attachment activity"
              subtitle="Proxy volume of uploaded employee documents by registrar."
              data={userReport.attachmentChart}
              color="#7e5230"
              formatter={(value) => `${value} documents`}
            />
            <D3HorizontalBarChart
              title="Agent favourites"
              subtitle="Organization-side users whose employees are picked most often by agents."
              data={userReport.favoriteChart}
              color="#9f6a3b"
              formatter={(value) => `${value} selections`}
            />
          </div>
          <div className="reports-grid">
            {userReport.cards.map((card) => (
              <article key={card.title} className="concept-card">
                <p className="concept-card-kicker">Users</p>
                <h3>{card.title}</h3>
                <p className="muted-text reports-card-note">{card.note}</p>
                <div className="reports-rank-list">
                  {card.items.length === 0 ? (
                    <p className="muted-text">No signal available yet.</p>
                  ) : (
                    card.items.map((item) => (
                      <div key={item.label} className="reports-rank-item">
                        <strong>{item.label}</strong>
                        <span>{item.value}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && currentTab === 'system' ? (
        <section className="concept-section">
          <h2>System Reports</h2>
          <div className="reports-chart-grid">
            <D3DonutChart
              title="Role distribution"
              subtitle="Current user-role footprint across the platform."
              data={systemReport.roleChart}
              formatter={(value) => `${value} users`}
            />
            <D3HorizontalBarChart
              title="Heavy loading areas"
              subtitle="Operational areas currently carrying the most system load."
              data={systemReport.heavyChart}
              color="#8f5d34"
              formatter={(value) => `${value}`}
            />
          </div>
          <div className="reports-grid">
            <article className="concept-card">
              <p className="concept-card-kicker">System</p>
              <h3>User management posture</h3>
              <div className="reports-rank-list">
                {systemReport.roleItems.map((item) => (
                  <div key={item.label} className="reports-rank-item">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="concept-card">
              <p className="concept-card-kicker">System</p>
              <h3>Plans and subscriptions</h3>
              <div className="reports-rank-list">
                {systemReport.planItems.map((item) => (
                  <div key={item.label} className="reports-rank-item">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
                {systemReport.statusItems.map((item) => (
                  <div key={`status-${item.label}`} className="reports-rank-item">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="concept-card">
              <p className="concept-card-kicker">System</p>
              <h3>Activity findings</h3>
              <div className="reports-rank-list">
                {systemReport.actionItems.map((item) => (
                  <div key={item.label} className="reports-rank-item">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="concept-card">
              <p className="concept-card-kicker">System</p>
              <h3>Heavy loading areas</h3>
              <div className="reports-rank-list">
                {systemReport.heavyAreas.map((item) => (
                  <div key={item.label} className="reports-rank-item">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}
    </section>
  )
}

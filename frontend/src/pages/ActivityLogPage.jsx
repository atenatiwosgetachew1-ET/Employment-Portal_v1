import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import * as auditLogService from '../services/auditLogService'
import { DataTable, FilterBar } from '../components/common'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function ActivityLogPage() {
  const { user: currentUser } = useAuth()
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  const canView =
    currentUser?.feature_flags?.audit_log_enabled &&
    currentUser?.permissions?.includes('audit.view')

  const load = useCallback(async (event) => {
    if (event?.preventDefault) {
      window.location.reload()
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await auditLogService.fetchAuditLogs({ page, q: query })
      setData(res)
    } catch (e) {
      setError(e.message || 'Failed to load activity log')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [page, query])

  useEffect(() => {
    if (canView) load()
    else setLoading(false)
  }, [canView, load])

  const handleSearchSubmit = () => {
    setPage(1)
    setQuery(searchInput.trim())
  }

  const columns = useMemo(() => [
    { key: 'created_at', label: 'When', className: 'nowrap', render: (row) => formatWhen(row.created_at) },
    { key: 'actor_username', label: 'Actor', render: (row) => row.actor_username || '—' },
    { key: 'action', label: 'Action', render: (row) => <code className="activity-code">{row.action}</code> },
    {
      key: 'resource',
      label: 'Resource',
      render: (row) => `${row.resource_type || '—'}${row.resource_id != null ? ` #${row.resource_id}` : ''}`
    },
    { key: 'summary', label: 'Summary', className: 'activity-summary', render: (row) => row.summary || '—' }
  ], [])

  if (!canView) {
    return <Navigate to="/dashboard" replace />
  }

  const results = data?.results ?? []
  const total = data?.count ?? results.length
  const hasNext = Boolean(data?.next)
  const hasPrev = Boolean(data?.previous)

  return (
    <section className="dashboard-panel activity-log-page">
      <div className="activity-log-header">
        <div>
          <h1>Activity log</h1>
          <p className="muted-text">
            Audit trail of sign-ins and user management actions. Server logs also record these
            events (see logging configuration).
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <FilterBar
        className="form-grid form-grid--align-end"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Action, actor, resource, or summary"
        onSubmit={handleSearchSubmit}
        submitLabel="Apply search"
        loading={loading}
      />

      {error && <p className="error-message">{error}</p>}

      <DataTable
        columns={columns}
        data={results}
        loading={loading}
        loadingText="Loading…"
        emptyText="No activity logs found."
        totalCount={total}
        page={page}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={setPage}
        className="activity-log-table-wrap"
        tableClassName="users-table activity-log-table"
      />
    </section>
  )
}
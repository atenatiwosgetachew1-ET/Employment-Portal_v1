import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import * as auditLogService from '../services/auditLogService'

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

  const load = useCallback(async () => {
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

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    setQuery(searchInput.trim())
  }

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

      <form
        className="form-grid form-grid--align-end"
        onSubmit={handleSearchSubmit}
      >
        <label>
          Search
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Action, actor, resource, or summary"
          />
        </label>
        <button type="submit" className="btn-secondary">
          Apply search
        </button>
      </form>

      {error && <p className="error-message">{error}</p>}

      {loading ? (
        <p className="muted-text">Loading…</p>
      ) : (
        <>
          <p className="muted-text activity-log-meta">
            Showing {results.length} of {total} entries (newest first).
          </p>
          <div className="table-scroll activity-log-table-wrap">
            <table className="users-table activity-log-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.id}>
                    <td className="nowrap">{formatWhen(row.created_at)}</td>
                    <td>{row.actor_username || '—'}</td>
                    <td>
                      <code className="activity-code">{row.action}</code>
                    </td>
                    <td>
                      {row.resource_type || '—'}
                      {row.resource_id != null ? ` #${row.resource_id}` : ''}
                    </td>
                    <td className="activity-summary">{row.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="activity-log-pagination">
            <button
              type="button"
              className="btn-secondary"
              disabled={!hasPrev || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="muted-text">Page {page}</span>
            <button
              type="button"
              className="btn-secondary"
              disabled={!hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  )
}

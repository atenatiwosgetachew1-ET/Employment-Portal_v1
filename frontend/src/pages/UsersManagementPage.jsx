import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import * as usersService from '../services/usersService'

const ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Super admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'customer', label: 'Customer' }
]

function rolesForManager(currentUser) {
  if (currentUser?.role === 'superadmin') return ROLE_OPTIONS
  return ROLE_OPTIONS.filter((r) => ['staff', 'customer'].includes(r.value))
}

const emptyForm = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'customer',
  is_active: true
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function canManageUsers(user) {
  const permissions = user?.permissions || []
  const features = user?.feature_flags || {}
  return (
    features.users_management_enabled &&
    (permissions.includes('users.manage_all') || permissions.includes('users.manage_limited'))
  )
}

export default function UsersManagementPage() {
  const { user: currentUser } = useAuth()
  const [usersData, setUsersData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [rowBusy, setRowBusy] = useState({})
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ q: '', role: '', isActive: '' })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await usersService.fetchUsers({
        page,
        q: filters.q,
        role: filters.role,
        isActive: filters.isActive
      })
      setUsersData(data)
    } catch (e) {
      setError(e.message || 'Failed to load users')
      setUsersData(null)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    if (canManageUsers(currentUser)) {
      loadUsers()
    } else {
      setLoading(false)
    }
  }, [currentUser, loadUsers])

  const setBusy = (id, key, value) => {
    setRowBusy((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value }
    }))
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        role: form.role,
        is_active: form.is_active
      }
      await usersService.createUser(payload)
      setForm(emptyForm)
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Could not create user')
    } finally {
      setCreating(false)
    }
  }

  const handleRoleChange = async (row, newRole) => {
    setBusy(row.id, 'role', true)
    try {
      await usersService.patchUser(row.id, { role: newRole })
      setUsersData((prev) =>
        prev
          ? {
              ...prev,
              results: prev.results.map((u) => (u.id === row.id ? { ...u, role: newRole } : u))
            }
          : prev
      )
    } catch (err) {
      setError(err.message || 'Could not update role')
    } finally {
      setBusy(row.id, 'role', false)
    }
  }

  const handleActiveToggle = async (row, isActive) => {
    setBusy(row.id, 'active', true)
    try {
      await usersService.patchUser(row.id, { is_active: isActive })
      setUsersData((prev) =>
        prev
          ? {
              ...prev,
              results: prev.results.map((u) =>
                u.id === row.id ? { ...u, is_active: isActive } : u
              )
            }
          : prev
      )
    } catch (err) {
      setError(err.message || 'Could not update status')
    } finally {
      setBusy(row.id, 'active', false)
    }
  }

  const handleDelete = async (row) => {
    if (
      !window.confirm(
        `Remove user "${row.username}"? This cannot be undone.`
      )
    ) {
      return
    }
    setBusy(row.id, 'delete', true)
    try {
      await usersService.deleteUser(row.id)
      setUsersData((prev) =>
        prev
          ? {
              ...prev,
              count: Math.max(0, prev.count - 1),
              results: prev.results.filter((u) => u.id !== row.id)
            }
          : prev
      )
    } catch (err) {
      setError(err.message || 'Could not delete user')
    } finally {
      setBusy(row.id, 'delete', false)
    }
  }

  const handlePasswordReset = async (row) => {
    const newPassword = window.prompt(`Enter a new password for "${row.username}" (minimum 8 characters).`)
    if (newPassword === null) return
    const trimmed = newPassword.trim()
    if (trimmed.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    const confirmPassword = window.prompt(`Confirm the new password for "${row.username}".`)
    if (confirmPassword === null) return

    setBusy(row.id, 'password', true)
    setError('')
    try {
      await usersService.resetUserPassword(row.id, trimmed, confirmPassword)
    } catch (err) {
      setError(err.message || 'Could not reset password')
    } finally {
      setBusy(row.id, 'password', false)
    }
  }

  if (!canManageUsers(currentUser)) {
    return <Navigate to="/dashboard" replace />
  }

  const roleSelectOptions = rolesForManager(currentUser)
  const users = usersData?.results ?? []
  const total = usersData?.count ?? users.length
  const hasNext = Boolean(usersData?.next)
  const hasPrev = Boolean(usersData?.previous)
  const seatUsage = currentUser?.seat_usage || {}
  const seatLimits = currentUser?.seat_limits || {}
  const readOnly = Boolean(currentUser?.is_read_only || currentUser?.is_suspended)

  const handleFilterSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    setFilters((prev) => ({ ...prev, q: searchInput.trim() }))
  }

  return (
    <section className="dashboard-panel users-management">
      <div className="users-management-header">
        <div>
          <h1>Users management</h1>
          <p className="muted-text">
            Super admins manage every account including admins. Admins create and approve staff and
            customer accounts (activate or suspend access below).
          </p>
          <p className="muted-text">
            Seats: superadmins {seatUsage.superadmin ?? 0}/{seatLimits.superadmin ?? 0}, admins{' '}
            {seatUsage.admin ?? 0}/{seatLimits.admin ?? 0}, staff {seatUsage.staff ?? 0}/
            {seatLimits.staff ?? 0}, customers {seatUsage.customer ?? 0}/
            {seatLimits.customer ?? 0}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={loadUsers}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <form
        className="form-grid"
        onSubmit={handleFilterSubmit}
        style={{ marginBottom: 16, alignItems: 'end' }}
      >
        <label>
          Search
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Username, email, name, or phone"
          />
        </label>
        <label>
          Role
          <select
            value={filters.role}
            onChange={(e) => {
              setPage(1)
              setFilters((prev) => ({ ...prev, role: e.target.value }))
            }}
          >
            <option value="">All roles</option>
            {roleSelectOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.isActive}
            onChange={(e) => {
              setPage(1)
              setFilters((prev) => ({ ...prev, isActive: e.target.value }))
            }}
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>
        </label>
        <button type="submit" className="btn-secondary">
          Apply filters
        </button>
      </form>

      {error && (
        <p className="error-message" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      <div className="users-grid">
        <form className="user-create-card" onSubmit={handleCreate}>
          <h2>Create user</h2>
          {readOnly && (
            <p className="muted-text">User changes are disabled while this organization is restricted.</p>
          )}
          <div className="form-grid">
            <label>
              Username *
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
                autoComplete="off"
              />
            </label>
            <label>
              Email *
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                autoComplete="off"
                required
              />
            </label>
            <label>
              First name
              <input
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </label>
            <label>
              Last name
              <input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label>
              Role *
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                {roleSelectOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active account (approved)
            </label>
          </div>
          <p className="muted-text" style={{ marginBottom: 12 }}>
            New users receive an email to set their password. If Google sign-in is enabled, they can
            also use the same email with Google.
          </p>
          <button type="submit" disabled={creating || readOnly}>
            {creating ? 'Creating…' : 'Create user'}
          </button>
        </form>

        <div className="users-table-wrap">
          <h2>All users</h2>
          {!loading && (
            <p className="muted-text" style={{ marginBottom: 12 }}>
              Showing {users.length} of {total} users.
            </p>
          )}
          {loading ? (
            <p className="muted-text">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="muted-text">No users found.</p>
          ) : (
            <div className="table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Active</th>
                    <th>Joined</th>
                    <th>Last login</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => {
                    const busy = rowBusy[row.id] || {}
                    const isSelf = row.id === currentUser?.id
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.username}</strong>
                          {row.is_superuser && (
                            <span className="badge badge-super">django superuser</span>
                          )}
                        </td>
                        <td>{row.email || '—'}</td>
                        <td>
                          {[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td>{row.phone || '—'}</td>
                        <td>
                          <select
                            value={row.role}
                            disabled={busy.role || readOnly}
                            onChange={(e) => handleRoleChange(row, e.target.value)}
                          >
                            {roleSelectOptions.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label className="toggle-cell">
                            <input
                              type="checkbox"
                              checked={row.is_active}
                              disabled={busy.active || isSelf || readOnly}
                              onChange={(e) => handleActiveToggle(row, e.target.checked)}
                              title={isSelf ? 'Cannot suspend your own session here' : ''}
                            />
                            <span>{row.is_active ? 'Active' : 'Suspended'}</span>
                          </label>
                        </td>
                        <td className="nowrap">{formatDate(row.date_joined)}</td>
                        <td className="nowrap">{formatDate(row.last_login)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busy.password || isSelf || readOnly}
                            onClick={() => handlePasswordReset(row)}
                            title={isSelf ? 'Use the forgot-password flow for your own account' : 'Reset password'}
                            style={{ marginRight: 8 }}
                          >
                            {busy.password ? 'Resetting...' : 'Reset password'}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            disabled={busy.delete || isSelf || readOnly}
                            onClick={() => handleDelete(row)}
                            title={isSelf ? 'Cannot delete yourself' : 'Remove user'}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && users.length > 0 && (
            <div className="activity-log-pagination">
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="muted-text">Page {page}</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUiFeedback } from '../context/UiFeedbackContext'
import { RESIDENCE_COUNTRY_OPTIONS } from '../constants/employeeOptions'
import * as usersService from '../services/usersService'

const ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Super admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'customer', label: 'Agent' }
]

const STAFF_ROLE_OPTIONS = [
  { label: 'Reception', level: 1 },
  { label: 'Secretary', level: 2 },
  { label: 'IT', level: 3 },
  { label: 'Operations', level: 4 },
  { label: 'Supervisor', level: 5 }
]

const USER_VIEW_TABS = [
  { id: 'list', label: 'Users list' },
  { id: 'register', label: 'Register user' }
]

function getStaffLevelForRole(roleLabel) {
  return STAFF_ROLE_OPTIONS.find((option) => option.label === roleLabel)?.level || 1
}

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
  agent_country: '',
  agent_commission: '',
  agent_salary: '',
  staff_side: '',
  staff_level_label: '',
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
  const { showToast, confirm } = useUiFeedback()
  const [usersData, setUsersData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingUserId, setEditingUserId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [rowBusy, setRowBusy] = useState({})
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ q: '', role: '', isActive: '' })
  const [staffSideOptions, setStaffSideOptions] = useState([])
  const [currentView, setCurrentView] = useState('list')

  const loadStaffSideOptions = useCallback(async () => {
    try {
      const options = await usersService.fetchStaffSideOptions()
      setStaffSideOptions(options)
    } catch {
      setStaffSideOptions([])
    }
  }, [])

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
      loadStaffSideOptions()
    } else {
      setLoading(false)
    }
  }, [currentUser, loadUsers, loadStaffSideOptions])

  useEffect(() => {
    if (notice) showToast(notice, { tone: 'success' })
  }, [notice, showToast])

  useEffect(() => {
    if (error) showToast(error, { tone: 'danger', title: 'Action failed' })
  }, [error, showToast])

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
    setNotice('')
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        agent_country: form.role === 'customer' ? form.agent_country.trim() : '',
        agent_commission:
          form.role === 'customer' && form.agent_commission !== ''
            ? form.agent_commission
            : null,
        agent_salary:
          form.role === 'customer' && form.agent_salary !== ''
            ? form.agent_salary
            : null,
        staff_side: form.role === 'staff' ? form.staff_side.trim() : '',
        staff_level: form.role === 'staff' ? getStaffLevelForRole(form.staff_level_label) : 1,
        staff_level_label: form.role === 'staff' ? form.staff_level_label.trim() : '',
        role: form.role,
        is_active: form.is_active
      }
      const result = editingUserId
        ? await usersService.patchUser(editingUserId, {
            email: payload.email,
            first_name: payload.first_name,
            last_name: payload.last_name,
            is_active: payload.is_active,
            role: payload.role,
            phone: payload.phone,
            agent_country: payload.agent_country,
            agent_commission: payload.agent_commission,
            agent_salary: payload.agent_salary,
            staff_side: payload.staff_side,
            staff_level: payload.staff_level,
            staff_level_label: payload.staff_level_label
          })
        : await usersService.createUser(payload)
      setForm(emptyForm)
      setEditingUserId(null)
      if (result.warning) {
        setNotice(result.warning)
      } else if (editingUserId) {
        setNotice('User updated successfully.')
      } else {
        setNotice('User created successfully.')
      }
      setCurrentView('list')
      await Promise.all([loadUsers(), loadStaffSideOptions()])
    } catch (err) {
      setError(err.message || 'Could not create user')
    } finally {
      setCreating(false)
    }
  }

  const handleRoleChange = async (row, newRole) => {
    setBusy(row.id, 'role', true)
    try {
      const payload = { role: newRole }
      if (newRole === 'staff') {
        payload.staff_side = row.staff_side || currentUser?.organization?.name || ''
        payload.staff_level_label = row.staff_level_label || STAFF_ROLE_OPTIONS[0].label
        payload.staff_level = getStaffLevelForRole(payload.staff_level_label)
      }
      await usersService.patchUser(row.id, payload)
      setUsersData((prev) =>
        prev
          ? {
              ...prev,
              results: prev.results.map((u) =>
                u.id === row.id
                  ? {
                      ...u,
                      role: newRole,
                      staff_side: newRole === 'staff' ? payload.staff_side : '',
                      staff_level: newRole === 'staff' ? payload.staff_level : 1,
                      staff_level_label: newRole === 'staff' ? payload.staff_level_label : ''
                    }
                  : u
              )
            }
          : prev
      )
      await loadStaffSideOptions()
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
    const confirmed = await confirm({
      title: 'Remove user',
      message: `Remove user "${row.username}"? This cannot be undone.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      tone: 'danger'
    })
    if (!confirmed) {
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
      await loadStaffSideOptions()
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
    setNotice('')
    try {
      await usersService.resetUserPassword(row.id, trimmed, confirmPassword)
    } catch (err) {
      setError(err.message || 'Could not reset password')
    } finally {
      setBusy(row.id, 'password', false)
    }
  }

  const handleStaffMetaUpdate = async (row) => {
    setError('')
    setNotice('')
    setEditingUserId(row.id)
    setCurrentView('register')
    setForm({
      username: row.username || '',
      email: row.email || '',
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      phone: row.phone || '',
      agent_country: row.agent_country || '',
      agent_commission:
        row.agent_commission === null || row.agent_commission === undefined
          ? ''
          : String(row.agent_commission),
      agent_salary:
        row.agent_salary === null || row.agent_salary === undefined ? '' : String(row.agent_salary),
      staff_side: row.staff_side || currentUser?.organization?.name || '',
      staff_level_label: row.staff_level_label || STAFF_ROLE_OPTIONS[0].label,
      role: row.role || 'staff',
      is_active: Boolean(row.is_active)
    })
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
            agent accounts (activate or suspend access below).
          </p>
          <p className="muted-text">
            Seats: superadmins {seatUsage.superadmin ?? 0}/{seatLimits.superadmin ?? 0}, admins{' '}
            {seatUsage.admin ?? 0}/{seatLimits.admin ?? 0}, staff {seatUsage.staff ?? 0}/
            {seatLimits.staff ?? 0}, agents {seatUsage.customer ?? 0}/
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

      <div className="employee-subtabs" role="tablist" aria-label="User management views">
        {USER_VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-subtab${currentView === tab.id ? ' is-active' : ''}`}
            onClick={() => setCurrentView(tab.id)}
            aria-selected={currentView === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error-message" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="muted-text" style={{ marginBottom: 16 }}>
          {notice}
        </p>
      )}
      {editingUserId && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setEditingUserId(null)
              setCurrentView('list')
              setForm(emptyForm)
              setError('')
              setNotice('')
            }}
          >
            Cancel edit
          </button>
        </div>
      )}

      <div className="users-grid">
        {currentView === 'register' ? (
        <form className="user-create-card" onSubmit={handleCreate}>
          <h2>{editingUserId ? 'Edit user' : 'Create user'}</h2>
          {editingUserId && (
            <p className="muted-text">You are editing an existing user. Submit this form to save changes.</p>
          )}
          {readOnly && (
            <p className="muted-text">User changes are disabled while this organization is restricted.</p>
          )}
          <div className="users-form-grid">
            <label>
              Username *
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
                autoComplete="off"
                disabled={Boolean(editingUserId)}
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
            {form.role === 'customer' && (
              <>
                <label>
                  Country *
                  <select
                    value={form.agent_country}
                    onChange={(e) => setForm((f) => ({ ...f, agent_country: e.target.value }))}
                    required
                  >
                    <option value="">Select country</option>
                    {RESIDENCE_COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Commission
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.agent_commission}
                    onChange={(e) => setForm((f) => ({ ...f, agent_commission: e.target.value }))}
                  />
                </label>
                <label>
                  Salary *
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.agent_salary}
                    onChange={(e) => setForm((f) => ({ ...f, agent_salary: e.target.value }))}
                    required
                  />
                </label>
              </>
            )}
            {form.role === 'staff' && (
              <>
                <label>
                  Side *
                  <select
                    value={form.staff_side}
                    onChange={(e) => setForm((f) => ({ ...f, staff_side: e.target.value }))}
                    required
                  >
                    <option value="">Select side</option>
                    {staffSideOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Level
                  <input type="text" value={getStaffLevelForRole(form.staff_level_label)} readOnly />
                </label>
                <label>
                  Staff role *
                  <select
                    value={form.staff_level_label}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, staff_level_label: e.target.value }))
                    }
                    required
                  >
                    <option value="">Select staff role</option>
                    {STAFF_ROLE_OPTIONS.map((option) => (
                      <option key={option.label} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              Role *
              <select
                value={form.role}
                disabled={Boolean(editingUserId)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    role: e.target.value,
                    agent_country: e.target.value === 'customer' ? f.agent_country : '',
                    agent_commission: e.target.value === 'customer' ? f.agent_commission : '',
                    agent_salary: e.target.value === 'customer' ? f.agent_salary : '',
                    staff_side:
                      e.target.value === 'staff'
                        ? f.staff_side || currentUser?.organization?.name || ''
                        : '',
                    staff_level_label:
                      e.target.value === 'staff'
                        ? f.staff_level_label || STAFF_ROLE_OPTIONS[0].label
                        : ''
                  }))
                }
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
          {form.role === 'staff' && (
            <p className="muted-text" style={{ marginBottom: 12 }}>
              Set side to your organization name for home staff, or to an agent name for away
              staff. Roles map to fixed authority levels: Reception 1, Secretary 2, IT 3,
              Operations 4, Supervisor 5.
            </p>
          )}
          <p className="muted-text" style={{ marginBottom: 12 }}>
            New users receive an email to set their password. If Google sign-in is enabled, they can
            also use the same email with Google.
          </p>
          <button type="submit" disabled={creating || readOnly}>
            {creating ? (editingUserId ? 'Updating...' : 'Creating...') : editingUserId ? 'Update user' : 'Create user'}
          </button>
        </form>
        ) : null}

        {currentView === 'list' ? (
        <div className="users-table-wrap">
          <form className="users-filter-grid" onSubmit={handleFilterSubmit}>
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
            <button type="submit" className="btn-secondary users-filter-submit">
              Apply filters
            </button>
          </form>
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
                    <th>Side</th>
                    <th>Level</th>
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
                          {row.role === 'staff' ? row.staff_side || '—' : '—'}
                        </td>
                        <td>
                          {row.role === 'staff'
                            ? `L${row.staff_level || 1}${row.staff_level_label ? ` - ${row.staff_level_label}` : ''}`
                            : '—'}
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
                        <td className="users-actions-cell">
                          {row.role === 'staff' && (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={busy.staffMeta || readOnly}
                              onClick={() => handleStaffMetaUpdate(row)}
                            >
                              {busy.staffMeta ? 'Saving...' : 'Edit staff'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busy.password || isSelf || readOnly}
                            onClick={() => handlePasswordReset(row)}
                            title={isSelf ? 'Use the forgot-password flow for your own account' : 'Reset password'}
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
        ) : null}
      </div>
    </section>
  )
}

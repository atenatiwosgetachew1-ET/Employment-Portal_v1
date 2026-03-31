import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import NotificationBell from '../notifications/NotificationBell'

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const permissions = user?.permissions || []
  const features = user?.feature_flags || {}
  const organization = user?.organization
  const subscription = user?.subscription
  const canManageUsers =
    features.users_management_enabled &&
    (permissions.includes('users.manage_all') || permissions.includes('users.manage_limited'))
  const canViewAudit =
    features.audit_log_enabled && permissions.includes('audit.view')

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', end: true },
    ...(canManageUsers
      ? [{ to: '/dashboard/users', label: 'Users management', end: false }]
      : []),
    { to: '/dashboard/settings', label: 'Settings', end: false },
    ...(canViewAudit
      ? [{ to: '/dashboard/activity', label: 'Activity log', end: false }]
      : [])
  ]

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Main navigation">
        <div className="dashboard-brand">Employment Portal</div>
        <nav className="dashboard-nav">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `dashboard-nav-link${isActive ? ' is-active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-left">
            <NotificationBell />
            <div>
              <p className="dashboard-header-user">
                Signed in as{' '}
                <strong>
                  {[user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
                    user?.username ||
                    'User'}
                </strong>
                {user?.username &&
                  [user?.first_name, user?.last_name].filter(Boolean).length > 0 && (
                    <span className="dashboard-header-username"> ({user.username})</span>
                  )}
              </p>
              {organization && (
                <p className="muted-text" style={{ marginTop: 4 }}>
                  {organization.name}
                  {subscription?.plan_name ? ` • ${subscription.plan_name}` : ''}
                  {subscription?.status ? ` • ${subscription.status}` : ''}
                </p>
              )}
            </div>
          </div>
          <button type="button" className="dashboard-logout" onClick={handleLogout}>
            Logout
          </button>
        </header>

        <div className="dashboard-content">
          {user?.is_suspended && (
            <div className="dashboard-panel" style={{ marginBottom: 16 }}>
              <strong>Organization suspended.</strong>
              <p className="muted-text" style={{ marginTop: 8 }}>
                Your company needs to resolve licensing before this Employment Portal can be used.
              </p>
            </div>
          )}
          {!user?.is_suspended && user?.is_read_only && (
            <div className="dashboard-panel" style={{ marginBottom: 16 }}>
              <strong>Read-only mode.</strong>
              <p className="muted-text" style={{ marginTop: 8 }}>
                This Employment Portal is active for viewing only because the organization
                subscription is cancelled or restricted.
              </p>
            </div>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
